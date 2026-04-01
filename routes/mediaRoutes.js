const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeFileNameWithFallback(name, normalizeUploadFileName) {
  if (typeof normalizeUploadFileName === 'function') {
    return normalizeUploadFileName(name);
  }
  return String(name || 'file');
}

function parseTagsLocal(input) {
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

function normalizeFavoriteCategoryLocal(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  return value.slice(0, 40);
}

function normalizeVideoSeriesNameLocal(input) {
  return String(input || '').trim().slice(0, 80);
}

function normalizeVideoSeriesIdLocal(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  const normalized = raw
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized.slice(0, 100);
}

function normalizeVideoEpisodeNoLocal(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.floor(n));
}

function normalizeCompareNameLocal(input) {
  return String(input || '').trim().toLowerCase();
}

function getVideoMimeTypeByExt(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.m4v') return 'video/x-m4v';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.ogv' || ext === '.ogg') return 'video/ogg';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.mkv') return 'video/x-matroska';
  return 'application/octet-stream';
}

function getVideoSeriesGroupKey(seriesId, seriesName) {
  const sid = normalizeVideoSeriesIdLocal(seriesId);
  const sname = normalizeCompareNameLocal(seriesName);
  if (sid) return `id:${sid}`;
  if (sname) return `name:${sname}`;
  return '';
}

function buildVideoSeriesCollection(videos) {
  const map = new Map();
  (Array.isArray(videos) ? videos : []).forEach((video) => {
    const key = getVideoSeriesGroupKey(video?.seriesId, video?.seriesName);
    if (!key) return;

    const seriesId = normalizeVideoSeriesIdLocal(video?.seriesId);
    const seriesName = normalizeVideoSeriesNameLocal(video?.seriesName);
    const uploadedAt = String(video?.uploadedAt || '').trim();
    const seriesCreatedAt = String(video?.seriesCreatedAt || '').trim() || uploadedAt;
    const seriesUpdatedAt = String(video?.seriesUpdatedAt || '').trim() || uploadedAt;
    const seriesViewedAt = String(video?.seriesViewedAt || '').trim();
    const episodeNoRaw = Number(video?.episodeNo);
    const episodeNo = Number.isFinite(episodeNoRaw) && episodeNoRaw > 0 ? Math.floor(episodeNoRaw) : null;

    if (!map.has(key)) {
      map.set(key, {
        seriesId,
        seriesName,
        count: 0,
        episodeMin: null,
        episodeMax: null,
        seriesCreatedAt: '',
        seriesUpdatedAt: '',
        seriesViewedAt: '',
        previewUrl: '',
        previewCover: '',
        previewTitle: '',
        previewUploadedAt: 0
      });
    }

    const group = map.get(key);
    group.count += 1;
    if (!group.seriesId && seriesId) group.seriesId = seriesId;
    if (!group.seriesName && seriesName) group.seriesName = seriesName;

    if (episodeNo != null) {
      group.episodeMin = group.episodeMin == null ? episodeNo : Math.min(group.episodeMin, episodeNo);
      group.episodeMax = group.episodeMax == null ? episodeNo : Math.max(group.episodeMax, episodeNo);
    }

    if (seriesCreatedAt) {
      if (!group.seriesCreatedAt || new Date(seriesCreatedAt).getTime() < new Date(group.seriesCreatedAt).getTime()) {
        group.seriesCreatedAt = seriesCreatedAt;
      }
    }
    if (seriesUpdatedAt) {
      if (!group.seriesUpdatedAt || new Date(seriesUpdatedAt).getTime() > new Date(group.seriesUpdatedAt).getTime()) {
        group.seriesUpdatedAt = seriesUpdatedAt;
      }
    }
    if (seriesViewedAt) {
      if (!group.seriesViewedAt || new Date(seriesViewedAt).getTime() > new Date(group.seriesViewedAt).getTime()) {
        group.seriesViewedAt = seriesViewedAt;
      }
    }

    const previewUrl = video?.fileName ? `/media/videos/${encodeURIComponent(String(video.fileName || ''))}` : '';
    const previewCover = String(video?.poster || '').trim();
    const previewTitle = String(video?.title || '').trim();
    const previewUploadedAt = new Date(uploadedAt || 0).getTime();
    const currentHasCover = !!String(group.previewCover || '').trim();
    const nextHasCover = !!previewCover;
    const shouldReplacePreview = !group.previewUrl
      || (nextHasCover && !currentHasCover)
      || (nextHasCover === currentHasCover && previewUploadedAt > Number(group.previewUploadedAt || 0));
    if (shouldReplacePreview && previewUrl) {
      group.previewUrl = previewUrl;
      group.previewCover = previewCover;
      group.previewTitle = previewTitle;
      group.previewUploadedAt = Number.isFinite(previewUploadedAt) ? previewUploadedAt : 0;
    }
  });

  return [...map.values()].map(group => ({
    seriesId: group.seriesId,
    seriesName: group.seriesName || group.seriesId || '未命名连续剧',
    count: group.count,
    episodeMin: group.episodeMin,
    episodeMax: group.episodeMax,
    seriesCreatedAt: group.seriesCreatedAt,
    seriesUpdatedAt: group.seriesUpdatedAt,
    seriesViewedAt: group.seriesViewedAt,
    previewUrl: group.previewUrl,
    previewCover: group.previewCover,
    previewTitle: group.previewTitle
  }));
}

function sortVideoSeriesCollection(collection, sort) {
  const list = [...(Array.isArray(collection) ? collection : [])];
  const ts = (value) => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const byName = (a, b) => String(a.seriesName || '').localeCompare(String(b.seriesName || ''));

  if (sort === 'created_asc') {
    return list.sort((a, b) => (ts(a.seriesCreatedAt) - ts(b.seriesCreatedAt)) || byName(a, b));
  }
  if (sort === 'updated_desc') {
    return list.sort((a, b) => (ts(b.seriesUpdatedAt) - ts(a.seriesUpdatedAt)) || (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || byName(a, b));
  }
  if (sort === 'viewed_desc') {
    return list.sort((a, b) => (ts(b.seriesViewedAt) - ts(a.seriesViewedAt)) || (ts(b.seriesUpdatedAt) - ts(a.seriesUpdatedAt)) || (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || byName(a, b));
  }
  return list.sort((a, b) => (ts(b.seriesCreatedAt) - ts(a.seriesCreatedAt)) || byName(a, b));
}

async function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function computeImageDHash(filePath) {
  const { data } = await sharp(filePath, { failOn: 'none' })
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!data || data.length < 72) return '';
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    const rowOffset = y * 9;
    for (let x = 0; x < 8; x += 1) {
      const left = data[rowOffset + x];
      const right = data[rowOffset + x + 1];
      bits += right >= left ? '1' : '0';
    }
  }
  return bits;
}

function hammingDistanceHash(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) dist += 1;
  }
  return dist;
}

async function buildImageHashMeta(filePath) {
  const sha256 = await computeFileSha256(filePath);
  let width = 0;
  let height = 0;
  let dHash = '';
  try {
    const metadata = await sharp(filePath, { failOn: 'none' }).metadata();
    width = Number(metadata?.width || 0);
    height = Number(metadata?.height || 0);
    dHash = await computeImageDHash(filePath);
  } catch {
    dHash = '';
  }
  return { sha256, dHash, width, height };
}

async function buildImageThumbnail(sourcePath, targetPath) {
  await sharp(sourcePath, { failOn: 'none' })
    .rotate()
    .resize({
      width: 720,
      height: 720,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 72, effort: 2 })
    .toFile(targetPath);
}

// 在服务进程期间缓存已验证缩略图的图片ID，避免重复文件系统操作
const _verifiedThumbIds = new Set();

async function ensureImageThumbnailForRecord(image, imagesDir, thumbsDir) {
  const id = String(image?.id || '').trim();
  // 快速路径：本次服务进程中已验证过，无需任何文件系统操作
  if (id && _verifiedThumbIds.has(id)) return false;

  const fileName = String(image?.fileName || '').trim();
  if (!fileName) return false;

  const thumbName = String(image?.thumbName || '').trim() || `${path.parse(fileName).name}.webp`;
  const thumbPath = path.join(thumbsDir, thumbName);
  const thumbNameChanged = image.thumbName !== thumbName;
  image.thumbName = thumbName;

  let rebuilt = false;
  if (!fs.existsSync(thumbPath)) {
    // 缩略图不存在，重新生成
    const sourcePath = path.join(imagesDir, fileName);
    if (fs.existsSync(sourcePath)) {
      await buildImageThumbnail(sourcePath, thumbPath);
      rebuilt = true;
    }
  }
  // 图片上传后不会修改，因此无需比较 mtime，缩略图存在即认为有效

  if (id) _verifiedThumbIds.add(id);
  return rebuilt || thumbNameChanged;
}

async function ensureImageHashForRecord(image, imagesDir) {
  const fileName = String(image?.fileName || '').trim();
  const filePath = fileName ? path.join(imagesDir, fileName) : '';
  if (!filePath || !fs.existsSync(filePath)) return false;
  const needsSha = !String(image.sha256 || '').trim();
  const needsDHash = !String(image.dHash || '').trim();
  const needsSize = !(Number(image.width || 0) > 0 && Number(image.height || 0) > 0);
  if (!needsSha && !needsDHash && !needsSize) return false;
  const meta = await buildImageHashMeta(filePath);
  if (meta.sha256) image.sha256 = meta.sha256;
  if (meta.dHash) image.dHash = meta.dHash;
  if (meta.width > 0) image.width = meta.width;
  if (meta.height > 0) image.height = meta.height;
  return true;
}

async function ensureVideoHashForRecord(video, videosDir) {
  const fileName = String(video?.fileName || '').trim();
  const filePath = fileName ? path.join(videosDir, fileName) : '';
  if (!filePath || !fs.existsSync(filePath)) return false;
  let changed = false;
  if (!String(video.sha256 || '').trim()) {
    const sha256 = await computeFileSha256(filePath).catch(() => '');
    if (sha256) {
      video.sha256 = sha256;
      changed = true;
    }
  }
  if (video.ignoreDuplicate === undefined) {
    video.ignoreDuplicate = false;
    changed = true;
  }
  return changed;
}

function registerMediaRoutes(app, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const normalizeUploadFileName = options.normalizeUploadFileName;
  const parseTags = typeof options.parseTags === 'function' ? options.parseTags : parseTagsLocal;
  const normalizeFavoriteCategory = typeof options.normalizeFavoriteCategory === 'function'
    ? options.normalizeFavoriteCategory
    : normalizeFavoriteCategoryLocal;

  const imagesDir = path.join(rootDir, 'uploads', 'images');
  const imageThumbsDir = path.join(rootDir, 'uploads', 'image-thumbs');
  const videosDir = path.join(rootDir, 'uploads', 'videos');
  const imagesFile = path.join(rootDir, 'data', 'images.json');
  const videosFile = path.join(rootDir, 'data', 'videos.json');

  ensureDir(imagesDir);
  ensureDir(imageThumbsDir);
  ensureDir(videosDir);
  ensureDir(path.dirname(imagesFile));

  // 内存缓存：避免每次请求都读写磁盘 JSON
  let _idbCache = null, _vdbCache = null;
  const loadIDB = () => _idbCache || (_idbCache = readJson(imagesFile, { images: [] }));
  const saveIDB = (db) => { _idbCache = db; writeJson(imagesFile, db); };
  const loadVDB = () => _vdbCache || (_vdbCache = readJson(videosFile, { videos: [] }));
  const saveVDB = (db) => { _vdbCache = db; writeJson(videosFile, db); };

  function applyVideoSeriesGroups(videos, groups) {
    const list = Array.isArray(videos) ? videos : [];
    const byId = new Map(list.map(video => [String(video.id || '').trim(), video]));
    const warnings = [];
    let affected = 0;
    const now = new Date().toISOString();

    (Array.isArray(groups) ? groups : []).forEach((group) => {
      const ids = Array.isArray(group?.videoIds)
        ? group.videoIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];
      if (!ids.length) {
        warnings.push('有分组缺少视频列表，已跳过');
        return;
      }

      let targetSeriesId = normalizeVideoSeriesIdLocal(group?.seriesId);
      let targetSeriesName = normalizeVideoSeriesNameLocal(group?.seriesName);
      if (!targetSeriesId && !targetSeriesName) {
        warnings.push('有分组缺少连续剧名称，已跳过');
        return;
      }
      if (!targetSeriesName && targetSeriesId) {
        const existing = list.find(v => normalizeVideoSeriesIdLocal(v?.seriesId) === targetSeriesId);
        targetSeriesName = normalizeVideoSeriesNameLocal(existing?.seriesName || targetSeriesId);
      }
      if (!targetSeriesId) targetSeriesId = normalizeVideoSeriesIdLocal(targetSeriesName);

      const targetKey = getVideoSeriesGroupKey(targetSeriesId, targetSeriesName);
      const currentInTarget = list.filter(v => getVideoSeriesGroupKey(v?.seriesId, v?.seriesName) === targetKey);
      const maxEpisode = currentInTarget.reduce((max, item) => {
        const n = normalizeVideoEpisodeNoLocal(item?.episodeNo);
        return n != null ? Math.max(max, n) : max;
      }, 0);
      let nextEpisode = maxEpisode + 1;

      const existingCreated = currentInTarget
        .map(item => String(item?.seriesCreatedAt || '').trim())
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
      const targetCreatedAt = existingCreated || now;

      ids.forEach((id) => {
        const video = byId.get(id);
        if (!video) {
          warnings.push(`视频 ${id} 不存在，已跳过`);
          return;
        }
        const changed = normalizeVideoSeriesIdLocal(video.seriesId) !== targetSeriesId
          || normalizeVideoSeriesNameLocal(video.seriesName) !== targetSeriesName
          || normalizeVideoEpisodeNoLocal(video.episodeNo) !== nextEpisode
          || String(video.seriesCreatedAt || '').trim() !== targetCreatedAt
          || String(video.seriesUpdatedAt || '').trim() !== now;
        video.seriesId = targetSeriesId;
        video.seriesName = targetSeriesName;
        video.episodeNo = nextEpisode;
        video.seriesCreatedAt = targetCreatedAt;
        video.seriesUpdatedAt = now;
        if (changed) affected += 1;
        nextEpisode += 1;
      });
    });

    return { affected, warnings };
  }

  async function handleImageDuplicateQuery(req, res) {
    const idb = loadIDB();
    const images = Array.isArray(idb.images) ? idb.images : [];
    let changed = false;
    for (const image of images) {
      const updated = await ensureImageHashForRecord(image, imagesDir).catch(() => false);
      if (updated) changed = true;
      const thumbUpdated = await ensureImageThumbnailForRecord(image, imagesDir, imageThumbsDir).catch(() => false);
      if (thumbUpdated) changed = true;
      if (image.ignoreDuplicate === undefined) {
        image.ignoreDuplicate = false;
        changed = true;
      }
    }
    if (changed) saveIDB(idb);

    const toPayload = (image) => ({
      id: image.id,
      title: image.title,
      originalName: image.originalName,
      fileName: image.fileName,
      uploadedAt: image.uploadedAt,
      size: Number(image.size || 0),
      width: Number(image.width || 0),
      height: Number(image.height || 0),
      sha256: String(image.sha256 || ''),
      dHash: String(image.dHash || ''),
      ignoreDuplicate: !!image.ignoreDuplicate,
      url: `/media/images/${encodeURIComponent(image.fileName || '')}`,
      thumbUrl: image.thumbName ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}` : '',
      cover: image.thumbName
        ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}`
        : `/media/images/${encodeURIComponent(image.fileName || '')}`
    });

    const active = images.filter(x => !x.ignoreDuplicate);
    const ignoredItems = images
      .filter(x => !!x.ignoreDuplicate)
      .map(toPayload)
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

    const exactMap = new Map();
    active.forEach(image => {
      const sha = String(image.sha256 || '').trim();
      if (!sha) return;
      if (!exactMap.has(sha)) exactMap.set(sha, []);
      exactMap.get(sha).push(image);
    });
    const exactGroups = [...exactMap.entries()]
      .map(([sha256, items]) => ({ sha256, items: items.map(toPayload) }))
      .filter(group => group.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length);

    res.json({
      total: images.length,
      ignoredCount: images.filter(x => !!x.ignoreDuplicate).length,
      exactGroupCount: exactGroups.length,
      similarPairCount: 0,
      ignoredItems,
      exactGroups,
      similarPairs: []
    });
  }

  async function handleVideoDuplicateQuery(req, res) {
    const vdb = loadVDB();
    const videos = Array.isArray(vdb.videos) ? vdb.videos : [];
    let changed = false;
    for (const video of videos) {
      const updated = await ensureVideoHashForRecord(video, videosDir).catch(() => false);
      if (updated) changed = true;
    }
    if (changed) saveVDB(vdb);

    const toPayload = (video) => ({
      id: video.id,
      title: video.title,
      originalName: video.originalName,
      fileName: video.fileName,
      uploadedAt: video.uploadedAt,
      size: Number(video.size || 0),
      sha256: String(video.sha256 || ''),
      ignoreDuplicate: !!video.ignoreDuplicate,
      url: `/media/videos/${encodeURIComponent(video.fileName || '')}`,
      cover: String(video.poster || '').trim() || ''
    });

    const active = videos.filter(x => !x.ignoreDuplicate);
    const ignoredItems = videos
      .filter(x => !!x.ignoreDuplicate)
      .map(toPayload)
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

    const exactMap = new Map();
    active.forEach(video => {
      const sha = String(video.sha256 || '').trim();
      if (!sha) return;
      if (!exactMap.has(sha)) exactMap.set(sha, []);
      exactMap.get(sha).push(video);
    });

    const exactGroups = [...exactMap.entries()]
      .map(([sha256, items]) => ({ sha256, items: items.map(toPayload) }))
      .filter(group => group.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length);

    res.json({
      total: videos.length,
      ignoredCount: videos.filter(x => !!x.ignoreDuplicate).length,
      exactGroupCount: exactGroups.length,
      similarPairCount: 0,
      ignoredItems,
      exactGroups,
      similarPairs: []
    });
  }

  const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  });

  const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videosDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  });

  const uploadImage = multer({
    storage: imageStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.svg'];
      if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
      else cb(new Error('图片只支持 JPG / PNG / GIF / WEBP / BMP / AVIF / SVG'));
    }
  });

  const uploadVideo = multer({
    storage: videoStorage,
      limits: { fileSize: 10 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv'];
      if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
      else cb(new Error('视频只支持 MP4 / WEBM / MOV / M4V / AVI / MKV'));
    }
  });

  app.use('/media/images', require('express').static(imagesDir));
  app.use('/media/image-thumbs', require('express').static(imageThumbsDir));

  function streamVideoFile(req, res) {
    const fileName = String(req.params?.fileName || '').trim();
    if (!fileName) return res.status(400).end();
    let decodedName = '';
    try {
      decodedName = decodeURIComponent(fileName);
    } catch {
      return res.status(400).end();
    }
    const safeName = path.basename(decodedName);
    if (!safeName || safeName !== decodedName) return res.status(400).end();

    const filePath = path.join(videosDir, safeName);
    if (!filePath.startsWith(videosDir) || !fs.existsSync(filePath)) return res.status(404).end();

    const stat = fs.statSync(filePath);
    const fileSize = Number(stat.size || 0);
    const contentType = getVideoMimeTypeByExt(safeName);
    const rangeHeader = String(req.headers.range || '').trim();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate, no-transform');

    if (!rangeHeader) {
      res.setHeader('Content-Length', fileSize);
      if (req.method === 'HEAD') return res.status(200).end();
      return fs.createReadStream(filePath).pipe(res);
    }

    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
    if (!match) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    let start = match[1] ? Number(match[1]) : NaN;
    let end = match[2] ? Number(match[2]) : NaN;

    if (Number.isNaN(start) && Number.isNaN(end)) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    if (Number.isNaN(start)) {
      const suffixLength = Number(end);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).end();
      }
      start = Math.max(0, fileSize - suffixLength);
      end = fileSize - 1;
    } else {
      if (Number.isNaN(end) || end >= fileSize) end = fileSize - 1;
    }

    if (start < 0 || start >= fileSize || end < start) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  app.head('/media/videos/:fileName', streamVideoFile);
  app.get('/media/videos/:fileName', streamVideoFile);
  app.use('/media/videos', require('express').static(videosDir));

  // 服务启动后异步预热缩略图缓存：对已有 thumbName 的图片直接加入验证集合
  setImmediate(async () => {
    try {
      const idb = loadIDB();
      const list = idb.images || [];
      let changed = false;
      for (const image of list) {
        const id = String(image?.id || '').trim();
        if (image.thumbName && id) {
          _verifiedThumbIds.add(id); // 已有缩略图，无需 I/O
        } else {
          const updated = await ensureImageThumbnailForRecord(image, imagesDir, imageThumbsDir).catch(() => false);
          if (updated) changed = true;
        }
      }
      if (changed) saveIDB(idb);
    } catch {}
  });

  app.get('/api/images', async (req, res) => {
    const { search, sort, tag, favorite, favoriteCategory } = req.query;
    const idb = loadIDB();
    let list = idb.images || [];
    let changed = false;
    for (const image of list) {
      // 跳过已在本次进程中验证过的图片（_verifiedThumbIds 由启动预热填充）
      const id = String(image?.id || '').trim();
      if (id && _verifiedThumbIds.has(id)) continue;
      const updated = await ensureImageThumbnailForRecord(image, imagesDir, imageThumbsDir).catch(() => false);
      if (updated) changed = true;
    }
    if (changed) saveIDB(idb);
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(i => String(i.title || '').toLowerCase().includes(q) || String(i.originalName || '').toLowerCase().includes(q));
    }
    if (tag) list = list.filter(i => (i.tags || []).includes(tag));
    if (favorite === 'true') list = list.filter(i => !!normalizeFavoriteCategory(i.favoriteCategory));
    if (favorite === 'false') list = list.filter(i => !normalizeFavoriteCategory(i.favoriteCategory));
    if (favoriteCategory) {
      const q = normalizeFavoriteCategory(favoriteCategory);
      list = list.filter(i => normalizeFavoriteCategory(i.favoriteCategory) === q);
    }
    if (sort === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
    } else {
      list = [...list].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    }
    const payload = list.map(i => ({
      ...i,
      type: 'image',
      url: `/media/images/${encodeURIComponent(i.fileName)}`,
      thumbUrl: i.thumbName ? `/media/image-thumbs/${encodeURIComponent(i.thumbName)}` : '',
      cover: i.thumbName
        ? `/media/image-thumbs/${encodeURIComponent(i.thumbName)}`
        : `/media/images/${encodeURIComponent(i.fileName)}`
    }));
    res.json(payload);
  });

  app.get('/api/images/:id', async (req, res) => {
    const routeId = String(req.params.id || '').toLowerCase();
    if (routeId === 'duplicates' || routeId.startsWith('duplicates')) {
      return handleImageDuplicateQuery(req, res);
    }
    const image = loadIDB().images.find(x => x.id === req.params.id);
    if (!image) return res.status(404).json({ error: '未找到' });
    const updated = await ensureImageThumbnailForRecord(image, imagesDir, imageThumbsDir).catch(() => false);
    if (updated) {
      const idb = loadIDB();
      const idx = (idb.images || []).findIndex(x => x.id === image.id);
      if (idx >= 0) {
        idb.images[idx].thumbName = image.thumbName;
        saveIDB(idb);
      }
    }
    res.json({
      ...image,
      type: 'image',
      url: `/media/images/${encodeURIComponent(image.fileName)}`,
      thumbUrl: image.thumbName ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}` : '',
      cover: image.thumbName
        ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}`
        : `/media/images/${encodeURIComponent(image.fileName)}`
    });
  });

  app.post('/api/images/upload', (req, res) => {
    uploadImage.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '未收到图片文件' });

      const id = path.basename(req.file.filename, path.extname(req.file.filename));
      const originalName = normalizeFileNameWithFallback(req.file.originalname, normalizeUploadFileName);
      const ext = path.extname(originalName).toLowerCase() || path.extname(req.file.filename).toLowerCase();
      const title = String(req.body?.title || path.basename(originalName, path.extname(originalName))).trim() || id;

      const hashMeta = await buildImageHashMeta(req.file.path).catch(() => ({ sha256: '', dHash: '', width: 0, height: 0 }));
      const thumbName = `${id}.webp`;
      const thumbPath = path.join(imageThumbsDir, thumbName);
      await buildImageThumbnail(req.file.path, thumbPath).catch(() => {});
      const idb = loadIDB();
      const image = {
        id,
        title,
        tags: parseTags(req.body?.tags),
        favoriteCategory: '',
        ext,
        fileName: path.basename(req.file.path),
        originalName,
        size: Number(req.file.size || 0),
        mimeType: String(req.file.mimetype || 'application/octet-stream'),
        sha256: String(hashMeta.sha256 || ''),
        dHash: String(hashMeta.dHash || ''),
        thumbName,
        width: Number(hashMeta.width || 0),
        height: Number(hashMeta.height || 0),
        ignoreDuplicate: false,
        uploadedAt: new Date().toISOString(),
        type: 'image'
      };
      idb.images.push(image);
      saveIDB(idb);
      res.json({
        success: true,
        image: {
          ...image,
          url: `/media/images/${encodeURIComponent(image.fileName)}`,
          thumbUrl: image.thumbName ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}` : '',
          cover: image.thumbName
            ? `/media/image-thumbs/${encodeURIComponent(image.thumbName)}`
            : `/media/images/${encodeURIComponent(image.fileName)}`
        }
      });
    });
  });

  app.delete('/api/images/:id', (req, res) => {
    const idb = loadIDB();
    const idx = idb.images.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '未找到' });
    const fileName = String(idb.images[idx].fileName || '').trim();
    const filePath = fileName ? path.join(imagesDir, fileName) : '';
    const thumbName = String(idb.images[idx].thumbName || '').trim();
    const thumbPath = thumbName ? path.join(imageThumbsDir, thumbName) : '';
    if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    if (thumbPath && fs.existsSync(thumbPath)) fs.rmSync(thumbPath, { force: true });
    idb.images.splice(idx, 1);
    saveIDB(idb);
    res.json({ success: true });
  });

  app.put('/api/images/:id', (req, res) => {
    const idb = loadIDB();
    const idx = idb.images.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '未找到' });
    const { title, tags, favoriteCategory, ignoreDuplicate } = req.body || {};
    if (title !== undefined) idb.images[idx].title = String(title || '').trim() || idb.images[idx].title;
    if (tags !== undefined) idb.images[idx].tags = Array.isArray(tags) ? tags : parseTags(tags);
    if (favoriteCategory !== undefined) idb.images[idx].favoriteCategory = normalizeFavoriteCategory(favoriteCategory);
    if (ignoreDuplicate !== undefined) idb.images[idx].ignoreDuplicate = !!ignoreDuplicate;
    saveIDB(idb);
    res.json(idb.images[idx]);
  });

  app.get('/api/images/duplicates', handleImageDuplicateQuery);

  app.post('/api/images/duplicates/ignore', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: '请提供图片 ID 列表' });
    const ignored = req.body?.ignored === false ? false : true;
    const idSet = new Set(ids);
    const idb = loadIDB();
    let affected = 0;
    (idb.images || []).forEach(image => {
      if (!idSet.has(String(image.id || '').trim())) return;
      image.ignoreDuplicate = ignored;
      affected += 1;
    });
    saveIDB(idb);
    res.json({ success: true, affected, ignored });
  });

  app.get('/api/videos', (req, res) => {
    const { search, sort, tag, favorite, favoriteCategory, seriesId } = req.query;
    let list = loadVDB().videos || [];
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(v =>
        String(v.title || '').toLowerCase().includes(q)
        || String(v.originalName || '').toLowerCase().includes(q)
        || String(v.author || '').toLowerCase().includes(q)
      );
    }
    if (tag) list = list.filter(v => (v.tags || []).includes(tag));
    if (favorite === 'true') list = list.filter(v => !!normalizeFavoriteCategory(v.favoriteCategory));
    if (favorite === 'false') list = list.filter(v => !normalizeFavoriteCategory(v.favoriteCategory));
    if (favoriteCategory) {
      const q = normalizeFavoriteCategory(favoriteCategory);
      list = list.filter(v => normalizeFavoriteCategory(v.favoriteCategory) === q);
    }
    if (seriesId) {
      const targetSeriesId = normalizeVideoSeriesIdLocal(seriesId);
      if (targetSeriesId) {
        list = list.filter(v => normalizeVideoSeriesIdLocal(v.seriesId) === targetSeriesId);
      }
    }
    if (sort === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
    } else if (sort === 'title_asc') {
      list = [...list].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    } else if (sort === 'title_desc') {
      list = [...list].sort((a, b) => String(b.title || '').localeCompare(String(a.title || '')));
    } else if (sort === 'author_asc') {
      list = [...list].sort((a, b) => String(a.author || '').localeCompare(String(b.author || '')) || String(a.title || '').localeCompare(String(b.title || '')));
    } else if (sort === 'author_desc') {
      list = [...list].sort((a, b) => String(b.author || '').localeCompare(String(a.author || '')) || String(a.title || '').localeCompare(String(b.title || '')));
    } else if (sort === 'rating_desc') {
      list = [...list].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    } else if (sort === 'rating_asc') {
      list = [...list].sort((a, b) => Number(a.rating || 0) - Number(b.rating || 0) || new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    } else {
      list = [...list].sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    }
    res.json(list.map(v => ({
      ...v,
      type: 'video',
      url: `/media/videos/${encodeURIComponent(v.fileName)}`,
      cover: v.poster || null
    })));
  });

  app.get('/api/videos/:id', (req, res, next) => {
    const routeId = String(req.params.id || '').toLowerCase();
    if (routeId === 'series' || routeId === 'duplicates' || routeId.startsWith('duplicates')) return next();
    const video = loadVDB().videos.find(x => x.id === req.params.id);
    if (!video) return res.status(404).json({ error: '未找到' });
    res.json({
      ...video,
      type: 'video',
      url: `/media/videos/${encodeURIComponent(video.fileName)}`
    });
  });

  app.post('/api/videos/upload', (req, res) => {
    uploadVideo.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '未收到视频文件' });

      const id = path.basename(req.file.filename, path.extname(req.file.filename));
      const originalName = normalizeFileNameWithFallback(req.file.originalname, normalizeUploadFileName);
      const ext = path.extname(originalName).toLowerCase() || path.extname(req.file.filename).toLowerCase();
      const title = String(req.body?.title || path.basename(originalName, path.extname(originalName))).trim() || id;

      const sha256 = await computeFileSha256(req.file.path).catch(() => '');
      const vdb = loadVDB();
      const video = {
        id,
        title,
        author: String(req.body?.author || '').trim(),
        rating: 0,
        seriesId: normalizeVideoSeriesIdLocal(req.body?.seriesId),
        seriesName: normalizeVideoSeriesNameLocal(req.body?.seriesName),
        episodeNo: normalizeVideoEpisodeNoLocal(req.body?.episodeNo),
        tags: parseTags(req.body?.tags),
        favoriteCategory: '',
        ext,
        fileName: path.basename(req.file.path),
        originalName,
        size: Number(req.file.size || 0),
        mimeType: String(req.file.mimetype || 'application/octet-stream'),
        sha256: String(sha256 || ''),
        ignoreDuplicate: false,
        uploadedAt: new Date().toISOString(),
        type: 'video'
      };
      vdb.videos.push(video);
      saveVDB(vdb);
      res.json({ success: true, video: { ...video, url: `/media/videos/${encodeURIComponent(video.fileName)}` } });
    });
  });

  app.delete('/api/videos/:id', (req, res) => {
    const vdb = loadVDB();
    const idx = vdb.videos.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '未找到' });
    const fileName = String(vdb.videos[idx].fileName || '').trim();
    const filePath = fileName ? path.join(videosDir, fileName) : '';
    if (filePath && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    vdb.videos.splice(idx, 1);
    saveVDB(vdb);
    res.json({ success: true });
  });

  app.put('/api/videos/:id', (req, res) => {
    const vdb = loadVDB();
    const idx = vdb.videos.findIndex(x => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '未找到' });
    const { title, author, rating, tags, favoriteCategory, seriesId, seriesName, episodeNo, ignoreDuplicate, cover } = req.body || {};
    if (title !== undefined) vdb.videos[idx].title = String(title || '').trim() || vdb.videos[idx].title;
    if (author !== undefined) vdb.videos[idx].author = String(author || '').trim();
    if (rating !== undefined) {
      const n = Number(rating);
      if (Number.isFinite(n)) vdb.videos[idx].rating = Math.max(0, Math.min(5, Math.round(n)));
    }
    if (tags !== undefined) vdb.videos[idx].tags = Array.isArray(tags) ? tags : parseTags(tags);
    if (favoriteCategory !== undefined) vdb.videos[idx].favoriteCategory = normalizeFavoriteCategory(favoriteCategory);
    if (ignoreDuplicate !== undefined) vdb.videos[idx].ignoreDuplicate = !!ignoreDuplicate;
    if (cover !== undefined) vdb.videos[idx].poster = String(cover || '').trim();
    if (seriesName !== undefined || seriesId !== undefined) {
      const nextSeriesName = seriesName !== undefined
        ? normalizeVideoSeriesNameLocal(seriesName)
        : normalizeVideoSeriesNameLocal(vdb.videos[idx].seriesName);
      const nextSeriesId = seriesId !== undefined
        ? normalizeVideoSeriesIdLocal(seriesId)
        : normalizeVideoSeriesIdLocal(vdb.videos[idx].seriesId || nextSeriesName);
      if (!nextSeriesName && !nextSeriesId) {
        vdb.videos[idx].seriesId = '';
        vdb.videos[idx].seriesName = '';
        vdb.videos[idx].episodeNo = null;
      } else {
        vdb.videos[idx].seriesId = nextSeriesId || normalizeVideoSeriesIdLocal(nextSeriesName);
        vdb.videos[idx].seriesName = nextSeriesName;
      }
    }
    if (episodeNo !== undefined) {
      vdb.videos[idx].episodeNo = normalizeVideoEpisodeNoLocal(episodeNo);
    }
    saveVDB(vdb);
    res.json(vdb.videos[idx]);
  });

  app.get('/api/videos/duplicates', handleVideoDuplicateQuery);

  app.post('/api/videos/duplicates/ignore', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: '请提供视频 ID 列表' });
    const ignored = req.body?.ignored === false ? false : true;
    const idSet = new Set(ids);
    const vdb = loadVDB();
    let affected = 0;
    (vdb.videos || []).forEach(video => {
      if (!idSet.has(String(video.id || '').trim())) return;
      video.ignoreDuplicate = ignored;
      affected += 1;
    });
    saveVDB(vdb);
    res.json({ success: true, affected, ignored });
  });

  app.post('/api/videos/series/view', (req, res) => {
    const seriesId = normalizeVideoSeriesIdLocal(req.body?.seriesId);
    const seriesName = normalizeVideoSeriesNameLocal(req.body?.seriesName);
    if (!seriesId && !seriesName) return res.status(400).json({ error: '缺少连续剧标识' });

    const vdb = loadVDB();
    const normalizedName = normalizeCompareNameLocal(seriesName);
    const now = new Date().toISOString();
    let affected = 0;
    (vdb.videos || []).forEach(video => {
      const hitById = !!seriesId && normalizeVideoSeriesIdLocal(video.seriesId) === seriesId;
      const hitByName = !seriesId && !!normalizedName && normalizeCompareNameLocal(video.seriesName) === normalizedName;
      if (!hitById && !hitByName) return;
      video.seriesViewedAt = now;
      affected += 1;
    });

    if (!affected) return res.status(404).json({ error: '未找到要上报查看的连续剧' });
    saveVDB(vdb);
    res.json({ success: true, affected, seriesViewedAt: now });
  });

  app.get('/api/videos/series', (req, res) => {
    const sort = String(req.query?.sort || 'updated_desc').trim();
    const vdb = loadVDB();
    const videos = Array.isArray(vdb.videos) ? vdb.videos : [];
    const series = sortVideoSeriesCollection(buildVideoSeriesCollection(videos), sort);
    res.json(series);
  });

  app.post('/api/videos/series/apply', (req, res) => {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (!groups.length) return res.status(400).json({ error: '请提供要归档的连续剧分组' });

    const vdb = loadVDB();
    const videos = Array.isArray(vdb.videos) ? vdb.videos : [];
    const { affected, warnings } = applyVideoSeriesGroups(videos, groups);

    if (!affected) {
      return res.status(400).json({ error: warnings[0] || '没有可归档的视频' });
    }

    saveVDB(vdb);
    res.json({ success: true, affected, warnings: warnings.slice(0, 3) });
  });

  app.post('/api/videos/series/archive', (req, res) => {
    const seriesName = normalizeVideoSeriesNameLocal(req.body?.seriesName);
    const startEpisodeInput = Number(req.body?.startEpisodeNo);
    const startEpisodeNo = Number.isFinite(startEpisodeInput) && startEpisodeInput > 0
      ? Math.max(1, Math.floor(startEpisodeInput))
      : 1;
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(id => String(id || '').trim()).filter(Boolean)
      : [];

    if (!seriesName) return res.status(400).json({ error: '连续剧名称不能为空' });
    if (!ids.length) return res.status(400).json({ error: '请提供要归档的视频列表' });

    const vdb = loadVDB();
    const videos = Array.isArray(vdb.videos) ? vdb.videos : [];
    const { affected, warnings } = applyVideoSeriesGroups(videos, [{
      seriesId: normalizeVideoSeriesIdLocal(seriesName),
      seriesName,
      videoIds: ids
    }]);
    if (!affected) {
      return res.status(400).json({ error: warnings[0] || '没有可归档的视频' });
    }
    saveVDB(vdb);
    return res.json({
      success: true,
      affected,
      seriesName,
      seriesId: normalizeVideoSeriesIdLocal(seriesName),
      startEpisodeNo,
      endEpisodeNo: startEpisodeNo + Math.max(affected - 1, 0),
      warnings: warnings.slice(0, 3)
    });
  });

  app.post('/api/videos/series/rename', (req, res) => {
    const seriesId = normalizeVideoSeriesIdLocal(req.body?.seriesId);
    const seriesName = normalizeVideoSeriesNameLocal(req.body?.seriesName);
    const newSeriesName = normalizeVideoSeriesNameLocal(req.body?.newSeriesName);
    if (!seriesId && !seriesName) return res.status(400).json({ error: '缺少连续剧标识' });
    if (!newSeriesName) return res.status(400).json({ error: '新连续剧名称不能为空' });

    const vdb = loadVDB();
    const normalizedCurrentName = normalizeCompareNameLocal(seriesName);
    const targetItems = (vdb.videos || []).filter(video => {
      if (seriesId) return normalizeVideoSeriesIdLocal(video.seriesId) === seriesId;
      return !!normalizedCurrentName && normalizeCompareNameLocal(video.seriesName) === normalizedCurrentName;
    });
    if (!targetItems.length) return res.status(404).json({ error: '未找到要修改的连续剧' });

    const targetKey = seriesId || normalizeCompareNameLocal(seriesName);
    const nextSeriesId = normalizeVideoSeriesIdLocal(newSeriesName);
    const nextNormalizedName = normalizeCompareNameLocal(newSeriesName);
    const hasConflict = (vdb.videos || []).some(video => {
      const videoKey = normalizeVideoSeriesIdLocal(video.seriesId) || normalizeCompareNameLocal(video.seriesName);
      const sameGroup = videoKey === targetKey;
      if (sameGroup) return false;
      const byId = nextSeriesId && normalizeVideoSeriesIdLocal(video.seriesId) === nextSeriesId;
      const byName = !nextSeriesId && nextNormalizedName && normalizeCompareNameLocal(video.seriesName) === nextNormalizedName;
      return byId || byName;
    });
    if (hasConflict) {
      return res.status(400).json({ error: `名称「${newSeriesName}」已被其他连续剧使用，请换一个名称` });
    }

    let affected = 0;
    (vdb.videos || []).forEach(video => {
      const hitById = !!seriesId && normalizeVideoSeriesIdLocal(video.seriesId) === seriesId;
      const hitByName = !seriesId && !!normalizedCurrentName && normalizeCompareNameLocal(video.seriesName) === normalizedCurrentName;
      if (!hitById && !hitByName) return;
      video.seriesName = newSeriesName;
      video.seriesId = nextSeriesId;
      video.seriesUpdatedAt = new Date().toISOString();
      affected += 1;
    });

    if (!affected) return res.status(404).json({ error: '未找到可改名的连续剧数据' });
    saveVDB(vdb);
    res.json({ success: true, affected, seriesId: nextSeriesId, seriesName: newSeriesName });
  });

  app.post('/api/videos/series/clear', (req, res) => {
    const targetsRaw = Array.isArray(req.body?.targets) ? req.body.targets : null;
    const targets = (targetsRaw && targetsRaw.length
      ? targetsRaw
      : [{ seriesId: req.body?.seriesId, seriesName: req.body?.seriesName }])
      .map(item => ({
        seriesId: normalizeVideoSeriesIdLocal(item?.seriesId),
        seriesName: normalizeVideoSeriesNameLocal(item?.seriesName),
        normalizedName: normalizeCompareNameLocal(item?.seriesName)
      }))
      .filter(item => item.seriesId || item.seriesName || item.normalizedName);

    if (!targets.length) return res.status(400).json({ error: '缺少连续剧标识' });

    const vdb = loadVDB();
    let affected = 0;
    (vdb.videos || []).forEach(video => {
      const hit = targets.some(target => {
        if (target.seriesId) return normalizeVideoSeriesIdLocal(video.seriesId) === target.seriesId;
        if (target.normalizedName) return normalizeCompareNameLocal(video.seriesName) === target.normalizedName;
        return false;
      });
      if (!hit) return;
      video.seriesId = '';
      video.seriesName = '';
      video.seriesViewedAt = '';
      video.seriesUpdatedAt = '';
      video.episodeNo = null;
      affected += 1;
    });

    if (!affected) return res.status(404).json({ error: '未找到可清空归档的连续剧数据' });
    saveVDB(vdb);
    res.json({ success: true, affected });
  });

  app.get('/api/media/tags', (req, res) => {
    const type = String(req.query?.type || '').toLowerCase();
    const tags = new Set();
    const source = type === 'image'
      ? loadIDB().images
      : type === 'video'
        ? loadVDB().videos
        : [...(loadIDB().images || []), ...(loadVDB().videos || [])];
    (source || []).forEach(item => (item.tags || []).forEach(t => tags.add(t)));
    res.json([...tags].sort());
  });
}

module.exports = { registerMediaRoutes };
