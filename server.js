require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const AdmZip  = require('adm-zip');
const yauzl   = require('yauzl');
const iconv   = require('iconv-lite');
const OpenCC  = require('opencc-js');
const { registerMediaRoutes } = require('./routes/mediaRoutes');

const novelScToTc = OpenCC.Converter({ from: 'cn', to: 'tw' });
const novelTcToSc = OpenCC.Converter({ from: 'tw', to: 'cn' });

const app  = express();
const PORT = process.env.PORT || 3000;

const AUTH_USERNAME = String(process.env.READER_LOGIN_USER || process.env.READER_USERNAME || 'admin').trim() || 'admin';
const AUTH_PASSWORD = String(process.env.READER_LOGIN_PASS || process.env.READER_PASSWORD || 'Gth220131');
const AUTH_COOKIE_NAME = 'reader_session';
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const authSessions = new Map();

// ── Directories ───────────────────────────────────────────────────────────────
const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const NOVELS_DIR   = path.join(__dirname, 'novels');
const DATA_FILE    = path.join(__dirname, 'data', 'mangas.json');
const NOVELS_FILE  = path.join(__dirname, 'data', 'novels.json');

[UPLOADS_DIR, NOVELS_DIR, path.join(__dirname, 'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── DB helpers ────────────────────────────────────────────────────────────────
let _dbCache = null, _ndbCache = null;
function loadDB()      { if (!_dbCache)  { try { _dbCache  = JSON.parse(fs.readFileSync(DATA_FILE,   'utf8')); } catch { _dbCache  = { mangas: [] }; } } return _dbCache; }
function saveDB(db)    { _dbCache  = db; fs.writeFileSync(DATA_FILE,   JSON.stringify(db,   null, 2)); }
function loadNDB()     { if (!_ndbCache) { try { _ndbCache = JSON.parse(fs.readFileSync(NOVELS_FILE, 'utf8')); } catch { _ndbCache = { novels: [] }; } } return _ndbCache; }
function saveNDB(db)   { _ndbCache = db; fs.writeFileSync(NOVELS_FILE, JSON.stringify(db,   null, 2)); }

function computeSha256ByFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = require('crypto').createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function safeFileName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
}

function normalizeUploadFileName(name) {
  const raw = String(name || 'file');
  if (!raw) return 'file';
  if (/^[\x00-\x7F]+$/.test(raw)) return raw;

  let converted = raw;
  try {
    converted = Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
  if (!converted || converted.includes('�')) return raw;

  const rawCJK = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
  const cvtCJK = (converted.match(/[\u4e00-\u9fff]/g) || []).length;
  const rawMojibake = (raw.match(/[ÃÂÐÕÆØÅæçéèêëìíîïòóôõöùúûüñ]/g) || []).length;
  const cvtMojibake = (converted.match(/[ÃÂÐÕÆØÅæçéèêëìíîïòóôõöùúûüñ]/g) || []).length;

  if (cvtCJK > rawCJK || cvtMojibake < rawMojibake) return converted;
  return raw;
}

function sanitizeForHeaderName(name) {
  const normalized = String(name || 'file').normalize('NFC');
  return normalized
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .trim() || 'file';
}

function encodeRFC5987(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function setAttachmentHeaders(res, fileName) {
  const cleanedName = safeFileName(sanitizeForHeaderName(fileName));
  const asciiFallback = (cleanedName.replace(/[^\x20-\x7E]/g, '_') || 'download.bin');
  let encoded = encodeRFC5987(cleanedName);
  if (!encoded) encoded = encodeRFC5987(asciiFallback);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
}

function parseTags(input) {
  if (input === undefined || input === null || input === '') return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return input.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeFavoriteCategory(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  return value.slice(0, 40);
}

function parseMultiQueryValues(input) {
  if (input === undefined || input === null || input === '') return [];
  if (Array.isArray(input)) {
    return input
      .flatMap(v => String(v || '').split(','))
      .map(v => v.trim())
      .filter(Boolean);
  }
  return String(input)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeCompareTitle(title) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\[【（(][^\]】）)]*[\]】）)]/g, ' ')
    .replace(/[\s\-_.:：·,，!！?？'"“”‘’`~@#$%^&*+=|\\/<>《》「」『』]+/g, '')
    .trim();
}

function toBigrams(text) {
  const input = normalizeCompareTitle(text);
  if (!input) return [];
  if (input.length === 1) return [input];
  const grams = [];
  for (let i = 0; i < input.length - 1; i += 1) grams.push(input.slice(i, i + 2));
  return grams;
}

function diceSimilarity(a, b) {
  const ga = toBigrams(a);
  const gb = toBigrams(b);
  if (!ga.length || !gb.length) return 0;
  const map = new Map();
  ga.forEach(x => map.set(x, (map.get(x) || 0) + 1));
  let overlap = 0;
  gb.forEach(x => {
    const count = map.get(x) || 0;
    if (count > 0) {
      overlap += 1;
      map.set(x, count - 1);
    }
  });
  return (2 * overlap) / (ga.length + gb.length);
}

function cnNumToInt(raw) {
  const str = String(raw || '').trim();
  if (!str) return NaN;
  if (/^\d+$/.test(str)) return Number(str);
  const dict = { 零:0, 〇:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
  const unit = { 十:10, 百:100, 千:1000, 万:10000 };
  let result = 0;
  let section = 0;
  let number = 0;
  for (const ch of str) {
    if (dict[ch] !== undefined) {
      number = dict[ch];
      continue;
    }
    if (unit[ch]) {
      const u = unit[ch];
      if (u === 10000) {
        section = (section + (number || 0)) * u;
        result += section;
        section = 0;
      } else {
        section += (number || 1) * u;
      }
      number = 0;
    }
  }
  return result + section + number;
}

function inferSeriesMetaFromTitle(title) {
  const input = String(title || '').trim();
  if (!input) return { seriesName: '', chapterNo: null, seriesKey: '' };

  const patterns = [
    /^(.*?)[\s\-—_:：·]*第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*(话|章|卷|回|集|册|篇)\s*$/i,
    /^(.*?)[\s\-—_:：·]*(?:ch(?:apter)?\.?|ep\.?|vol\.?|no\.?)\s*([\d]+)\s*$/i,
    /^(.*?)[\s\-—_:：·]*#\s*([\d]+)\s*$/i,
    /^(.*?)[\s\-—_:：·]+([\d]{1,4})\s*$/i
  ];

  for (const re of patterns) {
    const m = input.match(re);
    if (!m) continue;
    const base = String(m[1] || '').replace(/[\s\-—_:：·]+$/g, '').trim();
    const chapterRaw = m[2] || '';
    const chapterNo = /^\d+$/.test(chapterRaw) ? Number(chapterRaw) : cnNumToInt(chapterRaw);
    if (!base || !Number.isFinite(chapterNo) || chapterNo <= 0) continue;
    return {
      seriesName: base,
      chapterNo,
      seriesKey: normalizeCompareTitle(base)
    };
  }

  return { seriesName: '', chapterNo: null, seriesKey: '' };
}

function buildSeriesSuggestions(mangas) {
  const grouped = new Map();
  mangas.forEach(m => {
    const inferred = inferSeriesMetaFromTitle(m.title);
    if (!inferred.seriesKey || !Number.isFinite(inferred.chapterNo)) return;
    if (!grouped.has(inferred.seriesKey)) grouped.set(inferred.seriesKey, { seriesName: inferred.seriesName, items: [] });
    grouped.get(inferred.seriesKey).items.push({
      id: m.id,
      title: m.title,
      chapterNo: inferred.chapterNo
    });
  });

  const suggestions = [];
  grouped.forEach(({ seriesName, items }, key) => {
    const sorted = [...items].sort((a, b) => a.chapterNo - b.chapterNo || a.title.localeCompare(b.title));
    let bucket = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      if (!bucket.length) {
        bucket.push(current);
        continue;
      }
      const prev = bucket[bucket.length - 1];
      if (current.chapterNo === prev.chapterNo) continue;
      if (current.chapterNo === prev.chapterNo + 1) {
        bucket.push(current);
      } else {
        if (bucket.length >= 2) {
          suggestions.push({
            key,
            seriesName,
            chapterStart: bucket[0].chapterNo,
            chapterEnd: bucket[bucket.length - 1].chapterNo,
            mangaIds: bucket.map(x => x.id),
            items: bucket
          });
        }
        bucket = [current];
      }
    }
    if (bucket.length >= 2) {
      suggestions.push({
        key,
        seriesName,
        chapterStart: bucket[0].chapterNo,
        chapterEnd: bucket[bucket.length - 1].chapterNo,
        mangaIds: bucket.map(x => x.id),
        items: bucket
      });
    }
  });

  return suggestions.sort((a, b) => (b.items.length - a.items.length) || a.seriesName.localeCompare(b.seriesName));
}

function buildSeriesCollection(mangas) {
  const grouped = new Map();
  mangas.forEach(m => {
    const seriesName = String(m.seriesName || '').trim();
    if (!seriesName) return;
    const key = m.seriesId ? `id:${m.seriesId}` : `name:${normalizeCompareTitle(seriesName)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        seriesId: m.seriesId || '',
        seriesName,
        seriesCreatedAt: '',
        seriesUpdatedAt: '',
        seriesViewedAt: '',
        count: 0,
        chapterMin: null,
        chapterMax: null
      });
    }
    const target = grouped.get(key);
    target.count += 1;
    const createdAtTs = new Date(m.seriesCreatedAt || 0).getTime();
    if (Number.isFinite(createdAtTs) && createdAtTs > 0) {
      const currentTs = new Date(target.seriesCreatedAt || 0).getTime();
      if (!target.seriesCreatedAt || !Number.isFinite(currentTs) || currentTs <= 0 || createdAtTs < currentTs) {
        target.seriesCreatedAt = m.seriesCreatedAt;
      }
    }
    const updatedAtTs = new Date(m.seriesUpdatedAt || 0).getTime();
    if (Number.isFinite(updatedAtTs) && updatedAtTs > 0) {
      const currentTs = new Date(target.seriesUpdatedAt || 0).getTime();
      if (!target.seriesUpdatedAt || !Number.isFinite(currentTs) || currentTs <= 0 || updatedAtTs > currentTs) {
        target.seriesUpdatedAt = m.seriesUpdatedAt;
      }
    }
    const viewedAtTs = new Date(m.seriesViewedAt || 0).getTime();
    if (Number.isFinite(viewedAtTs) && viewedAtTs > 0) {
      const currentTs = new Date(target.seriesViewedAt || 0).getTime();
      if (!target.seriesViewedAt || !Number.isFinite(currentTs) || currentTs <= 0 || viewedAtTs > currentTs) {
        target.seriesViewedAt = m.seriesViewedAt;
      }
    }
    const chapterNo = Number(m.chapterNo);
    if (Number.isFinite(chapterNo) && chapterNo > 0) {
      target.chapterMin = target.chapterMin == null ? chapterNo : Math.min(target.chapterMin, chapterNo);
      target.chapterMax = target.chapterMax == null ? chapterNo : Math.max(target.chapterMax, chapterNo);
    }
  });
  return [...grouped.values()].sort((a, b) => (b.count - a.count) || a.seriesName.localeCompare(b.seriesName));
}

function sortSeriesCollection(items, sort) {
  const list = Array.isArray(items) ? [...items] : [];
  const ts = (value) => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const nameCmp = (a, b) => String(a.seriesName || '').localeCompare(String(b.seriesName || ''));

  if (sort === 'created_asc') {
    return list.sort((a, b) => (ts(a.seriesCreatedAt) - ts(b.seriesCreatedAt)) || nameCmp(a, b));
  }
  if (sort === 'updated_desc') {
    return list.sort((a, b) => (ts(b.seriesUpdatedAt) - ts(a.seriesUpdatedAt)) || (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || nameCmp(a, b));
  }
  if (sort === 'viewed_desc') {
    return list.sort((a, b) => (ts(b.seriesViewedAt) - ts(a.seriesViewedAt)) || (ts(b.seriesUpdatedAt) - ts(a.seriesUpdatedAt)) || (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || nameCmp(a, b));
  }
  return list.sort((a, b) => (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || nameCmp(a, b));
}

function getSeriesGroupKey(seriesId, seriesName) {
  const sid = String(seriesId || '').trim();
  if (sid) return `id:${sid}`;
  const normalized = normalizeCompareTitle(seriesName);
  return normalized ? `name:${normalized}` : '';
}

function getSeriesIdentityFromManga(manga) {
  if (!manga) return { seriesId: '', seriesName: '', key: '' };
  const seriesId = String(manga.seriesId || '').trim();
  const seriesName = String(manga.seriesName || '').trim();
  return {
    seriesId,
    seriesName,
    key: getSeriesGroupKey(seriesId, seriesName)
  };
}

function touchSeriesUpdatedAtByIdentity(db, identity, updatedAt) {
  const key = String(identity?.key || '').trim();
  if (!db || !Array.isArray(db.mangas) || !key) return 0;
  let affected = 0;
  db.mangas.forEach(m => {
    const itemKey = getSeriesGroupKey(m.seriesId, m.seriesName);
    if (itemKey !== key) return;
    if (String(m.seriesUpdatedAt || '').trim() !== updatedAt) {
      m.seriesUpdatedAt = updatedAt;
      affected += 1;
    }
  });
  return affected;
}

function ensureSeriesCreatedAtInDB(db) {
  if (!db || !Array.isArray(db.mangas) || !db.mangas.length) return false;
  const grouped = new Map();
  db.mangas.forEach((m, idx) => {
    const seriesName = String(m.seriesName || '').trim();
    if (!seriesName) return;
    const key = m.seriesId ? `id:${m.seriesId}` : `name:${normalizeCompareTitle(seriesName)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ idx, manga: m });
  });

  let changed = false;
  grouped.forEach(items => {
    let earliestCreatedAtTs = Number.POSITIVE_INFINITY;
    let earliestCreatedAtValue = '';

    items.forEach(({ manga }) => {
      const createdAt = String(manga.seriesCreatedAt || '').trim();
      const ts = new Date(createdAt || 0).getTime();
      if (createdAt && Number.isFinite(ts) && ts > 0 && ts < earliestCreatedAtTs) {
        earliestCreatedAtTs = ts;
        earliestCreatedAtValue = createdAt;
      }
    });

    if (!earliestCreatedAtValue) {
      let inferredTs = Number.POSITIVE_INFINITY;
      items.forEach(({ manga }) => {
        const ts = new Date(manga.uploadedAt || 0).getTime();
        if (Number.isFinite(ts) && ts > 0 && ts < inferredTs) inferredTs = ts;
      });
      if (Number.isFinite(inferredTs) && inferredTs > 0) earliestCreatedAtValue = new Date(inferredTs).toISOString();
      else earliestCreatedAtValue = new Date().toISOString();
    }

    items.forEach(({ manga }) => {
      if (String(manga.seriesCreatedAt || '').trim() !== earliestCreatedAtValue) {
        manga.seriesCreatedAt = earliestCreatedAtValue;
        changed = true;
      }
      const updatedAt = String(manga.seriesUpdatedAt || '').trim();
      const updatedAtTs = new Date(updatedAt || 0).getTime();
      if (!updatedAt || !Number.isFinite(updatedAtTs) || updatedAtTs <= 0) {
        manga.seriesUpdatedAt = earliestCreatedAtValue;
        changed = true;
      }
      const viewedAt = String(manga.seriesViewedAt || '').trim();
      const viewedAtTs = new Date(viewedAt || 0).getTime();
      if (viewedAt && (!Number.isFinite(viewedAtTs) || viewedAtTs <= 0)) {
        manga.seriesViewedAt = '';
        changed = true;
      }
    });
  });

  return changed;
}

function buildDuplicateGroups(mangas, threshold = 0.74) {
  const list = mangas.map(m => ({ id: m.id, title: m.title, author: m.author || '' }));
  const n = list.length;
  if (n <= 1) return { groups: [], pairs: [] };

  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = Array(n).fill(0);
  const pairScore = new Map();

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra] += 1; }
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = list[i];
      const b = list[j];
      const na = normalizeCompareTitle(a.title);
      const nb = normalizeCompareTitle(b.title);
      if (!na || !nb) continue;
      const score = na === nb ? 1 : diceSimilarity(na, nb);
      if (score >= threshold) {
        union(i, j);
        pairScore.set(`${i}-${j}`, score);
      }
    }
  }

  const comp = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!comp.has(root)) comp.set(root, []);
    comp.get(root).push(i);
  }

  const groups = [];
  comp.forEach(indices => {
    if (indices.length < 2) return;
    let best = 0;
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        const key = `${Math.min(indices[i], indices[j])}-${Math.max(indices[i], indices[j])}`;
        const score = pairScore.get(key) || 0;
        if (score > best) best = score;
      }
    }
    groups.push({
      score: Number(best.toFixed(3)),
      items: indices.map(idx => list[idx])
    });
  });

  const pairs = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = list[i];
      const b = list[j];
      const na = normalizeCompareTitle(a.title);
      const nb = normalizeCompareTitle(b.title);
      if (!na || !nb) continue;
      const score = na === nb ? 1 : diceSimilarity(na, nb);
      if (score >= threshold) {
        pairs.push({
          score: Number(score.toFixed(3)),
          left: a,
          right: b
        });
      }
    }
  }

  return {
    groups: groups.sort((a, b) => (b.score - a.score) || (b.items.length - a.items.length)),
    pairs: pairs.sort((a, b) => b.score - a.score)
  };
}

function buildHashDuplicateGroups(mangas) {
  const list = mangas.map(m => ({ id: m.id, title: m.title, sha256: m.sha256 || '' }));
  const n = list.length;
  if (n <= 1) return { groups: [], pairs: [] };

  const hashMap = new Map();
  const noHashIds = [];

  for (let i = 0; i < n; i += 1) {
    const hash = String(list[i].sha256 || '').trim();
    if (!hash) {
      noHashIds.push(i);
      continue;
    }
    if (!hashMap.has(hash)) hashMap.set(hash, []);
    hashMap.get(hash).push(i);
  }

  const groups = [];
  hashMap.forEach((indices) => {
    if (indices.length < 2) return;
    groups.push({
      score: 1.0,
      items: indices.map(idx => list[idx])
    });
  });

  const pairs = [];
  hashMap.forEach((indices) => {
    if (indices.length < 2) return;
    for (let i = 0; i < indices.length; i += 1) {
      for (let j = i + 1; j < indices.length; j += 1) {
        pairs.push({
          score: 1.0,
          left: list[indices[i]],
          right: list[indices[j]]
        });
      }
    }
  });

  return {
    groups: groups.sort((a, b) => b.items.length - a.items.length),
    pairs: pairs,
    noHashCount: noHashIds.length
  };
}

async function getOrComputeMangaHash(manga, uploadsDir) {
  const mangaId = String(manga?.id || '').trim();
  if (!mangaId) return '';
  
  const existingHash = String(manga?.sha256 || '').trim();
  if (existingHash) return existingHash;

  try {
    const mangaDir = path.join(uploadsDir, mangaId);
    if (!fs.existsSync(mangaDir)) return '';

    const files = fs.readdirSync(mangaDir)
      .filter(f => {
        const stat = fs.statSync(path.join(mangaDir, f));
        return stat.isFile();
      })
      .sort();

    if (!files.length) return '';

    const hash = require('crypto').createHash('sha256');
    for (const file of files) {
      const filePath = path.join(mangaDir, file);
      try {
        const content = fs.readFileSync(filePath);
        hash.update(content);
      } catch {
        // Skip files that can't be read
      }
    }

    return hash.digest('hex');
  } catch {
    return '';
  }
}

function splitNameExt(fileName, fallbackExt = '') {
  const ext = path.extname(fileName || '') || fallbackExt || '';
  const base = path.basename(fileName || 'file', ext) || 'file';
  return { base, ext };
}

function makeUniqueFileName(desiredName, usedSet) {
  const { base, ext } = splitNameExt(desiredName, path.extname(desiredName || '') || '');
  let candidate = safeFileName(`${base}${ext}`);
  let n = 2;
  while (usedSet.has(candidate.toLowerCase())) {
    candidate = safeFileName(`${base} (${n})${ext}`);
    n += 1;
  }
  usedSet.add(candidate.toLowerCase());
  return candidate;
}

function makeExportDisplayName(record, ext, fallbackId = 'file') {
  const author = String(record?.author || '').trim();
  const title = String(record?.title || '').trim() || String(fallbackId || 'file');
  const baseName = author ? `[${author}]${title}` : title;
  return safeFileName(`${baseName}${ext || ''}`);
}

function buildMangaPagesZipBuffer(manga) {
  const mangaId = String(manga?.id || '').trim();
  if (!mangaId) return null;
  const dir = path.join(UPLOADS_DIR, mangaId);
  if (!fs.existsSync(dir)) return null;

  const pages = Array.isArray(manga?.pages) ? manga.pages : [];
  const zip = new AdmZip();
  const usedNames = new Set();
  let count = 0;

  pages.forEach((page, idx) => {
    const rel = String(page || '').trim();
    if (!rel) return;
    const resolved = path.resolve(dir, rel);
    const baseResolved = path.resolve(dir);
    if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) return;
    if (!fs.existsSync(resolved)) return;
    let stat;
    try { stat = fs.statSync(resolved); } catch { return; }
    if (!stat.isFile()) return;

    const ext = path.extname(rel) || '.jpg';
    const desiredName = safeFileName(path.basename(rel) || `page_${idx + 1}${ext}`);
    const entryName = makeUniqueFileName(desiredName, usedNames);
    try {
      zip.addLocalFile(resolved, '', entryName);
      count += 1;
    } catch {}
  });

  if (!count) return null;
  try {
    return zip.toBuffer();
  } catch {
    return null;
  }
}

// ── Multer: manga (images archive) ───────────────────────────────────────────
const mangaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const uploadManga = multer({
  storage: mangaStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.zip', '.cbz', '.cbr', '.rar'];
    if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('漫画只支持 ZIP / CBZ / CBR / RAR'));
  }
});

// ── Multer: novel (txt / epub) ────────────────────────────────────────────────
const novelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, NOVELS_DIR),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const uploadNovel = multer({
  storage: novelStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const ok = ['.txt', '.epub'];
    if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('小说只支持 TXT / EPUB 格式'));
  }
});

// ── Image helpers ─────────────────────────────────────────────────────────────
const IMG_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif']);
function isImage(n) { return IMG_EXT.has(path.extname(n).toLowerCase()); }

function openZipFile(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, decodeStrings: true }, (err, zipfile) => {
      if (err) return reject(err);
      resolve(zipfile);
    });
  });
}

function collectZipEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = [];
    zipfile.on('entry', (entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.once('end', () => resolve(entries));
    zipfile.once('error', reject);
    zipfile.readEntry();
  });
}

function openZipReadStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      resolve(stream);
    });
  });
}

function streamToFile(readStream, targetPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(targetPath);
    const onError = (err) => reject(err);
    readStream.once('error', onError);
    writeStream.once('error', onError);
    writeStream.once('finish', resolve);
    readStream.pipe(writeStream);
  });
}

async function extractZipArchiveStreaming(archivePath, destDir) {
  const zipfile = await openZipFile(archivePath);
  try {
    const allEntries = await collectZipEntries(zipfile);
    const imageEntries = allEntries
      .filter(e => !/\/$/.test(e.fileName) && isImage(e.fileName))
      .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const pages = [];
    for (let idx = 0; idx < imageEntries.length; idx += 1) {
      const entry = imageEntries[idx];
      const ext = path.extname(entry.fileName) || '.jpg';
      const fname = `page_${String(idx + 1).padStart(4, '0')}${ext}`;
      const targetPath = path.join(destDir, fname);
      const readStream = await openZipReadStream(zipfile, entry);
      await streamToFile(readStream, targetPath);
      pages.push(fname);
    }
    return pages;
  } finally {
    try { zipfile.close(); } catch {}
  }
}

function extractArchive(archivePath, destDir) {
  const ext = path.extname(archivePath).toLowerCase();
  if (ext === '.zip' || ext === '.cbz') {
    return extractZipArchiveStreaming(archivePath, destDir);
  }
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(archivePath);
      const entries = zip.getEntries()
        .filter(e => !e.isDirectory && isImage(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const pages = [];
      entries.forEach((entry, idx) => {
        const extName = path.extname(entry.entryName) || '.jpg';
        const fname = `page_${String(idx + 1).padStart(4, '0')}${extName}`;
        fs.writeFileSync(path.join(destDir, fname), entry.getData());
        pages.push(fname);
      });
      resolve(pages);
    } catch (e) { reject(e); }
  });
}

// ── TXT → chapters ───────────────────────────────────────────────────────────
// 识别常见章节标题：第X章/话/节/卷、Chapter/CH、番外、序章、后记等
const CHAPTER_RE = /^[\s\u3000]*(?:正文|第[\s\u3000]*[零一二三四五六七八九十百千万两〇○\d]+[\s\u3000]*[章节卷回集话篇幕部]|(?:chapter|chap(?:ter)?|ch)\s*[\divxlcdm]+|[上中下终]卷|番外(?:篇)?|序(?:章|言)|前言|后记|尾声|楔子|引子|终章)[^\n]{0,60}$/i;

function parseTxtChapters(text) {
  const lines    = text.split(/\r?\n/);
  const chapters = [];
  let   buf      = [];
  let   title    = '正文';
  let   hasBody  = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isChapterTitle = CHAPTER_RE.test(trimmed);
    if (isChapterTitle && hasBody) {
      chapters.push({ title, content: buf.join('\n').trim() });
      buf   = [];
      hasBody = false;
      title = trimmed;
    } else if (isChapterTitle) {
      title = trimmed;
    } else {
      buf.push(line);
      if (!hasBody && trimmed) hasBody = true;
    }
  }
  if (hasBody) chapters.push({ title, content: buf.join('\n').trim() });
  // 如果没识别出章节，整本作为一章
  if (!chapters.length) return [{ title: '全文', content: text.trim() }];
  return chapters;
}

function scoreDecodedTextSample(text) {
  const sample = String(text || '').slice(0, 200000);
  const replacementCount = (sample.match(/\ufffd/g) || []).length;
  const cjkCount = (sample.match(/[\u3400-\u9fff]/g) || []).length;
  const mojibakeLatinCount = (sample.match(/[ÃÂÐÕÆØÅæçéèêëìíîïòóôõöùúûüñ]/g) || []).length;
  // UTF-8 被误按 GBK/GB18030 解码后，经常出现这组高频乱码字形。
  const mojibakeHanCount = (sample.match(/[鍙鍦鏄鐨鎴涓銆锛浠涔閮钁氬彂鏂]/g) || []).length;
  const mojibakeTokenCount = (sample.match(/(?:鏈|鍙戝竷|浣滆€|绗|銆€|鐨勬|鍦ㄨ|鍚庤|閲岄|闃跨|缁撴|璇磋|鍐呭)/g) || []).length;
  const suspiciousRatio = cjkCount ? (mojibakeHanCount / cjkCount) : 0;
  const ratioPenalty = suspiciousRatio > 0.06
    ? Math.round(cjkCount * 1.3)
    : suspiciousRatio > 0.03
      ? Math.round(cjkCount * 0.7)
      : 0;
  return (cjkCount * 2)
    - (replacementCount * 20)
    - (mojibakeLatinCount * 6)
    - (mojibakeHanCount * 8)
    - (mojibakeTokenCount * 80)
    - ratioPenalty;
}

function pickBestDecodedText(buffer) {
  const sampleBuffer = buffer.length > 300000 ? buffer.slice(0, 300000) : buffer;
  const candidates = [];
  const pushCandidate = (encoding, decoder) => {
    try {
      const sampleText = decoder(sampleBuffer);
      if (!sampleText) return;
      candidates.push({ encoding, score: scoreDecodedTextSample(sampleText) });
    } catch {
      // ignore candidate decode failures
    }
  };

  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8', 3);
  }
  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return iconv.decode(buffer.slice(2), 'utf16-le');
  }
  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const data = Buffer.from(buffer.slice(2));
    for (let i = 0; i < data.length - 1; i += 2) {
      const t = data[i];
      data[i] = data[i + 1];
      data[i + 1] = t;
    }
    return iconv.decode(data, 'utf16-le');
  }

  pushCandidate('utf8', (buf) => buf.toString('utf8'));
  pushCandidate('gb18030', (buf) => iconv.decode(buf, 'gb18030'));
  pushCandidate('gbk', (buf) => iconv.decode(buf, 'gbk'));

  if (!candidates.length) return buffer.toString('utf8');
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const utf8 = candidates.find(c => c.encoding === 'utf8');
  const selectedEncoding = (utf8 && utf8.score >= (best.score - 800)) ? 'utf8' : best.encoding;

  if (selectedEncoding === 'gb18030') return iconv.decode(buffer, 'gb18030');
  if (selectedEncoding === 'gbk') return iconv.decode(buffer, 'gbk');
  return buffer.toString('utf8');
}

function normalizeNovelEncodingMode(input) {
  const mode = String(input || '').trim().toLowerCase().replace(/[-_\s]/g, '');
  if (mode === 'utf8') return 'utf8';
  if (mode === 'gb18030' || mode === 'gb2312') return 'gb18030';
  if (mode === 'gbk') return 'gbk';
  return 'auto';
}

function decodeUtf8WithBomAware(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8', 3);
  }
  return buffer.toString('utf8');
}

function readTxtBestEffort(filePath, encodingMode = 'auto') {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.length) return '';
  const mode = normalizeNovelEncodingMode(encodingMode);
  if (mode === 'utf8') return decodeUtf8WithBomAware(buffer);
  if (mode === 'gb18030') return iconv.decode(buffer, 'gb18030');
  if (mode === 'gbk') return iconv.decode(buffer, 'gbk');
  return pickBestDecodedText(buffer);
}

// ── EPUB → chapters (pure Node, no extra deps) ───────────────────────────────
function parseEpubChapters(filePath) {
  try {
    const zip     = new AdmZip(filePath);
    const entries = zip.getEntries();

    // Find OPF spine
    let opfPath = '';
    const containerEntry = entries.find(e => e.entryName.endsWith('container.xml'));
    if (containerEntry) {
      const xml = containerEntry.getData().toString('utf8');
      const m   = xml.match(/full-path="([^"]+\.opf)"/);
      if (m) opfPath = m[1];
    }

    const opfEntry = entries.find(e => e.entryName === opfPath || e.entryName.endsWith('.opf'));
    if (!opfEntry) throw new Error('找不到 OPF 文件');

    const opf      = opfEntry.getData().toString('utf8');
    const opfBase  = opfEntry.entryName.replace(/[^/]+$/, '');

    // Parse manifest
    const manifest = {};
    for (const m of opf.matchAll(/<item\s[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"/g)) {
      manifest[m[1]] = { href: m[2], type: m[3] };
    }

    // Parse spine order
    const spineIds = [...opf.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)].map(m => m[1]);

    const chapters = [];
    for (const id of spineIds) {
      const item = manifest[id];
      if (!item) continue;
      const entryPath = opfBase + item.href;
      const htmlEntry = entries.find(e => e.entryName === entryPath || e.entryName.endsWith(item.href));
      if (!htmlEntry) continue;

      const html  = htmlEntry.getData().toString('utf8');
      // Extract title
      const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        || html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
      const title = tMatch ? tMatch[1].replace(/<[^>]+>/g, '').trim() : item.href;
      // Strip HTML tags → plain text
      const text  = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c))
        .trim();
      if (text.length > 20) chapters.push({ title, content: text });
    }
    return chapters.length ? chapters : [{ title: '全文', content: '无法解析内容' }];
  } catch(e) {
    return [{ title: '解析失败', content: e.message }];
  }
}

const novelChapterCache = new Map();

function getNovelFilePath(novel) {
  if (!novel) return '';
  if (novel.fileName) return path.join(NOVELS_DIR, novel.fileName);
  if (novel.filePath && fs.existsSync(novel.filePath)) return novel.filePath;
  return '';
}

function parseNovelChaptersByRecord(novel, options = {}) {
  if (Array.isArray(novel?.chapters) && novel.chapters.length) {
    return novel.chapters;
  }

  const filePath = getNovelFilePath(novel);
  if (!filePath || !fs.existsSync(filePath)) {
    return [{ title: '全文', content: '文件不存在或已被移动' }];
  }

  const stat = fs.statSync(filePath);
  const encodingMode = normalizeNovelEncodingMode(options?.encodingMode);
  const key = `${novel.id || filePath}::${encodingMode}`;
  const cache = novelChapterCache.get(key);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.chapters;

  const ext = (novel.ext || path.extname(filePath) || '').toLowerCase();
  let chapters = [];
  if (ext === '.txt') {
    const text = readTxtBestEffort(filePath, encodingMode);
    chapters = parseTxtChapters(text);
  } else if (ext === '.epub') {
    chapters = parseEpubChapters(filePath);
  } else {
    chapters = [{ title: '全文', content: '暂不支持的文件格式' }];
  }
  novelChapterCache.set(key, { mtimeMs: stat.mtimeMs, chapters });
  return chapters;
}

function normalizeNovelScriptMode(input) {
  const mode = String(input || '').trim().toLowerCase();
  return mode === 'tc' ? 'tc' : 'sc';
}

function convertNovelTextByScript(text, scriptMode) {
  const raw = String(text || '');
  if (!raw) return '';
  const mode = normalizeNovelScriptMode(scriptMode);
  try {
    return mode === 'tc' ? novelScToTc(raw) : novelTcToSc(raw);
  } catch {
    return raw;
  }
}

async function ensureNovelHashForRecord(novel) {
  if (!novel || typeof novel !== 'object') return false;
  let changed = false;
  if (novel.ignoreDuplicate === undefined) {
    novel.ignoreDuplicate = false;
    changed = true;
  }
  const currentHash = String(novel.sha256 || '').trim();
  if (currentHash) return changed;
  const filePath = getNovelFilePath(novel);
  if (!filePath || !fs.existsSync(filePath)) return changed;
  try {
    const sha256 = await computeSha256ByFile(filePath);
    if (sha256) {
      novel.sha256 = sha256;
      changed = true;
    }
  } catch {
    // ignore hash calculation failures
  }
  return changed;
}

async function buildNovelDuplicatePayload() {
  const ndb = loadNDB();
  const novels = Array.isArray(ndb.novels) ? ndb.novels : [];
  let changed = false;
  for (const novel of novels) {
    const updated = await ensureNovelHashForRecord(novel);
    if (updated) changed = true;
  }
  if (changed) saveNDB(ndb);

  const toItem = (novel) => ({
    id: String(novel.id || ''),
    title: String(novel.title || ''),
    author: String(novel.author || ''),
    uploadedAt: novel.uploadedAt,
    chapterCount: Number(novel.chapterCount || 0),
    sha256: String(novel.sha256 || ''),
    ignoreDuplicate: !!novel.ignoreDuplicate,
    type: 'novel'
  });

  const active = novels.filter(n => !n.ignoreDuplicate);
  const ignoredItems = novels
    .filter(n => !!n.ignoreDuplicate)
    .map(toItem)
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

  const exactMap = new Map();
  active.forEach((novel) => {
    const sha = String(novel.sha256 || '').trim();
    if (!sha) return;
    if (!exactMap.has(sha)) exactMap.set(sha, []);
    exactMap.get(sha).push(novel);
  });

  const exactGroups = [...exactMap.entries()]
    .map(([sha256, items]) => ({
      sha256,
      items: items
        .map(toItem)
        .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
    }))
    .filter(group => group.items.length > 1)
    .sort((a, b) => b.items.length - a.items.length);

  return {
    total: novels.length,
    ignoredCount: ignoredItems.length,
    exactGroupCount: exactGroups.length,
    similarPairCount: 0,
    ignoredItems,
    exactGroups,
    similarPairs: []
  };
}

function parseCookieHeader(header) {
  const result = {};
  const raw = String(header || '');
  if (!raw) return result;
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    if (!key) return;
    const value = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  });
  return result;
}

function getAuthSession(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  const token = String(cookies[AUTH_COOKIE_NAME] || '').trim();
  if (!token) return null;
  const session = authSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function buildSessionCookie(token, maxAgeMs = AUTH_SESSION_TTL_MS) {
  const secure = String(process.env.READER_COOKIE_SECURE || '').toLowerCase() === 'true' ? '; Secure' : '';
  const maxAge = Math.max(0, Math.floor(Number(maxAgeMs) / 1000));
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearAuthSessionByReq(req, res) {
  const session = getAuthSession(req);
  if (session?.token) authSessions.delete(session.token);
  res.setHeader('Set-Cookie', buildSessionCookie('', 0));
}

function isPublicPath(pathname) {
  const p = String(pathname || '').split('?')[0] || '/';
  return p === '/login' || p === '/login.html' || p === '/api/auth/login' || p === '/api/auth/status';
}

function requireLogin(req, res, next) {
  if (isPublicPath(req.path)) return next();
  const session = getAuthSession(req);
  if (session) {
    req.authUser = session.username;
    return next();
  }
  if (req.path.startsWith('/api/') || req.path.startsWith('/pages/')) {
    return res.status(401).json({ error: '请先登录' });
  }
  return res.redirect('/login.html');
}

function cleanupExpiredAuthSessions() {
  const now = Date.now();
  authSessions.forEach((session, token) => {
    if (!session || session.expiresAt <= now) authSessions.delete(token);
  });
}

setInterval(cleanupExpiredAuthSessions, 30 * 60 * 1000).unref();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

app.get('/api/auth/status', (req, res) => {
  const session = getAuthSession(req);
  res.json({ authenticated: !!session, username: session?.username || '' });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = uuidv4();
  authSessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + AUTH_SESSION_TTL_MS
  });
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  res.json({ success: true, username });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthSessionByReq(req, res);
  res.json({ success: true });
});

app.get('/login', (req, res) => {
  const session = getAuthSession(req);
  if (session) return res.redirect('/');
  return res.redirect('/login.html');
});

app.use(requireLogin);
app.use('/pages', express.static(UPLOADS_DIR));
registerMediaRoutes(app, {
  rootDir: __dirname,
  normalizeUploadFileName,
  parseTags,
  normalizeFavoriteCategory
});
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════════════════════
// MANGA API (unchanged)
// ════════════════════════════════════════════════════════════════
app.get('/api/mangas', (req, res) => {
  const db = loadDB();
  let list = db.mangas;
  const { search, tag, author, sort, seriesId, seriesName, ignoreDuplicate, favorite, favoriteCategory } = req.query;
  const authorFilters = parseMultiQueryValues(author);
  if (search) { const q = search.toLowerCase(); list = list.filter(m => m.title.toLowerCase().includes(q) || (m.author||'').toLowerCase().includes(q)); }
  if (tag)    list = list.filter(m => (m.tags||[]).includes(tag));
  if (authorFilters.length) list = list.filter(m => authorFilters.includes(m.author));
  if (seriesId) list = list.filter(m => String(m.seriesId || '') === String(seriesId));
  if (seriesName) {
    const q = normalizeCompareTitle(seriesName);
    list = list.filter(m => normalizeCompareTitle(m.seriesName || '') === q);
  }
  if (ignoreDuplicate === 'true') list = list.filter(m => !!m.ignoreDuplicate);
  if (ignoreDuplicate === 'false') list = list.filter(m => !m.ignoreDuplicate);
  if (favorite === 'true') list = list.filter(m => !!normalizeFavoriteCategory(m.favoriteCategory));
  if (favorite === 'false') list = list.filter(m => !normalizeFavoriteCategory(m.favoriteCategory));
  if (favoriteCategory) {
    const q = normalizeFavoriteCategory(favoriteCategory);
    list = list.filter(m => normalizeFavoriteCategory(m.favoriteCategory) === q);
  }
  if (sort === 'oldest') {
    list = [...list].sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
  } else if (sort === 'rating_desc') {
    list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));
  } else if (sort === 'rating_asc') {
    list = [...list].sort((a, b) => (a.rating || 0) - (b.rating || 0) || (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));
  } else {
    list = [...list].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  }
  res.json(list.map(m => ({ ...m, rating: Number(m.rating || 0), favoriteCategory: normalizeFavoriteCategory(m.favoriteCategory), cover: m.pages?.length ? `/pages/${m.id}/${m.pages[0]}` : null })));
});

app.get('/api/mangas/:id', (req, res, next) => {
  if (req.params.id === 'duplicates' || req.params.id === 'series') return next();
  const m = loadDB().mangas.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: '未找到' });
  res.json({ ...m, pageUrls: (m.pages||[]).map(p => `/pages/${m.id}/${p}`) });
});

app.post('/api/upload', (req, res) => {
  uploadManga.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const id      = path.basename(req.file.filename, path.extname(req.file.filename));
    const originalName = normalizeUploadFileName(req.file.originalname);
    const destDir = path.join(UPLOADS_DIR, id);
    const title   = req.body.title || path.basename(originalName, path.extname(originalName));
    try {
      const pages = await extractArchive(req.file.path, destDir);
      try { if (fs.existsSync(req.file.path)) fs.rmSync(req.file.path, { force: true }); } catch {}
      const db = loadDB();
      const inferredSeries = inferSeriesMetaFromTitle(title);
      const manga = {
        id,
        title,
        author: req.body.author||'',
        tags: parseTags(req.body.tags),
        pages,
        uploadedAt: new Date().toISOString(),
        pageCount: pages.length,
        rating: Number(req.body.rating || 0),
        favoriteCategory: '',
        seriesId: '',
        seriesName: inferredSeries.seriesName || '',
        seriesUpdatedAt: '',
        seriesViewedAt: '',
        chapterNo: Number.isFinite(inferredSeries.chapterNo) ? inferredSeries.chapterNo : null,
        ignoreDuplicate: false,
        originalName,
        sha256: ''
      };
      db.mangas.push(manga);
      saveDB(db);
      (async () => {
        try {
          const hash = await getOrComputeMangaHash(manga, UPLOADS_DIR);
          if (hash) {
            const idx = db.mangas.findIndex(m => m.id === manga.id);
            if (idx >= 0) {
              db.mangas[idx].sha256 = hash;
              saveDB(db);
            }
          }
        } catch {
          // Ignore hash computation errors
        }
      })();
      res.json({ success: true, manga: { ...manga, cover: pages.length ? `/pages/${id}/${pages[0]}` : null } });
    } catch(e) {
      try { fs.unlinkSync(req.file.path); } catch {}
      try { if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true }); } catch {}
      res.status(500).json({ error: `解压失败: ${e.message}` });
    }
  });
});

app.put('/api/mangas/:id', (req, res) => {
  const db = loadDB(); const idx = db.mangas.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const oldIdentity = getSeriesIdentityFromManga(db.mangas[idx]);
  const now = new Date().toISOString();
  const { title, author, tags, rating, favoriteCategory, removeFromSeries } = req.body;
  if (title  !== undefined) db.mangas[idx].title  = title;
  if (author !== undefined) db.mangas[idx].author = author;
  if (tags   !== undefined) db.mangas[idx].tags   = tags;
  if (rating !== undefined) db.mangas[idx].rating = Math.max(0, Math.min(5, Number(rating) || 0));
  if (favoriteCategory !== undefined) db.mangas[idx].favoriteCategory = normalizeFavoriteCategory(favoriteCategory);
  if (removeFromSeries === true) {
    db.mangas[idx].seriesId = '';
    db.mangas[idx].seriesName = '';
    db.mangas[idx].seriesCreatedAt = '';
    db.mangas[idx].seriesUpdatedAt = '';
    db.mangas[idx].seriesViewedAt = '';
    db.mangas[idx].chapterNo = null;
  }
  if (req.body?.ignoreDuplicate !== undefined) db.mangas[idx].ignoreDuplicate = !!req.body.ignoreDuplicate;
  if (title !== undefined && !db.mangas[idx].seriesId && removeFromSeries !== true) {
    const inferred = inferSeriesMetaFromTitle(db.mangas[idx].title);
    db.mangas[idx].seriesName = inferred.seriesName || '';
    db.mangas[idx].chapterNo = Number.isFinite(inferred.chapterNo) ? inferred.chapterNo : null;
  }
  const newIdentity = getSeriesIdentityFromManga(db.mangas[idx]);
  const changedFields = title !== undefined || author !== undefined || tags !== undefined
    || rating !== undefined || favoriteCategory !== undefined || req.body?.ignoreDuplicate !== undefined
    || removeFromSeries === true;

  if (changedFields && newIdentity.key) {
    db.mangas[idx].seriesUpdatedAt = now;
    touchSeriesUpdatedAtByIdentity(db, newIdentity, now);
  }
  if (changedFields && oldIdentity.key && oldIdentity.key !== newIdentity.key) {
    touchSeriesUpdatedAtByIdentity(db, oldIdentity, now);
  }
  saveDB(db); res.json(db.mangas[idx]);
});

app.get('/api/mangas/duplicates', (req, res) => {
  const thresholdInput = Number(req.query.threshold);
  const threshold = Number.isFinite(thresholdInput) ? Math.max(0.5, Math.min(0.95, thresholdInput)) : 0.74;
  const mode = String(req.query.mode || 'title').toLowerCase() === 'hash' ? 'hash' : 'title';
  const allMangas = loadDB().mangas || [];
  const mangas = allMangas.filter(m => !m.ignoreDuplicate);
  
  let result;
  if (mode === 'hash') {
    result = buildHashDuplicateGroups(mangas);
  } else {
    result = buildDuplicateGroups(mangas, threshold);
  }
  
  res.json({
    mode,
    threshold,
    ignoredCount: allMangas.length - mangas.length,
    groupCount: result.groups.length,
    pairCount: result.pairs.length,
    groups: result.groups,
    pairs: result.pairs,
    noHashCount: result.noHashCount || 0
  });
});

app.post('/api/mangas/duplicates/ignore', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: '请选择要处理的漫画' });
  const ignored = req.body?.ignored === false ? false : true;

  const db = loadDB();
  const idSet = new Set(ids);
  let affected = 0;
  db.mangas.forEach(m => {
    if (!idSet.has(m.id)) return;
    m.ignoreDuplicate = ignored;
    affected += 1;
  });
  saveDB(db);
  res.json({ success: true, affected, ignored });
});

app.get('/api/mangas/series/suggestions', (req, res) => {
  const mangas = loadDB().mangas || [];
  const suggestions = buildSeriesSuggestions(mangas);
  res.json({ count: suggestions.length, suggestions });
});

app.post('/api/mangas/series/apply', (req, res) => {
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  if (!groups.length) return res.status(400).json({ error: '缺少归档分组数据' });

  const db = loadDB();
  const idToIndex = new Map(db.mangas.map((m, idx) => [m.id, idx]));
  let affected = 0;
  const errors = [];

  groups.forEach(group => {
    const inputSeriesId = String(group?.seriesId || '').trim();
    const seriesName = String(group?.seriesName || '').trim();
    const mangaIds = Array.isArray(group?.mangaIds) ? [...new Set(group.mangaIds.map(v => String(v || '').trim()).filter(Boolean))] : [];
    if (!mangaIds.length) return;

    const validMangaIds = mangaIds.filter(id => idToIndex.has(id));
    const invalidMangaIds = mangaIds.filter(id => !idToIndex.has(id));
    if (invalidMangaIds.length) {
      errors.push(`以下漫画不存在或已删除：${invalidMangaIds.slice(0, 5).join('、')}${invalidMangaIds.length > 5 ? '…' : ''}`);
    }
    if (!validMangaIds.length) return;

    let existingItems = [];
    if (inputSeriesId) {
      existingItems = db.mangas.filter(m => String(m.seriesId || '').trim() === inputSeriesId);
      if (!existingItems.length) {
        errors.push(`未找到 ID 为 ${inputSeriesId} 的套书，无法追加`);
        return;
      }
    } else if (seriesName) {
      const normalizedName = normalizeCompareTitle(seriesName);
      if (normalizedName) {
        const byName = db.mangas.filter(m => normalizeCompareTitle(m.seriesName || '') === normalizedName);
        const distinctSeriesKeys = new Set(byName.map(m => getSeriesGroupKey(m.seriesId, m.seriesName)).filter(Boolean));
        if (distinctSeriesKeys.size > 1) {
          errors.push(`套书名「${seriesName}」对应多个不同套书，请使用套书 ID 追加`);
          return;
        }
        existingItems = byName;
      } else {
        existingItems = [];
      }
    }

    let targetSeriesId = '';
    let targetSeriesName = seriesName;
    let targetSeriesCreatedAt = '';
    const targetSeriesUpdatedAt = new Date().toISOString();

    if (existingItems.length) {
      const withId = existingItems.find(m => String(m.seriesId || '').trim());
      targetSeriesId = inputSeriesId || (withId ? String(withId.seriesId || '').trim() : uuidv4());
      targetSeriesName = String((withId && withId.seriesName) || existingItems[0].seriesName || seriesName).trim() || seriesName;

      const selectedItems = validMangaIds
        .map(id => db.mangas[idToIndex.get(id)])
        .filter(Boolean);

      const existingCreatedAtList = [...existingItems, ...selectedItems]
        .map(m => String(m.seriesCreatedAt || '').trim())
        .filter(v => {
          const ts = new Date(v || 0).getTime();
          return !!v && Number.isFinite(ts) && ts > 0;
        });

      if (existingCreatedAtList.length) {
        existingCreatedAtList.sort((a, b) => new Date(a) - new Date(b));
        targetSeriesCreatedAt = existingCreatedAtList[0];
      } else {
        let earliestUploadedAtTs = Number.POSITIVE_INFINITY;
        [...existingItems, ...selectedItems].forEach(m => {
          const ts = new Date(m.uploadedAt || 0).getTime();
          if (Number.isFinite(ts) && ts > 0 && ts < earliestUploadedAtTs) earliestUploadedAtTs = ts;
        });
        targetSeriesCreatedAt = Number.isFinite(earliestUploadedAtTs) && earliestUploadedAtTs > 0
          ? new Date(earliestUploadedAtTs).toISOString()
          : new Date().toISOString();
      }

      existingItems.forEach(m => {
        if (String(m.seriesId || '').trim() !== targetSeriesId) m.seriesId = targetSeriesId;
        if (String(m.seriesName || '').trim() !== targetSeriesName) m.seriesName = targetSeriesName;
        if (String(m.seriesCreatedAt || '').trim() !== targetSeriesCreatedAt) m.seriesCreatedAt = targetSeriesCreatedAt;
        if (String(m.seriesUpdatedAt || '').trim() !== targetSeriesUpdatedAt) m.seriesUpdatedAt = targetSeriesUpdatedAt;
      });
    } else {
      if (!seriesName) {
        errors.push('新建套书时必须提供套书名称');
        return;
      }
      if (validMangaIds.length < 2) {
        errors.push(`套书「${seriesName}」不存在，创建新套书至少需要选择两本漫画`);
        return;
      }
      targetSeriesId = uuidv4();
      targetSeriesCreatedAt = new Date().toISOString();
    }

    validMangaIds.forEach(id => {
      const idx = idToIndex.get(id);
      if (idx === undefined) return;
      const inferred = inferSeriesMetaFromTitle(db.mangas[idx].title);
      const nextChapterNo = Number.isFinite(inferred.chapterNo) ? inferred.chapterNo : null;
      const before = db.mangas[idx];
      const changed = String(before.seriesId || '').trim() !== targetSeriesId
        || String(before.seriesName || '').trim() !== targetSeriesName
        || String(before.seriesCreatedAt || '').trim() !== targetSeriesCreatedAt
        || String(before.seriesUpdatedAt || '').trim() !== targetSeriesUpdatedAt
        || Number(before.chapterNo) !== Number(nextChapterNo);
      before.seriesId = targetSeriesId;
      before.seriesName = targetSeriesName;
      before.seriesCreatedAt = targetSeriesCreatedAt;
      before.seriesUpdatedAt = targetSeriesUpdatedAt;
      before.chapterNo = nextChapterNo;
      if (changed) affected += 1;
    });
  });

  if (!affected && errors.length) {
    return res.status(400).json({ error: errors[0] });
  }
  if (!affected) {
    return res.status(400).json({ error: '没有可归档的漫画，或所选漫画已在目标套书中' });
  }

  saveDB(db);
  res.json({ success: true, affected, warnings: errors.slice(0, 3) });
});

app.get('/api/mangas/series', (req, res) => {
  const sort = String(req.query?.sort || 'created_desc').trim();
  const db = loadDB();
  if (ensureSeriesCreatedAtInDB(db)) saveDB(db);
  const mangas = db.mangas || [];
  const series = sortSeriesCollection(buildSeriesCollection(mangas), sort);
  res.json(series);
});

app.post('/api/mangas/series/view', (req, res) => {
  const seriesId = String(req.body?.seriesId || '').trim();
  const seriesName = String(req.body?.seriesName || '').trim();
  if (!seriesId && !seriesName) return res.status(400).json({ error: '缺少系列标识' });

  const db = loadDB();
  const normalizedName = normalizeCompareTitle(seriesName);
  if (!seriesId && normalizedName) {
    const byName = db.mangas.filter(m => normalizeCompareTitle(m.seriesName || '') === normalizedName);
    const distinctSeriesKeys = new Set(byName.map(m => getSeriesGroupKey(m.seriesId, m.seriesName)).filter(Boolean));
    if (distinctSeriesKeys.size > 1) {
      return res.status(400).json({ error: `套书名「${seriesName}」对应多个不同套书，请使用套书 ID 上报` });
    }
  }

  const now = new Date().toISOString();
  let affected = 0;
  db.mangas.forEach(m => {
    const hitById = seriesId && String(m.seriesId || '') === seriesId;
    const hitByName = !seriesId && normalizedName && normalizeCompareTitle(m.seriesName || '') === normalizedName;
    if (!hitById && !hitByName) return;
    m.seriesViewedAt = now;
    affected += 1;
  });

  if (!affected) return res.status(404).json({ error: '未找到要上报查看的套书' });
  saveDB(db);
  res.json({ success: true, affected, seriesViewedAt: now });
});

app.post('/api/mangas/series/clear', (req, res) => {
  const seriesId = String(req.body?.seriesId || '').trim();
  const seriesName = String(req.body?.seriesName || '').trim();
  if (!seriesId && !seriesName) return res.status(400).json({ error: '缺少系列标识' });

  const db = loadDB();
  let affected = 0;
  const normalizedName = normalizeCompareTitle(seriesName);
  if (!seriesId && normalizedName) {
    const byName = db.mangas.filter(m => normalizeCompareTitle(m.seriesName || '') === normalizedName);
    const distinctSeriesKeys = new Set(byName.map(m => getSeriesGroupKey(m.seriesId, m.seriesName)).filter(Boolean));
    if (distinctSeriesKeys.size > 1) {
      return res.status(400).json({ error: `套书名「${seriesName}」对应多个不同套书，请从“套书总览”进入后再执行清空` });
    }
  }
  db.mangas.forEach(m => {
    const hitById = seriesId && String(m.seriesId || '') === seriesId;
    const hitByName = !seriesId && normalizedName && normalizeCompareTitle(m.seriesName || '') === normalizedName;
    if (!hitById && !hitByName) return;
    m.seriesId = '';
    m.seriesName = '';
    m.seriesCreatedAt = '';
    m.seriesUpdatedAt = '';
    m.seriesViewedAt = '';
    m.chapterNo = null;
    affected += 1;
  });

  if (!affected) {
    return res.status(404).json({ error: '未找到可取消归档的套书数据' });
  }

  saveDB(db);
  res.json({ success: true, affected });
});

app.post('/api/mangas/series/rename', (req, res) => {
  const seriesId = String(req.body?.seriesId || '').trim();
  const seriesName = String(req.body?.seriesName || '').trim();
  const newSeriesName = String(req.body?.newSeriesName || '').trim();
  if (!seriesId && !seriesName) return res.status(400).json({ error: '缺少系列标识' });
  if (!newSeriesName) return res.status(400).json({ error: '新套书名称不能为空' });

  const nextName = newSeriesName.slice(0, 120).trim();
  const db = loadDB();
  const normalizedCurrentName = normalizeCompareTitle(seriesName);

  let targetItems = [];
  if (seriesId) {
    targetItems = db.mangas.filter(m => String(m.seriesId || '').trim() === seriesId);
  } else if (normalizedCurrentName) {
    targetItems = db.mangas.filter(m => normalizeCompareTitle(m.seriesName || '') === normalizedCurrentName);
    const targetKeys = new Set(targetItems.map(m => getSeriesGroupKey(m.seriesId, m.seriesName)).filter(Boolean));
    if (targetKeys.size > 1) {
      return res.status(400).json({ error: `套书名「${seriesName}」对应多个不同套书，请从“套书总览”进入后再改名` });
    }
  }

  if (!targetItems.length) return res.status(404).json({ error: '未找到要修改的套书' });

  const targetKey = getSeriesGroupKey(targetItems[0].seriesId, targetItems[0].seriesName);
  const nextNormalized = normalizeCompareTitle(nextName);
  if (!nextNormalized) return res.status(400).json({ error: '新套书名称无效' });

  const conflicts = db.mangas.filter(m => {
    if (normalizeCompareTitle(m.seriesName || '') !== nextNormalized) return false;
    return getSeriesGroupKey(m.seriesId, m.seriesName) !== targetKey;
  });
  if (conflicts.length) {
    return res.status(400).json({ error: `名称「${nextName}」已被其他套书使用，请换一个名称` });
  }

  let affected = 0;
  const now = new Date().toISOString();
  targetItems.forEach(m => {
    const changedName = String(m.seriesName || '').trim() !== nextName;
    if (!changedName) return;
    m.seriesName = nextName;
    m.seriesUpdatedAt = now;
    affected += 1;
  });

  if (!affected) {
    return res.status(400).json({ error: '新名称与当前名称相同，无需修改' });
  }

  saveDB(db);
  res.json({ success: true, affected, seriesId: seriesId || String(targetItems[0].seriesId || '').trim(), seriesName: nextName });
});

app.delete('/api/mangas/:id', (req, res) => {
  const db = loadDB(); const idx = db.mangas.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const oldIdentity = getSeriesIdentityFromManga(db.mangas[idx]);
  const dir = path.join(UPLOADS_DIR, db.mangas[idx].id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  db.mangas.splice(idx, 1);
  if (oldIdentity.key) touchSeriesUpdatedAtByIdentity(db, oldIdentity, new Date().toISOString());
  saveDB(db); res.json({ success: true });
});

app.get('/api/mangas/:id/export', (req, res) => {
  const m = loadDB().mangas.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: '未找到' });
  const buf = buildMangaPagesZipBuffer(m);
  if (!buf) return res.status(404).json({ error: '未找到可导出的漫画页面文件' });
  const downloadName = makeExportDisplayName(m, '.zip', m.id);
  setAttachmentHeaders(res, downloadName);
  res.setHeader('Content-Type', 'application/zip');
  res.send(buf);
});

app.post('/api/mangas/export', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const db = loadDB();
  const source = ids.length ? db.mangas.filter(m => ids.includes(m.id)) : db.mangas;
  if (!source.length) return res.status(400).json({ error: '没有可导出的漫画' });

  const zip = new AdmZip();
  const usedNames = new Set();
  let count = 0;
  source.forEach(m => {
    const mangaBuf = buildMangaPagesZipBuffer(m);
    if (!mangaBuf) return;
    const desiredName = makeExportDisplayName(m, '.zip', m.id);
    const entryName = makeUniqueFileName(desiredName, usedNames);
    try {
      zip.addFile(entryName, mangaBuf);
    } catch {
      const fallbackName = makeUniqueFileName(safeFileName(`${m.id}.zip`), usedNames);
      zip.addFile(fallbackName, mangaBuf);
    }
    count += 1;
  });

  if (!count) return res.status(400).json({ error: '未找到可导出的漫画页面文件' });
  const buf = zip.toBuffer();
  const name = `mangas_export_${Date.now()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
});

app.get('/api/tags', (req, res) => {
  const db = loadDB(); const ndb = loadNDB();
  const type = String(req.query.type || '').toLowerCase();
  const tags = new Set();
  const source = type === 'manga'
    ? db.mangas
    : type === 'novel'
      ? ndb.novels
      : [...db.mangas, ...ndb.novels];
  source.forEach(m => (m.tags||[]).forEach(t => tags.add(t)));
  res.json([...tags].sort());
});

app.get('/api/authors', (req, res) => {
  const db = loadDB(); const ndb = loadNDB();
  const type = String(req.query.type || '').toLowerCase();
  const source = type === 'manga'
    ? db.mangas
    : type === 'novel'
      ? ndb.novels
      : [...db.mangas, ...ndb.novels];
  const authors = new Set(source.map(m => m.author).filter(Boolean));
  res.json([...authors].sort());
});

// ════════════════════════════════════════════════════════════════
// NOVEL API
// ════════════════════════════════════════════════════════════════

// List novels
app.get('/api/novels', (req, res) => {
  const { search, tag, author, sort, favorite, favoriteCategory } = req.query;
  const authorFilters = parseMultiQueryValues(author);
  let list = loadNDB().novels;
  if (search) { const q = search.toLowerCase(); list = list.filter(n => n.title.toLowerCase().includes(q) || (n.author||'').toLowerCase().includes(q)); }
  if (tag)    list = list.filter(n => (n.tags||[]).includes(tag));
  if (authorFilters.length) list = list.filter(n => authorFilters.includes(n.author));
  if (favorite === 'true') list = list.filter(n => !!normalizeFavoriteCategory(n.favoriteCategory));
  if (favorite === 'false') list = list.filter(n => !normalizeFavoriteCategory(n.favoriteCategory));
  if (favoriteCategory) {
    const q = normalizeFavoriteCategory(favoriteCategory);
    list = list.filter(n => normalizeFavoriteCategory(n.favoriteCategory) === q);
  }
  if (sort === 'oldest') list = [...list].sort((a,b)=>new Date(a.uploadedAt||0)-new Date(b.uploadedAt||0));
  else if (sort === 'rating_desc') {
    list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));
  } else if (sort === 'rating_asc') {
    list = [...list].sort((a, b) => (a.rating || 0) - (b.rating || 0) || (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));
  }
  else list = [...list].sort((a,b)=>new Date(b.uploadedAt||0)-new Date(a.uploadedAt||0));
  // Don't send chapter content in list
  res.json(list.map(n => ({ id: n.id, title: n.title, author: n.author, tags: n.tags, chapterCount: n.chapterCount, uploadedAt: n.uploadedAt, rating: Number(n.rating || 0), favoriteCategory: normalizeFavoriteCategory(n.favoriteCategory), type: 'novel' })));
});

// Get novel (with all chapters)
app.get('/api/novels/:id', (req, res, next) => {
  if (String(req.params.id || '').toLowerCase() === 'duplicates') return next();
  const n = loadNDB().novels.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: '未找到' });
  const scriptMode = normalizeNovelScriptMode(req.query?.script);
  const encodingMode = normalizeNovelEncodingMode(req.query?.encoding);
  const chapters = parseNovelChaptersByRecord(n, { encodingMode });
  res.json({
    ...n,
    title: convertNovelTextByScript(n.title || '', scriptMode),
    encodingMode,
    chapterCount: chapters.length,
    chapters: chapters.map((ch, idx) => ({
      idx,
      title: convertNovelTextByScript(ch.title || `第${idx + 1}章`, scriptMode)
    }))
  });
});

// Get single chapter content (lazy load)
app.get('/api/novels/:id/chapter/:idx', (req, res) => {
  const n   = loadNDB().novels.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: '未找到' });
  const idx = parseInt(req.params.idx);
  const scriptMode = normalizeNovelScriptMode(req.query?.script);
  const encodingMode = normalizeNovelEncodingMode(req.query?.encoding);
  const chapters = parseNovelChaptersByRecord(n, { encodingMode });
  const ch  = chapters[idx];
  if (!ch)  return res.status(404).json({ error: '章节不存在' });
  res.json({
    ...ch,
    title: convertNovelTextByScript(ch.title || `第${idx + 1}章`, scriptMode),
    content: convertNovelTextByScript(ch.content || '', scriptMode)
  });
});

// Upload novel
app.post('/api/novels/upload', (req, res) => {
  uploadNovel.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });

    const id    = path.basename(req.file.filename, path.extname(req.file.filename));
    const originalName = normalizeUploadFileName(req.file.originalname);
    const ext   = path.extname(originalName).toLowerCase();
    const title = req.body.title || path.basename(originalName, path.extname(originalName));
    const filePath = req.file.path;

    try {
      let chapters = [];
      if (ext === '.txt') {
        const text = readTxtBestEffort(filePath);
        chapters = parseTxtChapters(text);
      } else if (ext === '.epub') {
        chapters = parseEpubChapters(filePath);
      }

      const ndb   = loadNDB();
      const fileName = path.basename(filePath);
      const novel = {
        id,
        title,
        author:       req.body.author || '',
        tags:         parseTags(req.body.tags),
        chapterCount: chapters.length,
        rating:       Math.max(0, Math.min(5, Number(req.body.rating) || 0)),
        favoriteCategory: '',
        ext,
        fileName,
        originalName,
        uploadedAt:   new Date().toISOString(),
        type:         'novel'
      };
      ndb.novels.push(novel);
      saveNDB(ndb);
      novelChapterCache.set(id, { mtimeMs: fs.statSync(filePath).mtimeMs, chapters });

      res.json({ success: true, novel: { id, title, author: novel.author, tags: novel.tags, chapterCount: novel.chapterCount, rating: novel.rating } });
    } catch(e) {
      try { fs.unlinkSync(filePath); } catch {}
      res.status(500).json({ error: `处理失败: ${e.message}` });
    }
  });
});

// Update novel metadata
app.put('/api/novels/:id', (req, res) => {
  const ndb = loadNDB(); const idx = ndb.novels.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const { title, author, tags, rating, favoriteCategory, ignoreDuplicate } = req.body;
  if (title  !== undefined) ndb.novels[idx].title  = title;
  if (author !== undefined) ndb.novels[idx].author = author;
  if (tags   !== undefined) ndb.novels[idx].tags   = tags;
  if (rating !== undefined) ndb.novels[idx].rating = Math.max(0, Math.min(5, Number(rating) || 0));
  if (favoriteCategory !== undefined) ndb.novels[idx].favoriteCategory = normalizeFavoriteCategory(favoriteCategory);
  if (ignoreDuplicate !== undefined) ndb.novels[idx].ignoreDuplicate = !!ignoreDuplicate;
  saveNDB(ndb); res.json(ndb.novels[idx]);
});

app.get('/api/novels/duplicates', async (req, res) => {
  const payload = await buildNovelDuplicatePayload();
  res.json(payload);
});

app.post('/api/novels/duplicates/ignore', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: '请提供小说 ID 列表' });
  const ignored = req.body?.ignored === false ? false : true;
  const idSet = new Set(ids);
  const ndb = loadNDB();
  let affected = 0;
  (ndb.novels || []).forEach((novel) => {
    if (!idSet.has(String(novel.id || '').trim())) return;
    novel.ignoreDuplicate = ignored;
    affected += 1;
  });
  saveNDB(ndb);
  res.json({ success: true, affected, ignored });
});

app.post('/api/novels/duplicates/delete', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: '请提供小说 ID 列表' });
  const idSet = new Set(ids);
  const ndb = loadNDB();
  const novels = Array.isArray(ndb.novels) ? ndb.novels : [];
  let affected = 0;

  const remained = novels.filter((novel) => {
    const id = String(novel.id || '').trim();
    if (!idSet.has(id)) return true;
    const filePath = getNovelFilePath(novel);
    if (filePath && fs.existsSync(filePath)) {
      try { fs.rmSync(filePath, { force: true }); } catch {}
    }
    novelChapterCache.delete(id);
    affected += 1;
    return false;
  });

  ndb.novels = remained;
  saveNDB(ndb);
  res.json({ success: true, affected });
});

// Delete novel
app.delete('/api/novels/:id', (req, res) => {
  const ndb = loadNDB(); const idx = ndb.novels.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const filePath = getNovelFilePath(ndb.novels[idx]);
  if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  novelChapterCache.delete(ndb.novels[idx].id);
  ndb.novels.splice(idx, 1); saveNDB(ndb); res.json({ success: true });
});

app.get('/api/novels/:id/export', (req, res) => {
  const n = loadNDB().novels.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: '未找到' });
  const filePath = getNovelFilePath(n);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: '未找到原始小说文件，可能为旧数据' });
  const ext = n.ext || path.extname(filePath) || '.txt';
  const downloadName = makeExportDisplayName(n, ext, n.id);
  setAttachmentHeaders(res, downloadName);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

app.post('/api/novels/export', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ndb = loadNDB();
  const source = ids.length ? ndb.novels.filter(n => ids.includes(n.id)) : ndb.novels;
  if (!source.length) return res.status(400).json({ error: '没有可导出的小说' });

  const zip = new AdmZip();
  const usedNames = new Set();
  let count = 0;
  source.forEach(n => {
    const filePath = getNovelFilePath(n);
    if (!filePath || !fs.existsSync(filePath)) return;
    const ext = n.ext || path.extname(filePath) || '.txt';
    const desiredName = makeExportDisplayName(n, ext, n.id);
    const entryName = makeUniqueFileName(desiredName, usedNames);
    try {
      zip.addLocalFile(filePath, '', entryName);
    } catch {
      const fallbackName = makeUniqueFileName(safeFileName(`${n.id}${ext}`), usedNames);
      zip.addLocalFile(filePath, '', fallbackName);
    }
    count += 1;
  });

  if (!count) return res.status(400).json({ error: '未找到可导出的小说原始文件（可能为旧数据）' });
  const buf = zip.toBuffer();
  const name = `novels_export_${Date.now()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📚 阅读器已启动！`);
  console.log(`   本机访问:   http://localhost:${PORT}`);
  console.log(`   手机访问:   http://<本机IP>:${PORT}`);
  console.log(`   按 Ctrl+C 停止服务\n`);
});
