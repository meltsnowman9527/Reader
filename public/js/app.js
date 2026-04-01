/* ═══════════════════════════════════════════════════════════════
   书库 · app.js  —  漫画 + 小说
   ═══════════════════════════════════════════════════════════════ */

/* ── 全局状态 ─────────────────────────────────────────────────── */
let currentType  = 'manga';   // 'manga' | 'novel' | 'image' | 'video'
let allItems     = [];        // 当前类型下筛选结果
let allTags      = [];
let allAuthors   = [];
let allSeries    = [];
let activeAuthors = [];
let activeTagLib = null;
let activeSeriesLib = null;
let searchQuery  = '';
let sortBy       = 'latest';
let searchDebounce = null;
const LIBRARY_VIEW_STATE_KEY = 'library_view_state';
const SERIES_SORT_KEY = 'series_sort';
const VIDEO_SERIES_SORT_KEY = 'video_series_sort';
const VIDEO_VIEW_HISTORY_KEY = 'video_view_history';
const VIDEO_HISTORY_VIEW_STATE_KEY = 'video_history_view_state';
const VIDEO_THUMBNAIL_STATE_KEY = 'video_preview_time_state';
const VIDEO_FALLBACK_POSTER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#374151"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="160" cy="100" r="36" fill="rgba(255,255,255,0.18)"/><polygon points="150,82 150,118 180,100" fill="rgba(255,255,255,0.92)"/></svg>')}`;
const VIDEO_PREVIEW_MIN_SEC = 2;
const VIDEO_PREVIEW_MIN_RATIO = 0.08;
const VIDEO_PREVIEW_MAX_RATIO = 0.75;
const VIDEO_PREVIEW_FALLBACK_RATIO = 0.38;
let currentView = 'library';
let returnToSeriesViewOnClear = false;
let seriesViewScrollTop = 0;
let seriesSortBy = 'created_desc';
let seriesOverviewItems = [];
let videoSeriesViewScrollTop = 0;
let videoSeriesSortBy = 'updated_desc';
let videoSeriesOverviewItems = [];
let videoSeriesBatchClearMode = false;
let videoSeriesBatchSelectedKeys = new Set();
let videoHistoryViewScrollTop = 0;
let videoHistoryPage = 1;
let videoHistoryPerPage = 20;
let libraryFilterStateByType = {
  manga: { activeAuthors: [], activeTagLib: null, activeSeriesLib: null, searchQuery: '' },
  novel: { activeAuthors: [], activeTagLib: null, activeSeriesLib: null, searchQuery: '' },
  image: { activeAuthors: [], activeTagLib: null, activeSeriesLib: null, searchQuery: '' },
  video: { activeAuthors: [], activeTagLib: null, activeSeriesLib: null, searchQuery: '' }
};

// 书架分页
let libPage = 1, libPerPage = 20;
let libPageByType = { manga: 1, novel: 1, image: 1, video: 1 };

// 标签页
let selectedTags = [], tagItems = [], tagPage = 1, tagPerPage = 20;

// 上传
let uploadTagsManga = [], uploadTagsNovel = [], editTags = [];
let selectedFileManga = [], selectedFileNovel = [];
let selectedFileImage = [], selectedFileVideo = [];
let exportSelected = { manga: new Set(), novel: new Set(), image: new Set(), video: new Set() };
let batchExportMode = false;
let seriesArchiveMode = false;
let seriesSelectedIds = new Set();
let seriesArchivePickerResolver = null;
let seriesArchivePickerContext = {
  mode: 'manga',
  list: [],
  title: '套书归档',
  label: '目标套书',
  targetHint: '选择已有套书可避免重名和错别字。',
  newNameLabel: '新套书名称',
  newNameHint: '新建套书至少需要选择两本漫画。',
  placeholder: '请输入新套书名称',
  fallbackPrompt: '请输入套书名称：'
};
let seriesRemoveMode = false;
let seriesRemoveSelectedIds = new Set();
let showCardActionButtons = false;
let duplicatePairs = [];
let duplicateItems = [];
let duplicatePage = 1;
let duplicatePerPage = 20;
let duplicateThreshold = 0.74;
let duplicateMode = 'title';
let duplicateIgnoredCount = 0;
let duplicateIgnoreMode = false;
let duplicateIgnoreSelected = new Set();
let duplicateIgnoredView = false;
let duplicateIgnoredItems = [];
let duplicateRestoreMode = false;
let duplicateRestoreSelected = new Set();
let novelDuplicatePanelVisible = false;
let novelDuplicateLoading = false;
let novelDuplicateIgnoredView = false;
let novelDuplicateSelectMode = '';
const novelDuplicateSelected = new Set();
let novelDuplicateResult = {
  exactGroups: [],
  ignoredItems: [],
  ignoredCount: 0,
  total: 0
};
const DUPLICATE_THRESHOLD_KEY = 'duplicate_threshold';
let duplicateThresholdTimer = null;
let mobileToolbarExpanded = false;
let favoriteItems = [];
let favoriteCategories = [];
let favoriteCategoryFilter = '';
let favoritePage = 1;
let favoritePerPage = 20;
let favoriteBatchMode = false;
let favoriteBatchSelected = { manga: new Set(), novel: new Set(), image: new Set(), video: new Set() };
let imageItems = [];
let videoItems = [];
let editVideoCoverValue = '';
let editVideoCoverDirty = false;
let editVideoSourceUrl = '';
let desktopContextMenuDismissBound = false;

// 长按检测
const cardLongPressTimers = new Map(); // 存储卡片id => timer
const cardLongPressStarts = new Map(); // 存储卡片id => {x, y, time}
const LONG_PRESS_DURATION = 650; // 长按时间(毫秒)
const LONG_PRESS_MOVE_THRESHOLD = 10; // 移动距离阈值(像素)
const seriesCardLongPressTimers = new Map();
const seriesCardLongPressStarts = new Map();
const cardLongPressSuppressUntil = new Map();
let seriesCardLongPressSuppressUntil = 0;
let seriesRenameTarget = null;
let activeVideoSeriesOverviewKey = '';

// 漫画阅读器
let reader = { id: null, title: '', pages: [], currentPage: 0, horizontal: false, _scrollingTo: -1 };
let pageObserver = null, saveProgressTimer = null;
const READER_EAGER_RANGE = 2;
const READER_WINDOW_BEFORE = 3;
const READER_WINDOW_AFTER = 4;
const READER_PRELOAD_AHEAD = 2;
const READER_MAX_RETRY = 2;
const READER_RETRY_DELAY = 650;
const READER_ZOOM_MIN = 0.6;
const READER_ZOOM_MAX = 2.2;
const READER_ZOOM_STEP = 0.1;
let readerZoomToastTimer = null;
const readerRetryTimers = new Map();
const readerPreloadCache = new Set();

// 小说阅读器
let novel = { id: null, title: '', chapters: [], currentChapter: 0, chapterCount: 0 };
let novelSettings = {
  fontSize: 18,
  lineHeight: 1.9,
  bg: '#fdf6e3',
  color: '#4a3728',
  fontFamily: 'Noto Serif SC, serif'
};
let novelPanelOpen = false;
let novelUIVisible = true;
let novelSaveScrollTimer = null;
let novelAutoAppending = false;
let novelProgressMode = 'book';
let novelSettingsPanelOpen = false;
const NOVEL_MAX_RENDERED_CHAPTER_BLOCKS = 4;
const tagSourceCache = { manga: null, novel: null };

// 阅读进度
const PROGRESS_KEY = 'manga_progress';
const NOVEL_PROGRESS_KEY = 'novel_progress';
const READ_HISTORY_KEY = 'read_history';
function loadProgress()  { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'{}'); } catch { return {}; } }
function loadReadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_HISTORY_KEY) || '{}');
    return {
      manga: raw?.manga && typeof raw.manga === 'object' ? raw.manga : {},
      novel: raw?.novel && typeof raw.novel === 'object' ? raw.novel : {}
    };
  } catch {
    return { manga: {}, novel: {} };
  }
}
function saveReadHistory(history) { localStorage.setItem(READ_HISTORY_KEY, JSON.stringify(history)); }
function touchReadHistory(type, id, ts = Date.now()) {
  const t = type === 'novel' ? 'novel' : 'manga';
  const key = String(id || '').trim();
  if (!key) return;
  const history = loadReadHistory();
  history[t][key] = Number(ts) || Date.now();
  saveReadHistory(history);
}
function getReadTimestamp(type, id) {
  const t = type === 'novel' ? 'novel' : 'manga';
  const key = String(id || '').trim();
  if (!key) return 0;
  const history = loadReadHistory();
  const value = Number(history?.[t]?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}
function applyReadHistorySort(items, typeHint) {
  const list = Array.isArray(items) ? [...items] : [];
  return list.sort((a, b) => {
    const typeA = typeHint || (a?.type === 'novel' ? 'novel' : 'manga');
    const typeB = typeHint || (b?.type === 'novel' ? 'novel' : 'manga');
    const ta = getReadTimestamp(typeA, a?.id);
    const tb = getReadTimestamp(typeB, b?.id);
    if (tb !== ta) return tb - ta;
    return new Date(b?.uploadedAt || 0) - new Date(a?.uploadedAt || 0);
  });
}
function saveProgress(id,page) {
  const p=loadProgress();
  p[id]=page;
  localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));
  touchReadHistory('manga', id);
}
function getProgress(id) { return loadProgress()[id]||0; }
function loadNovelProgress()  { try { return JSON.parse(localStorage.getItem(NOVEL_PROGRESS_KEY)||'{}'); } catch { return {}; } }
function saveNovelProgress(id,state) {
  const p=loadNovelProgress();
  p[id]=state;
  localStorage.setItem(NOVEL_PROGRESS_KEY,JSON.stringify(p));
  touchReadHistory('novel', id);
}
function getNovelProgress(id) {
  const raw = loadNovelProgress()[id];
  if (typeof raw === 'number') {
    const chapter = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    return { chapter, scrollRatio: 0 };
  }
  if (!raw || typeof raw !== 'object') return { chapter: 0, scrollRatio: 0 };
  const chapter = Number(raw.chapter);
  return {
    chapter: Number.isFinite(chapter) ? Math.max(0, Math.floor(chapter)) : 0,
    scrollRatio: Math.max(0, Math.min(1, Number(raw.scrollRatio || 0)))
  };
}

function invalidateTagSourceCache(type) {
  if (!type) {
    tagSourceCache.manga = null;
    tagSourceCache.novel = null;
    return;
  }
  if (tagSourceCache[type] !== undefined) tagSourceCache[type] = null;
}

async function getTagSourceList(type) {
  if (tagSourceCache[type]) return tagSourceCache[type];
  const url = type === 'manga'
    ? '/api/mangas'
    : type === 'novel'
      ? '/api/novels'
      : type === 'image'
        ? '/api/images'
        : '/api/videos';
  const list = await fetch(url).then(r=>r.json());
  tagSourceCache[type] = list;
  return list;
}

function clampNovelChapterIndex(value, chapterCount) {
  const max = Math.max(Number(chapterCount || 0) - 1, 0);
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(Math.floor(num), max));
}

function normalizeType(type) {
  if (type === 'novel' || type === 'image' || type === 'video') return type;
  return 'manga';
}

function normalizeView(view) {
  if (view === 'tags' || view === 'upload' || view === 'duplicates' || view === 'novel-duplicates' || view === 'favorites' || view === 'series' || view === 'images' || view === 'videos' || view === 'image-duplicates' || view === 'video-series' || view === 'video-history' || view === 'video-duplicates') return view;
  return 'library';
}

function normalizeUploadType(type) {
  if (type === 'novel' || type === 'image' || type === 'video') return type;
  return 'manga';
}

function normalizePage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function normalizeSeriesSort(value) {
  const v = String(value || '').trim();
  if (v === 'created_asc' || v === 'updated_desc' || v === 'viewed_desc' || v === 'created_desc') return v;
  return 'created_desc';
}

function loadVideoHistoryViewState() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIDEO_HISTORY_VIEW_STATE_KEY) || '{}');
    const page = Number(raw?.page);
    const perPage = Number(raw?.perPage);
    return {
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
      perPage: [20, 40, 60, 100].includes(Number(perPage)) ? Number(perPage) : 20
    };
  } catch {
    return { page: 1, perPage: 20 };
  }
}

function saveVideoHistoryViewState() {
  localStorage.setItem(VIDEO_HISTORY_VIEW_STATE_KEY, JSON.stringify({
    page: Math.max(1, Math.floor(Number(videoHistoryPage) || 1)),
    perPage: [20, 40, 60, 100].includes(Number(videoHistoryPerPage)) ? Number(videoHistoryPerPage) : 20
  }));
}

function loadVideoViewHistoryMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIDEO_VIEW_HISTORY_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const normalized = {};
    Object.entries(raw).forEach(([id, entry]) => {
      const key = String(id || '').trim();
      if (!key || !entry || typeof entry !== 'object') return;
      const lastViewedAt = Number(entry.lastViewedAt || entry.updatedAt || 0);
      normalized[key] = {
        id: key,
        lastViewedAt: Number.isFinite(lastViewedAt) ? lastViewedAt : 0,
        position: Math.max(0, Number(entry.position || 0) || 0),
        duration: Math.max(0, Number(entry.duration || 0) || 0),
        title: String(entry.title || '').trim(),
        url: String(entry.url || '').trim(),
        cover: String(entry.cover || '').trim(),
        poster: String(entry.poster || '').trim(),
        seriesName: String(entry.seriesName || '').trim(),
        episodeNo: Number(entry.episodeNo)
      };
    });
    return normalized;
  } catch {
    return {};
  }
}

function saveVideoViewHistoryMap(map) {
  localStorage.setItem(VIDEO_VIEW_HISTORY_KEY, JSON.stringify(map && typeof map === 'object' ? map : {}));
}

function formatVideoHistoryTime(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return '未知时间';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '未知时间';
  return d.toLocaleString();
}

function formatVideoHistoryProgress(position, duration) {
  const pos = Math.max(0, Number(position || 0) || 0);
  const dur = Math.max(0, Number(duration || 0) || 0);
  if (!dur || !Number.isFinite(dur)) return '';
  const ratio = Math.max(0, Math.min(1, pos / dur));
  return ` · 进度 ${Math.round(ratio * 100)}%`;
}

function loadVideoPreviewTimeMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIDEO_THUMBNAIL_STATE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const map = {};
    Object.entries(raw).forEach(([id, timeValue]) => {
      const key = String(id || '').trim();
      const t = Number(timeValue);
      if (!key || !Number.isFinite(t) || t <= 0) return;
      map[key] = t;
    });
    return map;
  } catch {
    return {};
  }
}

function getVideoPreviewBounds(duration) {
  const d = Number(duration || 0);
  if (!Number.isFinite(d) || d <= 0) return { min: VIDEO_PREVIEW_MIN_SEC, max: Number.MAX_SAFE_INTEGER };
  const min = Math.max(VIDEO_PREVIEW_MIN_SEC, d * VIDEO_PREVIEW_MIN_RATIO);
  const max = Math.max(min + 0.2, d * VIDEO_PREVIEW_MAX_RATIO);
  return { min, max };
}

function pickStableVideoPreviewTime(currentTime, duration) {
  const current = Number(currentTime || 0);
  const d = Number(duration || 0);
  if (!Number.isFinite(current) || current <= 0.05) {
    if (Number.isFinite(d) && d > 0) {
      const { min, max } = getVideoPreviewBounds(d);
      return Math.max(min, Math.min(max, d * VIDEO_PREVIEW_FALLBACK_RATIO));
    }
    return 0;
  }
  if (!Number.isFinite(d) || d <= 0) return Math.max(0, current);
  const { min, max } = getVideoPreviewBounds(d);
  if (current <= min || current >= d - 0.6) {
    return Math.max(min, Math.min(max, d * VIDEO_PREVIEW_FALLBACK_RATIO));
  }
  return Math.max(min, Math.min(max, current));
}

const appVideoCardFrameCache = new Map();
const appVideoCardFramePending = new Set();

function applyAppVideoCardPoster(videoId, posterDataUrl) {
  const id = String(videoId || '').trim();
  const src = String(posterDataUrl || '').trim();
  if (!id || !src) return;
  const nodes = document.querySelectorAll(`.app-video-cover-thumb[data-video-id="${id}"]`);
  nodes.forEach((img) => {
    img.src = src;
    img.classList.remove('is-fallback');
  });
}

function extractAppVideoPosterFrame(url, previewHint = 0) {
  const srcUrl = String(url || '').trim();
  if (!srcUrl) return Promise.resolve('');
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.muted = true;
    probe.preload = 'metadata';
    probe.playsInline = true;
    probe.setAttribute('playsinline', '');
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    probe.style.width = '2px';
    probe.style.height = '2px';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';

    let done = false;
    const finish = (value = '') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      probe.removeAttribute('src');
      try { probe.load(); } catch {}
      if (probe.parentNode) probe.parentNode.removeChild(probe);
      resolve(String(value || ''));
    };

    const drawFrame = () => {
      try {
        const width = Math.max(2, Number(probe.videoWidth || 0));
        const height = Math.max(2, Number(probe.videoHeight || 0));
        if (width < 8 || height < 8) {
          finish('');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish('');
          return;
        }
        ctx.drawImage(probe, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (String(dataUrl || '').startsWith('data:image/')) {
          finish(dataUrl);
          return;
        }
      } catch {}
      finish('');
    };

    const seekFrame = () => {
      try {
        const duration = Number(probe.duration || 0);
        let target = Number(previewHint || 0);
        if (Number.isFinite(duration) && duration > 0) {
          if (!(Number.isFinite(target) && target > 0)) target = duration * VIDEO_PREVIEW_FALLBACK_RATIO;
          target = pickStableVideoPreviewTime(target, duration);
        } else {
          target = Math.max(0.3, Number.isFinite(target) && target > 0 ? target : VIDEO_PREVIEW_MIN_SEC);
        }
        if (Math.abs(Number(probe.currentTime || 0) - target) < 0.04) {
          drawFrame();
          return;
        }
        probe.currentTime = target;
      } catch {
        drawFrame();
      }
    };

    const timer = setTimeout(() => finish(''), 4200);
    probe.addEventListener('loadedmetadata', seekFrame, { once: true });
    probe.addEventListener('seeked', drawFrame, { once: true });
    probe.addEventListener('error', () => finish(''), { once: true });
    probe.src = srcUrl;
    document.body.appendChild(probe);
  });
}

function hydrateAppVideoCardPoster(node) {
  const id = String(node?.dataset?.videoId || '').trim();
  if (!id) return;
  const cached = String(appVideoCardFrameCache.get(id) || '').trim();
  if (cached) {
    applyAppVideoCardPoster(id, cached);
    return;
  }
  if (appVideoCardFramePending.has(id)) return;

  const url = String(node?.dataset?.videoUrl || '').trim();
  if (!url) return;
  const previewHint = Number(node?.dataset?.previewTime || 0);
  appVideoCardFramePending.add(id);
  extractAppVideoPosterFrame(url, previewHint)
    .then((dataUrl) => {
      const next = String(dataUrl || '').trim();
      if (!next) return;
      appVideoCardFrameCache.set(id, next);
      applyAppVideoCardPoster(id, next);
    })
    .finally(() => {
      appVideoCardFramePending.delete(id);
    });
}

function initAppVideoPreviewFrames(root) {
  const nodes = (root instanceof Element ? root : document).querySelectorAll('.app-video-cover-thumb[data-video-id]');
  nodes.forEach((node) => hydrateAppVideoCardPoster(node));
}

async function renderVideoHistory(options = {}) {
  const { resetPage = false } = options;
  const historyMap = loadVideoViewHistoryMap();
  const entries = Object.values(historyMap)
    .filter(entry => entry?.id)
    .sort((a, b) => Number(b?.lastViewedAt || 0) - Number(a?.lastViewedAt || 0));

  let videos = [];
  try {
    videos = await fetch('/api/videos').then(r => r.json());
  } catch {
    videos = [];
  }
  const byId = new Map((Array.isArray(videos) ? videos : []).map(item => [String(item?.id || ''), item]));
  const previewMap = loadVideoPreviewTimeMap();
  const q = String(searchQuery || '').trim().toLowerCase();
  const merged = entries.map(entry => {
    const latest = byId.get(String(entry.id || ''));
    const base = latest ? { ...latest } : { ...entry };
    const cachedPreview = Number(previewMap[String(entry.id || '').trim()] || 0);
    const duration = Number(entry.duration || base.duration || 0);
    const historyPosition = Number(entry.position || 0);
    const previewCandidate = cachedPreview > 0 ? cachedPreview : historyPosition;
    const stablePreview = pickStableVideoPreviewTime(previewCandidate, duration);
    return {
      ...base,
      id: String(entry.id || base.id || '').trim(),
      type: 'video',
      historyLabel: `最近观看：${formatVideoHistoryTime(entry.lastViewedAt)}${formatVideoHistoryProgress(entry.position, entry.duration)}`,
      _historyTs: Number(entry.lastViewedAt || 0),
      _previewTime: stablePreview
    };
  }).filter(item => item.id && item.url);

  const filtered = q
    ? merged.filter(item => [item.title, item.seriesName, item.originalName]
      .map(v => String(v || '').toLowerCase())
      .some(v => v.includes(q)))
    : merged;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / videoHistoryPerPage));
  if (resetPage) videoHistoryPage = 1;
  if (videoHistoryPage > totalPages) videoHistoryPage = totalPages;
  videoHistoryPage = Math.max(1, Math.floor(Number(videoHistoryPage) || 1));
  saveVideoHistoryViewState();

  const countEl = document.getElementById('videoHistoryCount');
  if (countEl) {
    countEl.textContent = `${total} 条历史${totalPages > 1 ? `（第 ${videoHistoryPage}/${totalPages} 页）` : ''}`;
  }

  const slice = filtered.slice((videoHistoryPage - 1) * videoHistoryPerPage, videoHistoryPage * videoHistoryPerPage);
  renderCards('videoHistoryGrid', slice);
  renderPagination('videoHistoryPagination', videoHistoryPage, totalPages, p => {
    videoHistoryPage = p;
    saveVideoHistoryViewState();
    renderVideoHistory();
  });
}

function changeVideoHistoryPerPage(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || ![20, 40, 60, 100].includes(next)) return;
  videoHistoryPerPage = next;
  videoHistoryPage = 1;
  saveVideoHistoryViewState();
  if (currentView === 'video-history') renderVideoHistory({ resetPage: true });
}

function clearVideoHistoryAll() {
  const historyMap = loadVideoViewHistoryMap();
  const count = Object.keys(historyMap).length;
  if (!count) {
    showToast('暂无可清空的视频历史', '');
    return;
  }
  if (!confirm(`确定清空 ${count} 条视频观看历史吗？`)) return;
  saveVideoViewHistoryMap({});
  videoHistoryPage = 1;
  saveVideoHistoryViewState();
  if (currentView === 'video-history') renderVideoHistory({ resetPage: true });
  showToast('已清空视频观看历史', 'success');
}

function normalizeVideoSeriesSort(value) {
  const v = String(value || '').trim();
  if (v === 'created_asc' || v === 'updated_desc' || v === 'viewed_desc' || v === 'created_desc') return v;
  return 'updated_desc';
}

function getWindowScrollTop() {
  return Math.max(window.scrollY || 0, document.documentElement?.scrollTop || 0, document.body?.scrollTop || 0);
}

function sortSeriesForView(items, sort) {
  const list = Array.isArray(items) ? [...items] : [];
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

function normalizeFilterStateEntry(entry) {
  const input = entry && typeof entry === 'object' ? entry : {};
  const authors = Array.isArray(input.activeAuthors)
    ? [...new Set(input.activeAuthors.map(v => String(v || '').trim()).filter(Boolean))]
    : [];
  const tagRaw = String(input.activeTagLib || '').trim();
  const searchRaw = String(input.searchQuery || '').trim();
  const seriesId = String(input?.activeSeriesLib?.seriesId || '').trim();
  const seriesName = String(input?.activeSeriesLib?.seriesName || '').trim();
  return {
    activeAuthors: authors,
    activeTagLib: tagRaw || null,
    activeSeriesLib: (seriesId || seriesName) ? { seriesId, seriesName } : null,
    searchQuery: searchRaw
  };
}

function normalizeFilterStateByType(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    manga: normalizeFilterStateEntry(input.manga),
    novel: normalizeFilterStateEntry(input.novel),
    image: normalizeFilterStateEntry(input.image),
    video: normalizeFilterStateEntry(input.video)
  };
}

function updateHeaderNavByType() {
  const hideMangaOnlyViews = currentType !== 'manga';
  const hideLibraryView = currentType === 'image' || currentType === 'video';
  const showImageOnlyView = currentType === 'image';
  const showVideoOnlyView = currentType === 'video';
  const showNovelOnlyView = currentType === 'novel';
  const libraryBtn = document.querySelector('.header-nav .nav-btn[data-view="library"]');
  const duplicateBtn = document.querySelector('.header-nav .nav-btn[data-view="duplicates"]');
  const novelDuplicateBtn = document.querySelector('.header-nav .nav-btn[data-view="novel-duplicates"]');
  const seriesBtn = document.querySelector('.header-nav .nav-btn[data-view="series"]');
  const imageDuplicateBtn = document.querySelector('.header-nav .nav-btn[data-view="image-duplicates"]');
  const videoDuplicateBtn = document.querySelector('.header-nav .nav-btn[data-view="video-duplicates"]');
  const videoSeriesBtn = document.querySelector('.header-nav .nav-btn[data-view="video-series"]');
  const videoHistoryBtn = document.querySelector('.header-nav .nav-btn[data-view="video-history"]');
  if (libraryBtn) libraryBtn.style.display = hideLibraryView ? 'none' : '';
  if (duplicateBtn) duplicateBtn.style.display = hideMangaOnlyViews ? 'none' : '';
  if (novelDuplicateBtn) novelDuplicateBtn.style.display = showNovelOnlyView ? '' : 'none';
  if (seriesBtn) seriesBtn.style.display = hideMangaOnlyViews ? 'none' : '';
  if (imageDuplicateBtn) imageDuplicateBtn.style.display = showImageOnlyView ? '' : 'none';
  if (videoDuplicateBtn) videoDuplicateBtn.style.display = showVideoOnlyView ? '' : 'none';
  if (videoSeriesBtn) videoSeriesBtn.style.display = showVideoOnlyView ? '' : 'none';
  if (videoHistoryBtn) videoHistoryBtn.style.display = showVideoOnlyView ? '' : 'none';
}

function syncCurrentFilterStateToCache() {
  libraryFilterStateByType[currentType] = normalizeFilterStateEntry({
    activeAuthors,
    activeTagLib,
    activeSeriesLib,
    searchQuery
  });
}

function applyCachedFilterStateForCurrentType() {
  const state = normalizeFilterStateEntry(libraryFilterStateByType[currentType]);
  activeAuthors = [...state.activeAuthors];
  activeTagLib = state.activeTagLib;
  activeSeriesLib = state.activeSeriesLib ? { ...state.activeSeriesLib } : null;
  searchQuery = state.searchQuery;
}

function loadLibraryViewState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIBRARY_VIEW_STATE_KEY) || '{}');
    return {
      currentType: normalizeType(raw.currentType),
      currentView: normalizeView(raw.currentView),
      uploadType: normalizeUploadType(raw.uploadType),
      libPerPage: [20, 40, 60].includes(Number(raw.libPerPage)) ? Number(raw.libPerPage) : 20,
      libPageByType: {
        manga: normalizePage(raw?.libPageByType?.manga),
        novel: normalizePage(raw?.libPageByType?.novel),
        image: normalizePage(raw?.libPageByType?.image),
        video: normalizePage(raw?.libPageByType?.video)
      },
      filterStateByType: normalizeFilterStateByType(raw?.filterStateByType)
    };
  } catch {
    return {
      currentType: 'manga',
      currentView: 'library',
      uploadType: 'manga',
      libPerPage: 20,
      libPageByType: { manga: 1, novel: 1, image: 1, video: 1 },
      filterStateByType: normalizeFilterStateByType(null)
    };
  }
}

function saveLibraryViewState() {
  syncCurrentFilterStateToCache();
  const payload = {
    currentType: normalizeType(currentType),
    currentView: normalizeView(currentView),
    uploadType: normalizeUploadType(currentUploadType),
    libPerPage: [20, 40, 60].includes(Number(libPerPage)) ? Number(libPerPage) : 20,
    libPageByType: {
      manga: normalizePage(libPageByType.manga),
      novel: normalizePage(libPageByType.novel),
      image: normalizePage(libPageByType.image),
      video: normalizePage(libPageByType.video)
    },
    filterStateByType: normalizeFilterStateByType(libraryFilterStateByType)
  };
  localStorage.setItem(LIBRARY_VIEW_STATE_KEY, JSON.stringify(payload));
}

function setCurrentLibraryPage(page) {
  libPage = normalizePage(page);
  libPageByType[currentType] = libPage;
  saveLibraryViewState();
}

function syncSearchInputs(value) {
  const next = String(value || '');
  const desktop = document.getElementById('searchInput');
  const mobile = document.getElementById('mobileSearchInput');
  const video = document.getElementById('videoSearchInput');
  if (desktop && desktop.value !== next) desktop.value = next;
  if (mobile && mobile.value !== next) mobile.value = next;
  if (video && video.value !== next) video.value = next;
}

function handleMobileSearchInput(value) {
  syncSearchInputs(value);
  debounceSearch();
}

/* ── Init ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const videoHistoryState = loadVideoHistoryViewState();
  videoHistoryPage = videoHistoryState.page;
  videoHistoryPerPage = videoHistoryState.perPage;
  const viewState = loadLibraryViewState();
  currentType = viewState.currentType;
  currentView = viewState.currentView;
  currentUploadType = normalizeUploadType(viewState.uploadType);
  libraryFilterStateByType = normalizeFilterStateByType(viewState.filterStateByType);
  applyCachedFilterStateForCurrentType();
  libPerPage = viewState.libPerPage;
  libPageByType = {
    manga: normalizePage(viewState.libPageByType.manga),
    novel: normalizePage(viewState.libPageByType.novel),
    image: normalizePage(viewState.libPageByType.image),
    video: normalizePage(viewState.libPageByType.video)
  };
  libPage = normalizePage(libPageByType[currentType]);

  document.getElementById('typeManga').classList.toggle('active', currentType === 'manga');
  document.getElementById('typeNovel').classList.toggle('active', currentType === 'novel');
  document.getElementById('typeImage').classList.toggle('active', currentType === 'image');
  document.getElementById('typeVideo').classList.toggle('active', currentType === 'video');
  updateHeaderNavByType();
  syncSearchInputs(searchQuery);
  const perPageSelect = document.getElementById('perPageSelect');
  if (perPageSelect) perPageSelect.value = String(libPerPage);
  const favoritePerPageSelect = document.getElementById('favoritePerPageSelect');
  if (favoritePerPageSelect) favoritePerPageSelect.value = String(favoritePerPage);
  seriesSortBy = normalizeSeriesSort(localStorage.getItem(SERIES_SORT_KEY));
  const seriesSortSelect = document.getElementById('seriesSortSelect');
  if (seriesSortSelect) seriesSortSelect.value = seriesSortBy;
  videoSeriesSortBy = normalizeVideoSeriesSort(localStorage.getItem(VIDEO_SERIES_SORT_KEY));
  const videoSeriesSortSelect = document.getElementById('videoSeriesSortSelect');
  if (videoSeriesSortSelect) videoSeriesSortSelect.value = videoSeriesSortBy;
  const videoHistoryPerPageSelect = document.getElementById('videoHistoryPerPageSelect');
  if (videoHistoryPerPageSelect) videoHistoryPerPageSelect.value = String(videoHistoryPerPage);

  loadNovelSettings();
  loadDuplicateThreshold();
  initCardActionToggle();
  initDesktopContextMenuDismiss();
  initMobileLongPressConflictGuard();
  switchUploadType(currentUploadType);
  showView(currentView, true);
  if (currentView !== 'favorites' && currentView !== 'images' && currentView !== 'videos' && currentView !== 'video-history' && currentView !== 'video-duplicates' && currentView !== 'novel-duplicates') loadLibrary();
  loadMeta();
  setupAuthorSuggestions();
  setupReaderZoomWheel();
  updateMangaFeatureButtons();
  renderMobileToolbarState();
  if (currentView === 'images') loadImages();
  if (currentView === 'videos') loadVideos();
});

function initMobileLongPressConflictGuard() {
  if (window.__mobileLongPressGuardBound) return;
  window.__mobileLongPressGuardBound = true;

  const isMobile = () => window.matchMedia('(max-width:720px)').matches;
  const shouldBlockTarget = (target) => {
    if (!(target instanceof Element)) return false;
    const inMangaCard = currentView === 'library'
      && currentType === 'manga'
      && !!target.closest('#view-library .manga-card');
    const inImageCard = currentView === 'images'
      && !!target.closest('#view-images .media-card');
    const inVideoCard = (currentView === 'videos' && !!target.closest('#view-videos .media-card'))
      || (currentView === 'video-history' && !!target.closest('#view-video-history .media-card'));
    return inMangaCard || inImageCard || inVideoCard;
  };

  document.addEventListener('contextmenu', (event) => {
    if (!isMobile()) return;
    if (!shouldBlockTarget(event.target)) return;
    event.preventDefault();
  }, { capture: true });

  document.addEventListener('selectstart', (event) => {
    if (!isMobile()) return;
    if (!shouldBlockTarget(event.target)) return;
    event.preventDefault();
  }, { capture: true });

  document.addEventListener('dragstart', (event) => {
    if (!isMobile()) return;
    if (!shouldBlockTarget(event.target)) return;
    event.preventDefault();
  }, { capture: true });

}

window.addEventListener('resize', () => {
  renderMobileToolbarState();
});

function loadDuplicateThreshold() {
  const range = document.getElementById('duplicateThresholdRange');
  const label = document.getElementById('duplicateThresholdLabel');
  try {
    const raw = Number(localStorage.getItem(DUPLICATE_THRESHOLD_KEY));
    if (Number.isFinite(raw)) duplicateThreshold = Math.max(0.5, Math.min(0.95, raw));
  } catch {}
  if (range) range.value = String(Math.round(duplicateThreshold * 100));
  if (label) label.textContent = `${Math.round(duplicateThreshold * 100)}%`;
}

function saveDuplicateThreshold() {
  localStorage.setItem(DUPLICATE_THRESHOLD_KEY, String(duplicateThreshold));
}

function handleDuplicateThresholdInput(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return;
  duplicateThreshold = Math.max(0.5, Math.min(0.95, num / 100));
  const label = document.getElementById('duplicateThresholdLabel');
  if (label) label.textContent = `${Math.round(duplicateThreshold * 100)}%`;
  saveDuplicateThreshold();
  clearTimeout(duplicateThresholdTimer);
  duplicateThresholdTimer = setTimeout(() => {
    if (currentView === 'duplicates') runDuplicateCheckAction(true);
  }, 220);
}

function applyDuplicateThreshold(value) {
  handleDuplicateThresholdInput(value);
  clearTimeout(duplicateThresholdTimer);
  if (currentView === 'duplicates') runDuplicateCheckAction(true);
}

function switchDuplicateMode(mode) {
  if (currentType !== 'manga') return;
  const validMode = mode === 'hash' ? 'hash' : 'title';
  if (duplicateMode === validMode) return;
  duplicateMode = validMode;
  const btn = document.getElementById('duplicateModeBtn');
  const thresholdControl = document.getElementById('thresholdControl');
  if (btn) {
    btn.textContent = duplicateMode === 'hash' ? '🏷️ 切换为标题查重' : '🔐 切换为内容查重';
  }
  if (thresholdControl) {
    thresholdControl.style.display = duplicateMode === 'hash' ? 'none' : '';
  }
  if (currentView === 'duplicates') runDuplicateCheckAction(false);
}

function isMobileLibraryViewport() {
  return window.matchMedia('(max-width:720px)').matches;
}

function shouldForceMobileToolbarExpand() {
  return batchExportMode || seriesArchiveMode || seriesRemoveMode;
}

function renderMobileToolbarState() {
  const toolbar = document.querySelector('#view-library .toolbar');
  const moreBtn = document.getElementById('mobileToolbarMoreBtn');
  if (!toolbar || !moreBtn) return;
  toolbar.classList.toggle('batch-export-mode', !!batchExportMode);
  const isMobile = isMobileLibraryViewport();
  const expanded = isMobile && (mobileToolbarExpanded || shouldForceMobileToolbarExpand());
  toolbar.classList.toggle('mobile-expanded', expanded);
  moreBtn.style.display = isMobile ? '' : 'none';
  moreBtn.textContent = expanded ? '收起 ▴' : '更多 ▾';
}

function toggleMobileToolbarMore() {
  mobileToolbarExpanded = !mobileToolbarExpanded;
  renderMobileToolbarState();
}

function initCardActionToggle() {
  const toggle = document.getElementById('cardActionToggle');
  if (!toggle) return;
  toggle.checked = showCardActionButtons;
  const dupToggle = document.getElementById('dupCardActionToggle');
  const imageToggle = document.getElementById('imageCardActionToggle');
  const videoToggle = document.getElementById('videoCardActionToggle');
  if (dupToggle) dupToggle.checked = showCardActionButtons;
  if (imageToggle) imageToggle.checked = showCardActionButtons;
  if (videoToggle) videoToggle.checked = showCardActionButtons;
}

function toggleCardActionButtons(enabled) {
  showCardActionButtons = !!enabled;
  const libToggle = document.getElementById('cardActionToggle');
  const dupToggle = document.getElementById('dupCardActionToggle');
  const imageToggle = document.getElementById('imageCardActionToggle');
  const videoToggle = document.getElementById('videoCardActionToggle');
  if (libToggle) libToggle.checked = showCardActionButtons;
  if (dupToggle) dupToggle.checked = showCardActionButtons;
  if (imageToggle) imageToggle.checked = showCardActionButtons;
  if (videoToggle) videoToggle.checked = showCardActionButtons;
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
  if (activeView === 'view-duplicates') renderDuplicateView();
  if (activeView === 'view-favorites') renderFavorites();
  if (activeView === 'view-images') loadImages();
  if (activeView === 'view-videos') loadVideos();
  if (activeView === 'view-video-history') renderVideoHistory();
  renderMobileToolbarState();
}
window.toggleCardActionButtons = toggleCardActionButtons;

function initDesktopContextMenuDismiss() {
  if (desktopContextMenuDismissBound) return;
  desktopContextMenuDismissBound = true;
  document.addEventListener('contextmenu', (event) => {
    if (window.matchMedia('(max-width:720px)').matches) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.view.active')) return;
    if (target.closest('.manga-card, .media-card, .series-card, .card-actions, .card-btn')) return;
    if (target.closest('.toolbar, .action-toggle, .clear-btn, button, a, label, input, textarea, select, video, canvas')) return;
    if (target.closest('.edit-modal, .modal-card, .reader-modal, .media-modal, .novel-modal, #seriesArchiveModal, #seriesRenameModal')) return;
    if (showCardActionButtons) {
      event.preventDefault();
      toggleCardActionButtons(false);
      showToast('已隐藏管理按钮', '');
    }
    // 未显示管理按钮时允许浏览器原生菜单
  });
}

function syncDuplicateActionToggle(enabled) {
  toggleCardActionButtons(enabled);
}

function updateMangaFeatureButtons() {
  const isManga = currentType === 'manga';
  const viewingSeries = !!activeSeriesLib;
  const libraryToolbar = document.querySelector('#view-library .toolbar');
  const sortWrap = document.getElementById('sortWrap');
  const perPageWrap = document.getElementById('perPageWrap');
  if (libraryToolbar) {
    libraryToolbar.classList.toggle('series-viewing', isManga && viewingSeries);
    libraryToolbar.classList.toggle('series-archive-mode', isManga && !viewingSeries && seriesArchiveMode);
    libraryToolbar.classList.toggle('type-novel', currentType === 'novel');
  }
  if (!viewingSeries && seriesRemoveMode) {
    seriesRemoveMode = false;
    seriesRemoveSelectedIds.clear();
  }
  const seriesBtn = document.getElementById('seriesArchiveBtn');
  const seriesBtnDup = document.getElementById('seriesArchiveBtnDup');
  const cancelSeriesBtn = document.getElementById('cancelSeriesArchiveBtn');
  const cancelSeriesBtnDup = document.getElementById('cancelSeriesArchiveBtnDup');
  const seriesRenameBtn = document.getElementById('seriesRenameBtn');
  const seriesRemoveBtn = document.getElementById('seriesRemoveBtn');
  const cancelSeriesRemoveBtn = document.getElementById('cancelSeriesRemoveBtn');
  if (seriesBtn) seriesBtn.style.display = isManga && !viewingSeries ? '' : 'none';
  if (seriesBtnDup) seriesBtnDup.style.display = isManga && !viewingSeries ? '' : 'none';
  if (cancelSeriesBtn) cancelSeriesBtn.style.display = isManga && !viewingSeries && seriesArchiveMode ? '' : 'none';
  if (cancelSeriesBtnDup) cancelSeriesBtnDup.style.display = isManga && !viewingSeries && seriesArchiveMode ? '' : 'none';
  if (seriesRenameBtn) seriesRenameBtn.style.display = isManga && viewingSeries ? '' : 'none';
  if (seriesRemoveBtn) {
    seriesRemoveBtn.style.display = isManga && viewingSeries ? '' : 'none';
    seriesRemoveBtn.textContent = seriesRemoveMode
      ? `🗂 移出已选（${seriesRemoveSelectedIds.size}）`
      : '🗂 批量移出套书';
  }
  if (cancelSeriesRemoveBtn) cancelSeriesRemoveBtn.style.display = isManga && viewingSeries && seriesRemoveMode ? '' : 'none';
  if (sortWrap) sortWrap.style.display = isManga && viewingSeries ? 'none' : '';
  if (perPageWrap) perPageWrap.style.display = isManga && viewingSeries ? 'none' : '';
  renderMobileToolbarState();
}

/* ── 视图切换 ─────────────────────────────────────────────────── */
function showView(name, fromPopState = false) {
  // 兜底：防止查看器关闭异常后遗留 overflow:hidden，导致移动端底部内容滚不到
  document.body.style.overflow = '';
  if (currentView === 'series' && name !== 'series') {
    seriesViewScrollTop = getWindowScrollTop();
  }
  if (currentView === 'video-series' && name !== 'video-series') {
    videoSeriesViewScrollTop = getWindowScrollTop();
  }
  if (currentView === 'video-history' && name !== 'video-history') {
    videoHistoryViewScrollTop = getWindowScrollTop();
  }
  currentView = normalizeView(name);
  if (currentView === 'library' && currentType === 'image') currentView = 'images';
  if (currentView === 'library' && currentType === 'video') currentView = 'videos';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if ((currentView === 'duplicates' || currentView === 'series') && currentType !== 'manga') {
    currentType = 'manga';
    document.getElementById('typeManga').classList.add('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.remove('active');
    updateHeaderNavByType();
    loadLibrary({ resetPage: false });
    loadMeta();
  }
  if ((currentView === 'images' || currentView === 'image-duplicates') && currentType !== 'image') {
    currentType = 'image';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.add('active');
    document.getElementById('typeVideo').classList.remove('active');
    updateHeaderNavByType();
    loadMeta();
  }
  if (currentView === 'videos' && currentType !== 'video') {
    currentType = 'video';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.add('active');
    updateHeaderNavByType();
    loadMeta();
  }
  if (currentView === 'video-series' && currentType !== 'video') {
    currentType = 'video';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.add('active');
    updateHeaderNavByType();
    loadMeta();
  }
  if (currentView === 'video-history' && currentType !== 'video') {
    currentType = 'video';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.add('active');
    updateHeaderNavByType();
    loadMeta();
  }
  if (currentView === 'video-duplicates' && currentType !== 'video') {
    currentType = 'video';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.remove('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.add('active');
    updateHeaderNavByType();
    loadMeta();
  }
  if (currentView === 'novel-duplicates' && currentType !== 'novel') {
    currentType = 'novel';
    document.getElementById('typeManga').classList.remove('active');
    document.getElementById('typeNovel').classList.add('active');
    document.getElementById('typeImage').classList.remove('active');
    document.getElementById('typeVideo').classList.remove('active');
    updateHeaderNavByType();
    loadMeta();
  }
  document.getElementById('view-' + currentView).classList.add('active');
  const btn = document.querySelector('[data-view="' + currentView + '"]');
  if (btn) btn.classList.add('active');
  if (currentView !== 'library' && batchExportMode) exitBatchExportMode();
  if (currentView !== 'library' && seriesArchiveMode) exitSeriesArchiveMode();
  if (currentView !== 'library' && seriesRemoveMode) exitSeriesRemoveMode();
  if (currentView !== 'duplicates' && duplicateIgnoreMode) exitDuplicateIgnoreMode();
  if (currentView !== 'duplicates' && duplicateRestoreMode) exitDuplicateRestoreMode();
  if (currentView !== 'favorites' && favoriteBatchMode) exitFavoriteBatchMode();
  if (currentView !== 'video-series' && videoSeriesBatchClearMode) exitVideoSeriesBatchClearMode();
  if (currentView === 'duplicates') loadDuplicateWorkspace({ keepPage: true });
  if (currentView === 'series') renderSeriesOverview();
  if (currentView === 'video-series') renderVideoSeriesOverview();
  if (currentView === 'video-history') renderVideoHistory();
  if (currentView === 'novel-duplicates') runNovelDuplicateCheck();
  if (currentView === 'tags') renderTagFilterCloud();
  if (currentView === 'favorites') loadFavorites({ resetPage: true });
  if (currentView === 'images') loadImages();
  if (currentView === 'image-duplicates') window.MediaFeature?.openImageDuplicatePage?.();
  if (currentView === 'video-duplicates') window.MediaFeature?.openVideoDuplicatePage?.();
  if (currentView === 'videos') loadVideos();
  // 固定导航顺序：图片 -> 图片查重 -> 视频 -> 视频查重，仅根据类型/视图控制显示隐藏
  const imageBtn = document.querySelector('[data-view="images"]');
  const videoBtn = document.querySelector('[data-view="videos"]');
  const videoDupBtn = document.querySelector('[data-view="video-duplicates"]');
  const videoSeriesBtn = document.querySelector('[data-view="video-series"]');
  const videoHistoryBtn = document.querySelector('[data-view="video-history"]');
  if (imageBtn && videoBtn) {
    const imageDupBtn = document.querySelector('[data-view="image-duplicates"]');
    if (currentType === 'manga' || currentType === 'novel') {
      imageBtn.style.display = 'none';
      videoBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'none';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'none';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'none';
      if (imageDupBtn) imageDupBtn.style.display = 'none';
    } else if (currentView === 'images') {
      imageBtn.style.display = 'inline-block';
      videoBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'none';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'none';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'none';
      if (imageDupBtn) imageDupBtn.style.display = 'inline-block';
    } else if (currentView === 'image-duplicates') {
      imageBtn.style.display = 'inline-block';
      videoBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'none';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'none';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'none';
      if (imageDupBtn) imageDupBtn.style.display = 'inline-block';
    } else if (currentView === 'videos') {
      videoBtn.style.display = 'inline-block';
      imageBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'inline-block';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'inline-block';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'inline-block';
      if (imageDupBtn) imageDupBtn.style.display = 'none';
    } else if (currentView === 'video-duplicates') {
      videoBtn.style.display = 'inline-block';
      imageBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'inline-block';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'inline-block';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'inline-block';
      if (imageDupBtn) imageDupBtn.style.display = 'none';
    } else if (currentView === 'video-series') {
      videoBtn.style.display = 'inline-block';
      imageBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'inline-block';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'inline-block';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'inline-block';
      if (imageDupBtn) imageDupBtn.style.display = 'none';
    } else if (currentView === 'video-history') {
      videoBtn.style.display = 'inline-block';
      imageBtn.style.display = 'none';
      if (videoDupBtn) videoDupBtn.style.display = 'inline-block';
      if (videoSeriesBtn) videoSeriesBtn.style.display = 'inline-block';
      if (videoHistoryBtn) videoHistoryBtn.style.display = 'inline-block';
      if (imageDupBtn) imageDupBtn.style.display = 'none';
    } else {
      imageBtn.style.display = 'inline-block';
      videoBtn.style.display = 'inline-block';
      if (videoDupBtn) videoDupBtn.style.display = currentType === 'video' ? 'inline-block' : 'none';
      if (videoSeriesBtn) videoSeriesBtn.style.display = currentType === 'video' ? 'inline-block' : 'none';
      if (videoHistoryBtn) videoHistoryBtn.style.display = currentType === 'video' ? 'inline-block' : 'none';
      if (imageDupBtn) imageDupBtn.style.display = currentType === 'image' ? 'inline-block' : 'none';
    }
  }
  if (currentView === 'series') {
    requestAnimationFrame(() => {
      window.scrollTo({ top: seriesViewScrollTop, behavior: 'auto' });
    });
  }
  if (currentView === 'video-series') {
    requestAnimationFrame(() => {
      window.scrollTo({ top: videoSeriesViewScrollTop, behavior: 'auto' });
    });
  }
  if (currentView === 'video-history') {
    requestAnimationFrame(() => {
      window.scrollTo({ top: videoHistoryViewScrollTop, behavior: 'auto' });
    });
  }
  saveLibraryViewState();
  if (!fromPopState && currentView !== 'library') history.pushState({ view: currentView }, '', '');
}

/* ── 漫画/小说切换 ────────────────────────────────────────────── */
function switchType(type) {
  const nextType = normalizeType(type);
  libPageByType[currentType] = normalizePage(libPage);
  currentType = nextType;
  if (currentType !== 'manga') returnToSeriesViewOnClear = false;
  document.getElementById('typeManga').classList.toggle('active', currentType === 'manga');
  document.getElementById('typeNovel').classList.toggle('active', currentType === 'novel');
  document.getElementById('typeImage').classList.toggle('active', currentType === 'image');
  document.getElementById('typeVideo').classList.toggle('active', currentType === 'video');
  updateHeaderNavByType();
  activeAuthors = []; activeTagLib = null; activeSeriesLib = null; searchQuery = '';
  selectedTags = []; tagItems = []; tagPage = 1;
  syncSearchInputs('');
  if (currentType !== 'manga') {
    const mobileSeriesWrap = document.getElementById('mobileSeriesWrap');
    const desktopSeriesWrap = document.getElementById('desktopSeriesWrap');
    const mobileClearSeriesBtn = document.getElementById('mobileClearSeriesBtn');
    const clearSeriesBtn = document.getElementById('clearSeriesBtn');
    if (mobileSeriesWrap) mobileSeriesWrap.style.display = 'none';
    if (desktopSeriesWrap) desktopSeriesWrap.style.display = 'none';
    if (mobileClearSeriesBtn) mobileClearSeriesBtn.style.display = 'none';
    if (clearSeriesBtn) clearSeriesBtn.style.display = 'none';
  }
  const sortSelect = document.getElementById('sortSelect');
  libPage = normalizePage(libPageByType[currentType]);
  exitBatchExportMode();
  exitSeriesArchiveMode();
  exitSeriesRemoveMode();
  exitDuplicateIgnoreMode();
  exitDuplicateRestoreMode();
  exitVideoSeriesBatchClearMode();
  duplicateIgnoredView = false;
  updateFilterUI();
  updateMangaFeatureButtons();
  updateBatchExportUI();
  renderMobileToolbarState();
  switchUploadType(currentType);
  saveLibraryViewState();
  if (currentType !== 'manga' && (currentView === 'duplicates' || currentView === 'series')) {
    showView('library', true);
  }
  if (currentType !== 'video' && currentView === 'video-series') {
    showView('library', true);
  }
  if (currentType !== 'video' && currentView === 'video-history') {
    showView('library', true);
  }
  if (currentType !== 'video' && currentView === 'video-duplicates') {
    showView('library', true);
  }
  if (currentType !== 'novel' && currentView === 'novel-duplicates') {
    showView('library', true);
  }
  if (currentType === 'image') {
    showView('images', true);
    loadImages();
    loadMeta();
    return;
  }
  if (currentType === 'video') {
    showView('videos', true);
    loadVideos();
    loadMeta();
    return;
  }
  if ((currentView === 'images' || currentView === 'videos' || currentView === 'image-duplicates' || currentView === 'video-history' || currentView === 'video-duplicates') && (currentType === 'manga' || currentType === 'novel')) {
    showView('library', true);
  }
  favoriteBatchSelected[currentType].clear();
  favoriteBatchMode = false;
  updateFavoriteBatchUI();
  if (currentView === 'favorites') {
    favoriteCategoryFilter = '';
    loadFavorites({ resetPage: true });
  } else {
    loadLibrary({ resetPage: false });
  }
  loadMeta();
}

/* ── Library ──────────────────────────────────────────────────── */
async function loadLibrary(options = {}) {
  const { resetPage = false } = options;
  try {
    const params = new URLSearchParams();
    if (searchQuery)  params.set('search', searchQuery);
    if (activeTagLib) params.set('tag', activeTagLib);
    if (activeAuthors.length) activeAuthors.forEach(a => params.append('author', a));
    if (activeSeriesLib?.seriesId) params.set('seriesId', activeSeriesLib.seriesId);
    else if (activeSeriesLib?.seriesName) params.set('seriesName', activeSeriesLib.seriesName);
    if (sortBy && sortBy !== 'read_latest') params.set('sort', sortBy);
    const url = currentType === 'manga'
      ? '/api/mangas'
      : currentType === 'novel'
        ? '/api/novels'
        : currentType === 'image'
          ? '/api/images'
          : '/api/videos';
    allItems = await fetch(url + '?' + params).then(r => r.json());
    if (sortBy === 'read_latest') allItems = applyReadHistorySort(allItems, currentType);
    if (resetPage) setCurrentLibraryPage(1);
    else {
      libPage = normalizePage(libPageByType[currentType]);
      saveLibraryViewState();
    }
    renderLibrary();
  } catch { showToast('加载失败', 'error'); }
}

function changeSort(v) {
  sortBy = v;
  if (currentView === 'favorites') {
    loadFavorites({ resetPage: true });
    return;
  }
  loadLibrary({ resetPage: true });
}

function renderLibrary() {
  const total = allItems.length, totalPages = Math.max(1, Math.ceil(total / libPerPage));
  if (libPage > totalPages) setCurrentLibraryPage(totalPages);
  else setCurrentLibraryPage(libPage);
  const slice = allItems.slice((libPage-1)*libPerPage, libPage*libPerPage);
  const typeLabel = currentType === 'manga' ? '部漫画' : currentType === 'novel' ? '本小说' : currentType === 'image' ? '张图片' : '个视频';
  document.getElementById('mangaCount').textContent =
    total + ' ' + typeLabel + (totalPages > 1 ? `（第 ${libPage}/${totalPages} 页）` : '');
  renderCards('mangaGrid', slice);
  renderPagination('pagination', libPage, totalPages, p => { setCurrentLibraryPage(p); renderLibrary(); });
  updateBatchExportUI();
  updateSeriesArchiveUI();
}

async function loadImages() {
  imageItems = await window.MediaFeature?.loadImages({
    searchQuery,
    showToast,
    esc,
    formatSize,
    showManageButtons: showCardActionButtons
  }) || [];
  return imageItems;
}

async function loadVideos() {
  videoItems = await window.MediaFeature?.loadVideos({
    searchQuery,
    showToast,
    esc,
    formatSize,
    showManageButtons: showCardActionButtons
  }) || [];
  return videoItems;
}

function openImageViewer(item) {
  return window.MediaFeature?.openImageViewer(item);
}

function closeImageViewer() {
  return window.MediaFeature?.closeImageViewer();
}

function openVideoViewer(item) {
  return window.MediaFeature?.openVideoViewer(item);
}

function closeVideoViewer() {
  return window.MediaFeature?.closeVideoViewer();
}

function shiftVideoViewer(step) {
  return window.MediaFeature?.shiftVideoViewer(step);
}

async function deleteMediaItem(e, kind, id) {
  return window.MediaFeature?.deleteMediaItem({
    e,
    kind,
    id,
    showToast,
    reloadImages: loadImages,
    reloadVideos: async () => {
      await loadVideos();
      if (currentView === 'video-history') await renderVideoHistory();
    }
  });
}

async function loadFavorites(options = {}) {
  const { resetPage = false } = options;
  try {
    const params = new URLSearchParams();
    params.set('favorite', 'true');
    if (searchQuery) params.set('search', searchQuery);
    if (favoriteCategoryFilter) params.set('favoriteCategory', favoriteCategoryFilter);
    if (sortBy && sortBy !== 'read_latest') params.set('sort', sortBy);
    const url = currentType === 'manga'
      ? '/api/mangas'
      : currentType === 'novel'
        ? '/api/novels'
        : currentType === 'image'
          ? '/api/images'
          : '/api/videos';
    favoriteItems = await fetch(url + '?' + params).then(r => r.json());
    if (sortBy === 'read_latest') favoriteItems = applyReadHistorySort(favoriteItems, currentType);

    const catParams = new URLSearchParams();
    catParams.set('favorite', 'true');
    const categorySource = await fetch(url + '?' + catParams).then(r => r.json());
    const grouped = new Map();
    (Array.isArray(categorySource) ? categorySource : []).forEach(item => {
      const category = String(item.favoriteCategory || '').trim();
      if (!category) return;
      grouped.set(category, (grouped.get(category) || 0) + 1);
    });
    favoriteCategories = [...grouped.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

    if (favoriteCategoryFilter && !favoriteCategories.some(c => c.name === favoriteCategoryFilter)) {
      favoriteCategoryFilter = '';
    }

    if (resetPage) favoritePage = 1;
    renderFavorites();
  } catch {
    showToast('收藏夹加载失败', 'error');
  }
}

function renderFavorites() {
  const total = favoriteItems.length;
  const totalPages = Math.max(1, Math.ceil(total / favoritePerPage));
  if (favoritePage > totalPages) favoritePage = totalPages;
  const slice = favoriteItems.slice((favoritePage - 1) * favoritePerPage, favoritePage * favoritePerPage);
  const typeLabel = currentType === 'manga'
    ? '部漫画'
    : currentType === 'novel'
      ? '本小说'
      : currentType === 'image'
        ? '张图片'
        : '个视频';
  const countEl = document.getElementById('favoriteCount');
  const emptyEl = document.getElementById('favoriteEmpty');
  const select = document.getElementById('favoriteCategorySelect');

  if (countEl) {
    countEl.textContent = `收藏 ${total} ${typeLabel}` + (totalPages > 1 ? `（第 ${favoritePage}/${totalPages} 页）` : '');
  }
  updateFavoriteBatchUI();
  if (select) {
    const options = ['<option value="">全部分类</option>']
      .concat(favoriteCategories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}（${c.count}）</option>`));
    select.innerHTML = options.join('');
    select.value = favoriteCategoryFilter;
  }

  if (!total) {
    const grid = document.getElementById('favoriteGrid');
    if (grid) grid.innerHTML = '';
    const pg = document.getElementById('favoritePagination');
    if (pg) pg.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  renderCards('favoriteGrid', slice);
  renderPagination('favoritePagination', favoritePage, totalPages, p => { favoritePage = p; renderFavorites(); });
  if (emptyEl) emptyEl.style.display = 'none';
}

function changeFavoritePerPage(value) {
  favoritePerPage = Number(value) || 20;
  favoritePage = 1;
  renderFavorites();
}

function changeFavoriteCategory(value) {
  favoriteCategoryFilter = String(value || '');
  loadFavorites({ resetPage: true });
}

function clearFavoriteCategoryFilter() {
  if (!favoriteCategoryFilter) return;
  favoriteCategoryFilter = '';
  loadFavorites({ resetPage: true });
}

function updateFavoriteBatchUI() {
  const btn = document.getElementById('favoriteBatchBtn');
  const cancelBtn = document.getElementById('favoriteBatchCancelBtn');
  if (!btn || !cancelBtn) return;
  const selectedCount = favoriteBatchSelected[currentType]?.size || 0;
  btn.textContent = favoriteBatchMode
    ? `⭐ 取消已选收藏（${selectedCount}）`
    : '⭐ 批量取消收藏';
  cancelBtn.style.display = favoriteBatchMode ? '' : 'none';
}

function enterFavoriteBatchMode() {
  favoriteBatchMode = true;
  favoriteBatchSelected[currentType].clear();
  updateFavoriteBatchUI();
  renderFavorites();
  showToast('已进入批量模式，请选择要取消收藏的条目后再次点击按钮', '');
}

function exitFavoriteBatchMode() {
  favoriteBatchMode = false;
  favoriteBatchSelected[currentType].clear();
  updateFavoriteBatchUI();
  if (currentView === 'favorites') renderFavorites();
}

function toggleFavoriteBatchSelection(event, id) {
  if (event) event.stopPropagation();
  if (!favoriteBatchMode) return;
  const selected = favoriteBatchSelected[currentType];
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  updateFavoriteBatchUI();
  renderFavorites();
}

async function runFavoriteBatchAction() {
  if (currentView !== 'favorites') {
    showView('favorites');
    return;
  }
  if (!favoriteBatchMode) {
    enterFavoriteBatchMode();
    return;
  }
  const ids = [...favoriteBatchSelected[currentType]];
  if (!ids.length) {
    showToast('请先选择要取消收藏的条目', 'error');
    return;
  }

  const endpointBase = currentType === 'manga'
    ? '/api/mangas/'
    : currentType === 'novel'
      ? '/api/novels/'
      : currentType === 'image'
        ? '/api/images/'
        : '/api/videos/';
  try {
    const tasks = ids.map(id =>
      fetch(endpointBase + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteCategory: '' })
      })
    );
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;

    ids.forEach(id => syncItemLocalState(id, currentType, { favoriteCategory: '' }));
    invalidateTagSourceCache(currentType);
    await loadFavorites({ resetPage: false });
    await loadMeta();
    if (selectedTags.length) applyTagFilter();
    if (currentView === 'duplicates' && currentType === 'manga') await loadDuplicateWorkspace({ keepPage: true });
    exitFavoriteBatchMode();
    if (failedCount > 0) showToast(`已取消 ${successCount} 条收藏，${failedCount} 条失败`, 'error');
    else showToast(`已批量取消 ${successCount} 条收藏`, 'success');
  } catch {
    showToast('批量取消收藏失败', 'error');
  }
}

function changeDuplicatePerPage(v) {
  duplicatePerPage = Number(v) || 20;
  duplicatePage = 1;
  renderDuplicateView();
}

function renderDuplicateView() {
  const grid = document.getElementById('duplicateGrid');
  const countEl = document.getElementById('duplicateCount');
  if (!grid || !countEl) return;

  const sourceItems = duplicateIgnoredView ? duplicateIgnoredItems : duplicateItems;
  const total = sourceItems.length;
  const totalPages = Math.max(1, Math.ceil(total / duplicatePerPage));
  if (duplicatePage > totalPages) duplicatePage = totalPages;
  const slice = sourceItems.slice((duplicatePage - 1) * duplicatePerPage, duplicatePage * duplicatePerPage);

  const modeLabel = duplicateMode === 'hash' ? '内容查重' : '标题查重';
  countEl.textContent = duplicateIgnoredView
    ? `已忽略漫画 ${total} 部（不参与重复筛查）` + (totalPages > 1 ? `（第 ${duplicatePage}/${totalPages} 页）` : '')
    : duplicateMode === 'hash'
      ? `疑似重复漫画 ${total} 部（${modeLabel}，匹配对 ${duplicatePairs.length}，已忽略 ${duplicateIgnoredCount} 部）` +
        (totalPages > 1 ? `（第 ${duplicatePage}/${totalPages} 页）` : '')
      : `疑似重复漫画 ${total} 部（${modeLabel}，匹配对 ${duplicatePairs.length}，阈值 ${Math.round(duplicateThreshold * 100)}%，已忽略 ${duplicateIgnoredCount} 部）` +
        (totalPages > 1 ? `（第 ${duplicatePage}/${totalPages} 页）` : '');

  if (!total) {
    grid.innerHTML = duplicateIgnoredView
      ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📭</div><p>暂无已忽略漫画</p></div>'
      : '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">✅</div><p>未发现重复漫画</p></div>';
    document.getElementById('duplicatePagination').innerHTML = '';
    updateDuplicateIgnoreUI();
    return;
  }

  renderCards('duplicateGrid', slice);
  renderPagination('duplicatePagination', duplicatePage, totalPages, p => { duplicatePage = p; renderDuplicateView(); });
  updateDuplicateIgnoreUI();
}

function changePerPage(v) {
  libPerPage = Number(v);
  setCurrentLibraryPage(1);
  saveLibraryViewState();
  renderLibrary();
}

function jumpLibraryPageFromInput(event, value, totalPages) {
  if (!event || event.key !== 'Enter') return;
  event.preventDefault();
  const inputPage = Number(value);
  if (!Number.isFinite(inputPage)) return;
  const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
  const nextPage = Math.max(1, Math.min(safeTotal, Math.floor(inputPage)));
  setCurrentLibraryPage(nextPage);
  renderLibrary();
}

/* ── 通用卡片 ─────────────────────────────────────────────────── */
function renderCards(gridId, list) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📚</div><p>暂无内容</p></div>';
    return;
  }
  const videoPreviewMap = loadVideoPreviewTimeMap();
  const activeView = document.querySelector('.view.active')?.id; // 提前计算，避免在 forEach 内重复查询 DOM
  const fragment = document.createDocumentFragment(); // 批量插入，减少重排次数
  list.forEach(item => {
    const itemType = item.type === 'novel'
      ? 'novel'
      : item.type === 'image'
        ? 'image'
        : item.type === 'video'
          ? 'video'
          : 'manga';
    const isNovel = itemType === 'novel';
    const isImage = itemType === 'image';
    const isVideo = itemType === 'video';
    const isManga = itemType === 'manga';
    const isSelectedForFavoriteBatch = favoriteBatchSelected[itemType]?.has(item.id);
    const isSelectedForExport = (exportSelected[itemType] || new Set()).has(item.id);
    const isSelectedForSeries = seriesSelectedIds.has(item.id);
    const isSelectedForSeriesRemove = seriesRemoveSelectedIds.has(item.id);
    const isSelectedForDupIgnore = duplicateIgnoreSelected.has(item.id);
    const isSelectedForDupRestore = duplicateRestoreSelected.has(item.id);
    const card = document.createElement('div');
    card.className = 'manga-card' + (isNovel ? ' novel-card' : '') + ((isSelectedForExport || isSelectedForSeries || isSelectedForSeriesRemove || isSelectedForDupIgnore || isSelectedForDupRestore || isSelectedForFavoriteBatch) ? ' selected-export' : '');
    card.dataset.id = item.id;

    let coverHtml, progressHtml = '';
    if (isNovel) {
      const progress = getNovelProgress(item.id);
      const progressRaw = progress.chapter + progress.scrollRatio;
      const pct = item.chapterCount ? Math.round(progressRaw / item.chapterCount * 100) : 0;
      coverHtml = `<div class="manga-cover-placeholder novel-cover">
        <span class="novel-cover-title">${esc(item.title)}</span>
        ${item.author ? `<span class="novel-cover-author">${esc(item.author)}</span>` : ''}
      </div>`;
      if (progressRaw > 0) progressHtml = `<div class="progress-ring">
        <div class="progress-bar-mini"><div class="progress-fill-mini" style="width:${pct}%"></div></div>
        <span class="progress-text-mini">${pct}%</span></div>`;
    } else if (isManga) {
      const saved = getProgress(item.id), pct = item.pageCount ? Math.round(saved/item.pageCount*100) : 0;
      coverHtml = item.cover
        ? `<img class="manga-cover" src="${item.cover}" alt="${esc(item.title)}" loading="lazy" draggable="false" ondragstart="return false" oncontextmenu="return false">`
        : `<div class="manga-cover-placeholder">📖</div>`;
      if (saved > 0) progressHtml = `<div class="progress-ring">
        <div class="progress-bar-mini"><div class="progress-fill-mini" style="width:${pct}%"></div></div>
        <span class="progress-text-mini">${pct}%</span></div>`;
    } else if (isImage) {
      const imageCardSrc = item.thumbUrl || item.cover || item.url;
      coverHtml = imageCardSrc
        ? `<img class="manga-cover media-cover" src="${imageCardSrc}" alt="${esc(item.title)}" loading="lazy" decoding="async" draggable="false" ondragstart="return false" oncontextmenu="return false">`
        : `<div class="manga-cover-placeholder">🖼</div>`;
    } else {
      const posterRaw = String(item.cover || item.poster || '').trim();
      const poster = posterRaw || VIDEO_FALLBACK_POSTER;
      const cachedPreview = Number(videoPreviewMap[String(item.id || '').trim()] || 0);
      const itemPreview = Number(item._previewTime || 0);
      const previewCandidate = cachedPreview > 0 ? cachedPreview : itemPreview;
      const previewTime = pickStableVideoPreviewTime(previewCandidate, Number(item.duration || 0));
      const cachedPoster = String(appVideoCardFrameCache.get(String(item.id || '').trim()) || '').trim();
      const finalPoster = posterRaw ? posterRaw : (cachedPoster || poster);
      coverHtml = `<img class="manga-cover media-cover media-video-cover app-video-cover-thumb${posterRaw ? '' : ' is-fallback'}" src="${esc(finalPoster)}" alt="${esc(item.title)}" loading="lazy" decoding="async" fetchpriority="low" data-video-id="${esc(String(item.id || '').trim())}" data-video-url="${esc(item.url)}" data-preview-time="${previewTime}" onerror="this.onerror=null;this.src='${VIDEO_FALLBACK_POSTER}'">`;
    }

    const tagsHtml = (item.tags||[]).slice(0,3).map(t=>`<span class="mini-tag">${esc(t)}</span>`).join('');
    const seriesMeta = isManga && item.seriesName
      ? ` · ${esc(item.seriesName)}${item.chapterNo ? ' 第' + Number(item.chapterNo) + '话' : ''}`
      : '';
    const mediaSize = Number(item.size || 0) > 0 ? formatSize(Number(item.size || 0)) : '';
    const meta = isNovel
      ? (item.chapterCount||0)+'章'
      : isManga
        ? (item.pageCount||0)+'页'+seriesMeta
        : (isVideo && item.historyLabel ? item.historyLabel : mediaSize);
    const rating = (isManga || isNovel) ? `<div class="manga-rating">${renderRatingStars(item.rating || 0)}</div>` : '';

    const showSelectButton = batchExportMode && itemType === currentType;
    const showSeriesSelectButton = seriesArchiveMode && itemType === 'manga';
    const showSeriesQuickRemoveButton = activeView === 'view-library' && !!activeSeriesLib && itemType === 'manga' && seriesRemoveMode;
    const showDupIgnoreSelectButton = activeView === 'view-duplicates' && duplicateIgnoreMode && itemType === 'manga';
    const showDupRestoreSelectButton = activeView === 'view-duplicates' && duplicateIgnoredView && duplicateRestoreMode && itemType === 'manga';
    const showManageButtons = showCardActionButtons;
    const hasCardActions = showSelectButton || showSeriesSelectButton || showSeriesQuickRemoveButton || showDupIgnoreSelectButton || showDupRestoreSelectButton || showManageButtons;
    card.innerHTML = `
      ${hasCardActions ? `<div class="card-actions">
        ${showSelectButton ? `<button class="card-btn select${isSelectedForExport ? ' active' : ''}" title="${isSelectedForExport ? '取消批量导出选择' : '加入批量导出'}" onclick="toggleExportSelection(event,'${item.id}','${itemType}')">${isSelectedForExport ? '☑' : '☐'}</button>` : ''}
        ${showSeriesSelectButton ? `<button class="card-btn select${isSelectedForSeries ? ' active' : ''}" title="${isSelectedForSeries ? '取消套书归档选择' : '加入套书归档'}" onclick="toggleSeriesArchiveSelection(event,'${item.id}')">${isSelectedForSeries ? '📚' : '＋'}</button>` : ''}
        ${showSeriesQuickRemoveButton ? `<button class="card-btn select${isSelectedForSeriesRemove ? ' active' : ''}" title="选择/取消选择移出" onclick="toggleSeriesRemoveSelection(event,'${item.id}')">${isSelectedForSeriesRemove ? '☑' : '☐'}</button>` : ''}
        ${showDupIgnoreSelectButton ? `<button class="card-btn select${isSelectedForDupIgnore ? ' active' : ''}" title="${isSelectedForDupIgnore ? '取消忽略选择' : '加入忽略选择'}" onclick="toggleDuplicateIgnoreSelection(event,'${item.id}')">${isSelectedForDupIgnore ? '🙈' : '＋'}</button>` : ''}
        ${showDupRestoreSelectButton ? `<button class="card-btn select${isSelectedForDupRestore ? ' active' : ''}" title="${isSelectedForDupRestore ? '取消恢复选择' : '加入恢复选择'}" onclick="toggleDuplicateRestoreSelection(event,'${item.id}')">${isSelectedForDupRestore ? '↩' : '＋'}</button>` : ''}
        ${showManageButtons ? `<button class="card-btn" title="编辑" onclick="openEdit(event,'${item.id}','${itemType}')">✎</button>
        ${(isManga || isNovel) ? `<button class="card-btn" title="导出" onclick="exportItem(event,'${item.id}','${itemType}')">⬇</button>` : ''}
        <button class="card-btn del" title="删除" onclick="deleteItem(event,'${item.id}','${itemType}')">✕</button>` : ''}
      </div>` : ''}
      ${coverHtml}${progressHtml}
      <div class="manga-info">
        <div class="manga-title">${esc(item.title)}</div>
        ${item.author?`<div class="manga-author"><button class="author-link" data-author="${encodeURIComponent(item.author)}" data-type="${itemType}" onclick="handleCardAuthorClick(event,this)">${esc(item.author)}</button></div>`:''}
        ${rating}
        <div class="manga-tags">${tagsHtml}</div>
        <div class="manga-meta">${meta}</div>
      </div>`;
    card.addEventListener('click', e => {
      if (Date.now() < Number(cardLongPressSuppressUntil.get(item.id) || 0)) {
        e.preventDefault();
        return;
      }
      if (e.target.closest('.card-btn')) return;
      if (batchExportMode && itemType === currentType) {
        toggleExportSelection(e, item.id, itemType);
        return;
      }
      if (seriesArchiveMode && itemType === 'manga') {
        toggleSeriesArchiveSelection(e, item.id);
        return;
      }
      if (seriesRemoveMode && !!activeSeriesLib && itemType === 'manga' && activeView === 'view-library') {
        toggleSeriesRemoveSelection(e, item.id);
        return;
      }
      if (activeView === 'view-duplicates' && duplicateIgnoreMode && itemType === 'manga') {
        toggleDuplicateIgnoreSelection(e, item.id);
        return;
      }
      if (activeView === 'view-duplicates' && duplicateIgnoredView && duplicateRestoreMode && itemType === 'manga') {
        toggleDuplicateRestoreSelection(e, item.id);
        return;
      }
      if (activeView === 'view-favorites' && favoriteBatchMode && itemType === currentType) {
        toggleFavoriteBatchSelection(e, item.id);
        return;
      }
      if (isNovel) openNovel(item.id);
      else if (isManga) openReader(item.id);
      else if (isImage) openImageViewer(item);
      else openVideoViewer(item);
    });

    card.addEventListener('contextmenu', (e) => {
      if (window.matchMedia('(max-width:720px)').matches) return;
      if (e.target.closest('.card-btn')) return;
      e.preventDefault();
      if (!showCardActionButtons) {
        toggleCardActionButtons(true);
        showToast('已显示管理按钮，可进行导出/编辑/删除', '');
      }
    });

    // 双击编辑（桌面端）
    card.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (!e.target.closest('.card-btn')) {
        openEdit(e, item.id, itemType);
      }
    });

    // 长按编辑（手机端）- 改进版：检测触摸移动距离
    card.addEventListener('touchstart', (e) => {
      if (e.touches?.length !== 1) return;
      if (e.target.closest('.card-btn')) return;
      // 记录触摸起始位置
      const touch = e.touches[0];
      cardLongPressStarts.set(item.id, {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      });
      
      // 开始长按计时
      const timer = setTimeout(() => {
        cardLongPressSuppressUntil.set(item.id, Date.now() + 420);
        openEdit(null, item.id, itemType);
      }, LONG_PRESS_DURATION);
      cardLongPressTimers.set(item.id, timer);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const start = cardLongPressStarts.get(item.id);
      if (!start) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      
      // 如果移动距离超过阈值，取消长按（使用平方比较避免 sqrt 开销）
      if (deltaX * deltaX + deltaY * deltaY > LONG_PRESS_MOVE_THRESHOLD * LONG_PRESS_MOVE_THRESHOLD) {
        const timer = cardLongPressTimers.get(item.id);
        if (timer) {
          clearTimeout(timer);
          cardLongPressTimers.delete(item.id);
        }
        cardLongPressStarts.delete(item.id);
      }
    }, { passive: true });

    card.addEventListener('touchend', () => {
      const timer = cardLongPressTimers.get(item.id);
      if (timer) {
        clearTimeout(timer);
        cardLongPressTimers.delete(item.id);
      }
      cardLongPressStarts.delete(item.id);
    }, { passive: true });

    card.addEventListener('touchcancel', () => {
      const timer = cardLongPressTimers.get(item.id);
      if (timer) {
        clearTimeout(timer);
        cardLongPressTimers.delete(item.id);
      }
      cardLongPressStarts.delete(item.id);
    }, { passive: true });

    // 禁用长按菜单（会在真正长按时触发）
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    fragment.appendChild(card);
  });
  grid.appendChild(fragment); // 一次性挂载所有卡片
}

function handleCardAuthorClick(event, el) {
  event.stopPropagation();
  const author = decodeURIComponent(el?.dataset?.author || '');
  const type = el?.dataset?.type || 'manga';
  if (!author) return;
  openAuthorWorks(author, type);
}

function updateEditFavoriteButton() {
  const input = document.getElementById('editFavoriteCategory');
  const btn = document.getElementById('editFavoriteToggleBtn');
  if (!input || !btn) return;
  const hasCategory = !!String(input.value || '').trim();
  btn.textContent = hasCategory ? '取消收藏' : '加入收藏';
}

function toggleEditFavoriteQuick() {
  const input = document.getElementById('editFavoriteCategory');
  if (!input) return;
  if (String(input.value || '').trim()) input.value = '';
  else input.value = '默认';
  updateEditFavoriteButton();
}

function updateEditSeriesRemoveButton() {
  const flag = document.getElementById('editRemoveSeriesFlag');
  const btn = document.getElementById('editRemoveSeriesBtn');
  if (!flag || !btn) return;
  const enabled = flag.value === '1';
  btn.textContent = enabled ? '已标记移除（再点撤销）' : '从套书中移除';
}

function toggleEditRemoveSeries() {
  const flag = document.getElementById('editRemoveSeriesFlag');
  if (!flag) return;
  flag.value = flag.value === '1' ? '0' : '1';
  updateEditSeriesRemoveButton();
}

function openAuthorWorks(author, type = 'manga') {
  const targetType = type === 'novel' ? 'novel' : 'manga';
  if (currentType !== targetType) switchType(targetType);
  if (currentView !== 'library') showView('library');

  activeAuthors = [author];
  activeTagLib = null;
  activeSeriesLib = null;
  searchQuery = '';
  syncSearchInputs('');
  updateFilterUI();
  loadLibrary({ resetPage: true });
  renderSidebar();
  showToast(`已筛选作者：${author}`, '');
}

function renderRatingStars(value) {
  const n = Math.max(0, Math.min(5, Number(value) || 0));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} <span class="rating-num">${n.toFixed(1).replace('.0','')}</span>`;
}

function getDownloadFileName(resp, fallbackName) {
  const cd = resp.headers.get('Content-Disposition') || '';

  const utf8Match = cd.match(/filename\*\s*=\s*([^;]+)/i);
  if (utf8Match) {
    let value = utf8Match[1].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    const parts = value.split("''");
    const encoded = parts.length > 1 ? parts.slice(1).join("''") : value;
    try {
      const decoded = decodeURIComponent(encoded);
      if (decoded) return decoded;
    } catch {}
  }

  const asciiMatch = cd.match(/filename\s*=\s*("([^"]+)"|([^;]+))/i);
  if (asciiMatch) {
    const raw = (asciiMatch[2] || asciiMatch[3] || '').trim();
    if (raw) return raw;
  }

  return fallbackName;
}

function clearDuplicateList() {
  duplicatePairs = [];
  duplicateItems = [];
  duplicateIgnoredItems = [];
  duplicateIgnoredCount = 0;
  exitDuplicateIgnoreMode();
  exitDuplicateRestoreMode();
  duplicatePage = 1;
  duplicateIgnoredView = false;
  renderDuplicateView();
}

function updateDuplicateIgnoreUI() {
  const btn = document.getElementById('duplicateIgnoreBtn');
  const cancelBtn = document.getElementById('duplicateCancelIgnoreBtn');
  const listBtn = document.getElementById('duplicateIgnoredListBtn');
  const restoreBtn = document.getElementById('duplicateRestoreBtn');
  const cancelRestoreBtn = document.getElementById('duplicateCancelRestoreBtn');
  if (!btn || !cancelBtn || !listBtn || !restoreBtn || !cancelRestoreBtn) return;
  const dupToolbar = document.querySelector('#view-duplicates .toolbar');
  const count = duplicateIgnoreSelected.size;
  btn.textContent = duplicateIgnoreMode ? `🙈 忽略已选（${count}）` : '🙈 忽略筛查';
  cancelBtn.style.display = duplicateIgnoreMode ? '' : 'none';
  btn.style.display = duplicateIgnoredView ? 'none' : '';
  cancelBtn.style.display = duplicateIgnoredView ? 'none' : cancelBtn.style.display;

  const restoreCount = duplicateRestoreSelected.size;
  listBtn.textContent = duplicateIgnoredView ? '← 返回查重列表' : `📦 已忽略列表（${duplicateIgnoredCount}）`;
  restoreBtn.style.display = duplicateIgnoredView ? '' : 'none';
  restoreBtn.textContent = duplicateRestoreMode ? `↩ 恢复已选（${restoreCount}）` : '↩ 取消忽略';
  cancelRestoreBtn.style.display = duplicateIgnoredView && duplicateRestoreMode ? '' : 'none';
  if (dupToolbar) {
    dupToolbar.classList.toggle('duplicate-ignore-mode', duplicateIgnoreMode && !duplicateIgnoredView);
    dupToolbar.classList.toggle('duplicate-ignored-view', duplicateIgnoredView);
  }
}

function enterDuplicateIgnoreMode() {
  duplicateIgnoreMode = true;
  duplicateIgnoreSelected.clear();
  updateDuplicateIgnoreUI();
  renderDuplicateView();
  showToast('已进入忽略选择模式，选择漫画后再次点击“忽略已选”', '');
}

function exitDuplicateIgnoreMode() {
  duplicateIgnoreMode = false;
  duplicateIgnoreSelected.clear();
  updateDuplicateIgnoreUI();
  if (currentView === 'duplicates') renderDuplicateView();
}

function enterDuplicateRestoreMode() {
  duplicateRestoreMode = true;
  duplicateRestoreSelected.clear();
  updateDuplicateIgnoreUI();
  renderDuplicateView();
  showToast('已进入恢复选择模式，选择漫画后再次点击“恢复已选”', '');
}

function exitDuplicateRestoreMode() {
  duplicateRestoreMode = false;
  duplicateRestoreSelected.clear();
  updateDuplicateIgnoreUI();
  if (currentView === 'duplicates') renderDuplicateView();
}

function toggleDuplicateRestoreSelection(e, id) {
  if (e) e.stopPropagation();
  if (!duplicateRestoreMode) return;
  if (duplicateRestoreSelected.has(id)) duplicateRestoreSelected.delete(id);
  else duplicateRestoreSelected.add(id);
  updateDuplicateIgnoreUI();
  renderDuplicateView();
}

async function toggleDuplicateIgnoredList() {
  if (!duplicateIgnoredView) {
    duplicateIgnoredView = true;
    exitDuplicateIgnoreMode();
    exitDuplicateRestoreMode();
    duplicatePage = 1;
    try {
      const list = await fetch('/api/mangas?ignoreDuplicate=true').then(r => r.json());
      duplicateIgnoredItems = (Array.isArray(list) ? list : []).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    } catch {
      duplicateIgnoredItems = [];
      showToast('加载已忽略列表失败', 'error');
    }
    renderDuplicateView();
    return;
  }

  duplicateIgnoredView = false;
  exitDuplicateRestoreMode();
  duplicatePage = 1;
  await loadDuplicateWorkspace({ keepPage: false });
}

async function handleDuplicateRestoreAction() {
  if (!duplicateIgnoredView) return;
  if (!duplicateRestoreMode) {
    enterDuplicateRestoreMode();
    return;
  }
  const ids = [...duplicateRestoreSelected];
  if (!ids.length) {
    showToast('请先选择要恢复的漫画', 'error');
    return;
  }
  try {
    const resp = await fetch('/api/mangas/duplicates/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ignored: false })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '恢复失败');
    }
    const result = await resp.json();
    exitDuplicateRestoreMode();
    const list = await fetch('/api/mangas?ignoreDuplicate=true').then(r => r.json());
    duplicateIgnoredItems = (Array.isArray(list) ? list : []).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    await loadDuplicateWorkspace({ keepPage: false });
    renderDuplicateView();
    await loadLibrary();
    showToast(`已恢复 ${result.affected || 0} 部漫画参与重复筛查`, 'success');
  } catch (e) {
    showToast(e.message || '恢复失败', 'error');
  }
}

function toggleDuplicateIgnoreSelection(e, id) {
  if (e) e.stopPropagation();
  if (!duplicateIgnoreMode) return;
  if (duplicateIgnoreSelected.has(id)) duplicateIgnoreSelected.delete(id);
  else duplicateIgnoreSelected.add(id);
  updateDuplicateIgnoreUI();
  renderDuplicateView();
}

async function handleDuplicateIgnoreAction() {
  if (currentView !== 'duplicates') {
    showView('duplicates');
    return;
  }
  if (!duplicateIgnoreMode) {
    enterDuplicateIgnoreMode();
    return;
  }
  const ids = [...duplicateIgnoreSelected];
  if (!ids.length) {
    showToast('请先选择要忽略的漫画', 'error');
    return;
  }
  try {
    const resp = await fetch('/api/mangas/duplicates/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ignored: true })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '忽略失败');
    }
    const result = await resp.json();
    exitDuplicateIgnoreMode();
    await loadDuplicateWorkspace({ keepPage: false });
    await loadLibrary();
    showToast(`已忽略 ${result.affected || 0} 部漫画的重复筛查`, 'success');
  } catch (e) {
    showToast(e.message || '忽略失败', 'error');
  }
}

async function loadDuplicateWorkspace(options = {}) {
  const { keepPage = false } = options;
  if (currentType !== 'manga') return;
  const threshold = Math.max(0.5, Math.min(0.95, Number(options.threshold ?? duplicateThreshold) || 0.74));
  const mode = duplicateMode === 'hash' ? 'hash' : 'title';
  
  const [dupRes, mangaRes] = await Promise.all([
    fetch('/api/mangas/duplicates?threshold=' + encodeURIComponent(String(threshold)) + '&mode=' + encodeURIComponent(mode)).then(r => r.json()),
    fetch('/api/mangas').then(r => r.json())
  ]);

  const pairs = Array.isArray(dupRes.pairs) ? dupRes.pairs : [];
  duplicatePairs = pairs;
  duplicateThreshold = Number(dupRes.threshold) || threshold;
  duplicateIgnoredCount = Number(dupRes.ignoredCount) || 0;
  saveDuplicateThreshold();
  const thresholdRange = document.getElementById('duplicateThresholdRange');
  const thresholdLabel = document.getElementById('duplicateThresholdLabel');
  if (thresholdRange) thresholdRange.value = String(Math.round(duplicateThreshold * 100));
  if (thresholdLabel) thresholdLabel.textContent = `${Math.round(duplicateThreshold * 100)}%`;

  const mangas = Array.isArray(mangaRes) ? mangaRes : [];
  const mangaMap = new Map(mangas.map(m => [m.id, m]));
  const scoreMap = new Map();
  pairs.forEach(pair => {
    const score = Number(pair.score) || 0;
    const leftId = pair.left?.id;
    const rightId = pair.right?.id;
    if (leftId) scoreMap.set(leftId, Math.max(scoreMap.get(leftId) || 0, score));
    if (rightId) scoreMap.set(rightId, Math.max(scoreMap.get(rightId) || 0, score));
  });

  duplicateItems = [...scoreMap.entries()]
    .map(([id, score]) => {
      const m = mangaMap.get(id);
      if (!m) return null;
      return { ...m, _dupScore: score };
    })
    .filter(Boolean)
    .sort((a, b) => (b._dupScore - a._dupScore) || (new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0)));

  if (!keepPage) duplicatePage = 1;
  if (!duplicateIgnoreMode) duplicateIgnoreSelected.clear();
  if (!duplicateRestoreMode) duplicateRestoreSelected.clear();
  if (duplicateIgnoredView) {
    const list = await fetch('/api/mangas?ignoreDuplicate=true').then(r => r.json()).catch(() => []);
    duplicateIgnoredItems = (Array.isArray(list) ? list : []).sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  }
  renderDuplicateView();
}

async function runDuplicateCheckAction(keepPage = false) {
  if (currentType !== 'manga') {
    showToast('请先切换到漫画模式', 'error');
    return;
  }
  try {
    if (currentView !== 'duplicates') showView('duplicates');
    showToast('正在分析标题相似度…', '');
    await loadDuplicateWorkspace({ keepPage });
    if (!duplicatePairs.length) {
      showToast('未发现明显重复标题', 'success');
      return;
    }
    showToast('已按重复度从高到低更新重复漫画列表', 'success');
  } catch {
    showToast('查重失败', 'error');
  }
}

function buildNovelDuplicateGroups() {
  const exactGroups = Array.isArray(novelDuplicateResult.exactGroups) ? novelDuplicateResult.exactGroups : [];
  return exactGroups
    .map((group) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      const ids = items.map(item => String(item?.id || '').trim()).filter(Boolean);
      return {
        ids,
        items: items
          .filter(item => String(item?.id || '').trim())
          .sort((a, b) => new Date(b?.uploadedAt || 0) - new Date(a?.uploadedAt || 0))
      };
    })
    .filter(group => group.ids.length > 1)
    .sort((a, b) => b.items.length - a.items.length);
}

function getNovelDuplicateSelectableIds() {
  if (novelDuplicateIgnoredView) {
    return (novelDuplicateResult.ignoredItems || []).map(item => String(item.id || '')).filter(Boolean);
  }
  return buildNovelDuplicateGroups().flatMap(group => group.ids);
}

function syncNovelDuplicateSelected() {
  const valid = new Set(getNovelDuplicateSelectableIds());
  [...novelDuplicateSelected].forEach(id => {
    if (!valid.has(id)) novelDuplicateSelected.delete(id);
  });
}

function updateNovelDuplicateControls() {
  const ignoredBtn = document.getElementById('novelDuplicateIgnoredBtn');
  const restoreBtn = document.getElementById('novelDuplicateRestoreBtn');
  const deleteBtn = document.getElementById('novelDuplicateDeleteBtn');
  const cancelBtn = document.getElementById('novelDuplicateCancelBtn');
  if (ignoredBtn) {
    ignoredBtn.textContent = novelDuplicateIgnoredView ? '🧾 返回查重结果' : '📦 查看已忽略列表';
  }
  const selectedCount = novelDuplicateSelected.size;
  if (restoreBtn) {
    restoreBtn.style.display = novelDuplicateIgnoredView ? '' : 'none';
    restoreBtn.textContent = novelDuplicateSelectMode === 'restore'
      ? `↩ 恢复已选（${selectedCount}）`
      : '↩ 恢复忽略';
  }
  if (deleteBtn) {
    deleteBtn.textContent = novelDuplicateSelectMode === 'delete'
      ? `🗑 删除已选（${selectedCount}）`
      : '🗑 批量删除';
  }
  if (cancelBtn) cancelBtn.style.display = novelDuplicateSelectMode ? '' : 'none';
}

function renderNovelDuplicatePanel() {
  const panel = document.getElementById('novelDuplicatePanel');
  const listEl = document.getElementById('novelDuplicateList');
  const titleEl = document.getElementById('novelDuplicatePanelTitle');
  if (!panel || !listEl || !titleEl) return;
  panel.style.display = novelDuplicatePanelVisible ? '' : 'none';
  if (!novelDuplicatePanelVisible) return;

  updateNovelDuplicateControls();
  if (novelDuplicateLoading) {
    titleEl.textContent = '小说查重 · 分析中…';
    listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>正在分析重复小说，请稍候…</p></div>';
    return;
  }

  const duplicateGroups = buildNovelDuplicateGroups();
  const ignoredItems = Array.isArray(novelDuplicateResult.ignoredItems) ? novelDuplicateResult.ignoredItems : [];
  const ignoredCount = Number(novelDuplicateResult.ignoredCount || 0);
  if (novelDuplicateIgnoredView) titleEl.textContent = `已忽略列表 · ${ignoredItems.length} 本小说`;
  else titleEl.textContent = `小说查重 · 重复分组 ${duplicateGroups.length} 组 · 已忽略 ${ignoredCount}`;

  if (novelDuplicateIgnoredView) {
    if (!ignoredItems.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前没有已忽略小说</p></div>';
      return;
    }
    const rows = ignoredItems.map((item, idx) => {
      const id = esc(item?.id || '');
      const title = esc(item?.title || '未命名小说');
      const selected = novelDuplicateSelected.has(String(item?.id || ''));
      return `
        <div class="duplicate-row image-dup-row">
          <div class="duplicate-score">#${idx + 1}</div>
          <div class="duplicate-titles">
            <div><strong>${title}</strong></div>
            <div>${esc(item?.author || '未知作者')}</div>
            <div class="image-dup-meta">上传时间 ${esc(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
          </div>
          <div class="image-dup-actions">
            ${novelDuplicateSelectMode === 'restore' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="toggleNovelDuplicateSelection('${id}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
            <button class="clear-btn" onclick="openNovel('${id}')">阅读</button>
            <button class="clear-btn" onclick="restoreNovelDuplicateIds('${encodeURIComponent(String(item?.id || ''))}')">恢复</button>
          </div>
        </div>`;
    }).join('');
    listEl.innerHTML = rows;
    return;
  }

  if (!duplicateGroups.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前未发现重复小说</p></div>';
    return;
  }

  const html = duplicateGroups.map((group, idx) => {
    const ids = group.ids || [];
    const encodedIds = encodeURIComponent(ids.join('|'));
    const selectedCount = ids.filter(id => novelDuplicateSelected.has(String(id))).length;
    const rows = (group.items || []).map((item) => {
      const id = String(item?.id || '').trim();
      const selected = novelDuplicateSelected.has(id);
      return `
        <div class="duplicate-row image-dup-row image-dup-row-item">
          <div class="duplicate-score">小说</div>
          <div class="duplicate-titles">
            <div><strong>${esc(item?.title || '未命名小说')}</strong></div>
            <div>${esc(item?.author || '未知作者')}</div>
            <div class="image-dup-meta">上传时间 ${esc(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
          </div>
          <div class="image-dup-actions">
            ${novelDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="toggleNovelDuplicateSelection('${esc(id)}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
            <button class="clear-btn" onclick="openNovel('${esc(id)}')">阅读</button>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="image-dup-group">
        <div class="image-dup-group-head">
          <div class="duplicate-score">重复组 #${idx + 1}</div>
          <div class="image-dup-meta">共 ${ids.length} 本</div>
          <div class="image-dup-actions">
            ${novelDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selectedCount === ids.length && ids.length ? ' active' : ''}" onclick="toggleNovelDuplicateSelection('${esc(encodedIds)}', true)">${selectedCount === ids.length && ids.length ? '☑ 组已选' : '☐ 选中整组'}</button>` : ''}
            <button class="clear-btn" onclick="ignoreNovelDuplicateGroup('${encodedIds}')">忽略本组</button>
          </div>
        </div>
        <div class="image-dup-group-list">${rows}</div>
      </section>`;
  }).join('');

  listEl.innerHTML = html;
}

async function runNovelDuplicateCheck() {
  if (currentType !== 'novel') return;
  novelDuplicateLoading = true;
  novelDuplicatePanelVisible = true;
  renderNovelDuplicatePanel();
  try {
    const resp = await fetch('/api/novels/duplicates');
    if (!resp.ok) throw new Error('查重失败');
    const data = await resp.json();
    novelDuplicateResult = {
      exactGroups: Array.isArray(data.exactGroups) ? data.exactGroups : [],
      ignoredItems: Array.isArray(data.ignoredItems) ? data.ignoredItems : [],
      ignoredCount: Number(data.ignoredCount || 0),
      total: Number(data.total || 0)
    };
    syncNovelDuplicateSelected();
  } catch {
    showToast('小说查重失败', 'error');
  } finally {
    novelDuplicateLoading = false;
    renderNovelDuplicatePanel();
  }
}

function toggleNovelDuplicateIgnoredView() {
  novelDuplicateIgnoredView = !novelDuplicateIgnoredView;
  novelDuplicateSelectMode = '';
  novelDuplicateSelected.clear();
  renderNovelDuplicatePanel();
}

function toggleNovelDuplicateSelection(idOrEncoded, encodedGroup = false) {
  const ids = encodedGroup
    ? decodeURIComponent(String(idOrEncoded || '')).split('|').map(x => String(x || '').trim()).filter(Boolean)
    : [String(idOrEncoded || '').trim()].filter(Boolean);
  if (!ids.length) return;
  const allSelected = ids.every(id => novelDuplicateSelected.has(id));
  if (allSelected) ids.forEach(id => novelDuplicateSelected.delete(id));
  else ids.forEach(id => novelDuplicateSelected.add(id));
  renderNovelDuplicatePanel();
}

function exitNovelDuplicateSelectMode() {
  novelDuplicateSelectMode = '';
  novelDuplicateSelected.clear();
  renderNovelDuplicatePanel();
}

async function ignoreNovelDuplicateGroup(encodedIds) {
  const ids = decodeURIComponent(String(encodedIds || ''))
    .split('|')
    .map(x => String(x || '').trim())
    .filter(Boolean);
  if (!ids.length) return;
  try {
    const resp = await fetch('/api/novels/duplicates/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ignored: true })
    });
    if (!resp.ok) throw new Error('忽略失败');
    await runNovelDuplicateCheck();
    showToast(`已忽略 ${ids.length} 本小说`, 'success');
  } catch {
    showToast('忽略失败', 'error');
  }
}

async function restoreNovelDuplicateIds(encodedIds) {
  const ids = decodeURIComponent(String(encodedIds || ''))
    .split('|')
    .map(x => String(x || '').trim())
    .filter(Boolean);
  if (!ids.length) return;
  try {
    const resp = await fetch('/api/novels/duplicates/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, ignored: false })
    });
    if (!resp.ok) throw new Error('恢复失败');
    await runNovelDuplicateCheck();
    showToast(`已恢复 ${ids.length} 本小说`, 'success');
  } catch {
    showToast('恢复失败', 'error');
  }
}

async function handleNovelDuplicateRestoreAction() {
  if (!novelDuplicateIgnoredView) {
    novelDuplicateIgnoredView = true;
    novelDuplicateSelectMode = '';
    novelDuplicateSelected.clear();
    renderNovelDuplicatePanel();
    return;
  }
  if (novelDuplicateSelectMode !== 'restore') {
    novelDuplicateSelectMode = 'restore';
    novelDuplicateSelected.clear();
    renderNovelDuplicatePanel();
    showToast('已进入恢复模式，请选择后再次点击“恢复忽略”', '');
    return;
  }
  const ids = [...novelDuplicateSelected];
  if (!ids.length) {
    showToast('请先选择要恢复的小说', 'error');
    return;
  }
  await restoreNovelDuplicateIds(encodeURIComponent(ids.join('|')));
  novelDuplicateSelectMode = '';
  novelDuplicateSelected.clear();
  renderNovelDuplicatePanel();
}

async function handleNovelDuplicateDeleteAction() {
  if (novelDuplicateSelectMode !== 'delete') {
    novelDuplicateSelectMode = 'delete';
    novelDuplicateSelected.clear();
    renderNovelDuplicatePanel();
    showToast('已进入删除模式，请选择后再次点击“批量删除”', '');
    return;
  }
  const ids = [...novelDuplicateSelected];
  if (!ids.length) {
    showToast('请先选择要删除的小说', 'error');
    return;
  }
  if (!confirm(`确定删除已选的 ${ids.length} 本小说吗？`)) return;
  try {
    const resp = await fetch('/api/novels/duplicates/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!resp.ok) throw new Error('批量删除失败');
    const result = await resp.json().catch(() => ({ affected: 0 }));
    novelDuplicateSelected.clear();
    novelDuplicateSelectMode = '';
    await runNovelDuplicateCheck();
    await loadLibrary({ resetPage: false });
    await loadMeta();
    showToast(`已删除 ${Number(result.affected || 0)} 本小说`, 'success');
  } catch {
    showToast('批量删除失败', 'error');
  }
}

function summarizeSeriesSuggestions(suggestions, limit = 10) {
  return suggestions.slice(0, limit).map((group, idx) =>
    `${idx + 1}. ${group.seriesName}（第 ${group.chapterStart} - ${group.chapterEnd} 话，共 ${group.items.length} 部）`
  ).join('\n');
}

function getCommonTitlePrefix(titles) {
  if (!titles.length) return '';
  let prefix = String(titles[0] || '');
  for (let i = 1; i < titles.length; i += 1) {
    const current = String(titles[i] || '');
    let j = 0;
    while (j < prefix.length && j < current.length && prefix[j] === current[j]) j += 1;
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix.replace(/[\s\-—_:：·(（【\[]*$/g, '').trim();
}

function updateSeriesArchiveUI() {
  const btn = document.getElementById('seriesArchiveBtn');
  const btnDup = document.getElementById('seriesArchiveBtnDup');
  const cancelBtn = document.getElementById('cancelSeriesArchiveBtn');
  const cancelBtnDup = document.getElementById('cancelSeriesArchiveBtnDup');
  if (!btn || !cancelBtn || !btnDup || !cancelBtnDup) return;
  const dupToolbar = document.querySelector('#view-duplicates .toolbar');
  const count = seriesSelectedIds.size;
  const label = seriesArchiveMode ? `📚 归档已选（${count}）` : '📚 套书归档';
  btn.textContent = label;
  btnDup.textContent = label;
  cancelBtn.style.display = seriesArchiveMode ? '' : 'none';
  cancelBtnDup.style.display = seriesArchiveMode ? '' : 'none';
  if (dupToolbar) dupToolbar.classList.toggle('series-archive-mode', !!seriesArchiveMode);
  updateMangaFeatureButtons();
  renderMobileToolbarState();
}

function toggleSeriesArchiveSelection(e, id) {
  if (e) e.stopPropagation();
  if (!seriesArchiveMode) return;
  if (seriesSelectedIds.has(id)) seriesSelectedIds.delete(id);
  else seriesSelectedIds.add(id);

  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
  if (activeView === 'view-duplicates') renderDuplicateView();
  updateSeriesArchiveUI();
}

function enterSeriesArchiveMode() {
  if (batchExportMode) exitBatchExportMode();
  seriesArchiveMode = true;
  seriesSelectedIds.clear();
  updateSeriesArchiveUI();
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-duplicates') renderDuplicateView();
  showToast('已进入套书归档模式：新建套书需至少两本；若输入已有套书名，可选择一本直接追加', '');
}

function onSeriesArchiveTargetChange() {
  const targetSelect = document.getElementById('seriesArchiveTargetSelect');
  const newNameWrap = document.getElementById('seriesArchiveNewNameWrap');
  const newNameInput = document.getElementById('seriesArchiveNewNameInput');
  if (!targetSelect || !newNameWrap || !newNameInput) return;
  const isCreateNew = targetSelect.value === '__new__';
  newNameWrap.style.display = isCreateNew ? '' : 'none';
  if (isCreateNew) {
    setTimeout(() => newNameInput.focus(), 0);
  }
}

function closeSeriesArchivePicker(result = null) {
  const modal = document.getElementById('seriesArchiveModal');
  if (modal) modal.style.display = 'none';
  seriesArchivePickerContext = {
    mode: 'manga',
    list: [],
    title: '套书归档',
    label: '目标套书',
    targetHint: '选择已有套书可避免重名和错别字。',
    newNameLabel: '新套书名称',
    newNameHint: '新建套书至少需要选择两本漫画。',
    placeholder: '请输入新套书名称',
    fallbackPrompt: '请输入套书名称：'
  };
  const resolver = seriesArchivePickerResolver;
  seriesArchivePickerResolver = null;
  if (typeof resolver === 'function') resolver(result);
}

function confirmSeriesArchivePicker() {
  const targetSelect = document.getElementById('seriesArchiveTargetSelect');
  const newNameInput = document.getElementById('seriesArchiveNewNameInput');
  const ctx = seriesArchivePickerContext || {};
  const sourceList = Array.isArray(ctx.list) ? ctx.list : [];
  const label = ctx.mode === 'video' ? '连续剧' : '套书';
  if (!targetSelect) {
    closeSeriesArchivePicker(null);
    return;
  }

  if (targetSelect.value === '__new__') {
    const seriesName = String(newNameInput?.value || '').trim();
    if (!seriesName) {
      showToast(ctx.mode === 'video' ? '新连续剧名称不能为空' : '新套书名称不能为空', 'error');
      return;
    }
    closeSeriesArchivePicker({ isNew: true, seriesId: '', seriesName });
    return;
  }

  const idx = Number(targetSelect.value);
  if (!Number.isFinite(idx) || idx < 0 || idx >= sourceList.length) {
    showToast(`请选择有效的${label}`, 'error');
    return;
  }
  const target = sourceList[idx];
  closeSeriesArchivePicker({
    isNew: false,
    seriesId: String(target?.seriesId || '').trim(),
    seriesName: String(target?.seriesName || '').trim()
  });
}

function openSeriesArchivePicker({
  suggestedName = '',
  list = allSeries,
  mode = 'manga',
  title = mode === 'video' ? '连续剧归档' : '套书归档',
  label = mode === 'video' ? '目标连续剧' : '目标套书',
  targetHint = mode === 'video' ? '选择已有连续剧可避免重名和错别字。' : '选择已有套书可避免重名和错别字。',
  newNameLabel = mode === 'video' ? '新连续剧名称' : '新套书名称',
  newNameHint = mode === 'video' ? '可新建连续剧并归档当前选中视频。' : '新建套书至少需要选择两本漫画。',
  placeholder = mode === 'video' ? '请输入新连续剧名称' : '请输入新套书名称',
  fallbackPrompt = mode === 'video' ? '请输入连续剧名称：' : '请输入套书名称：'
} = {}) {
  const modal = document.getElementById('seriesArchiveModal');
  const targetSelect = document.getElementById('seriesArchiveTargetSelect');
  const newNameInput = document.getElementById('seriesArchiveNewNameInput');
  const titleEl = modal?.querySelector('.modal-title');
  const targetLabelEl = modal?.querySelector('.field label');
  const targetHintEl = document.getElementById('seriesArchiveTargetHint');
  const newNameWrap = document.getElementById('seriesArchiveNewNameWrap');
  const newNameLabelEl = newNameWrap?.querySelector('label');
  const newNameHintEl = newNameWrap?.querySelector('.modal-hint');
  const safeList = Array.isArray(list) ? list : [];
  if (!modal || !targetSelect || !newNameInput) {
    const fallback = prompt(fallbackPrompt, suggestedName || (mode === 'video' ? '我的连续剧' : '我的套书'));
    const trimmed = String(fallback || '').trim();
    return Promise.resolve(trimmed ? { isNew: true, seriesId: '', seriesName: trimmed } : null);
  }

  seriesArchivePickerContext = {
    mode,
    list: safeList,
    title,
    label,
    targetHint,
    newNameLabel,
    newNameHint,
    placeholder,
    fallbackPrompt
  };

  if (titleEl) titleEl.textContent = title;
  if (targetLabelEl) targetLabelEl.textContent = label;
  if (targetHintEl) targetHintEl.textContent = targetHint;
  if (newNameLabelEl) newNameLabelEl.textContent = newNameLabel;
  if (newNameHintEl) newNameHintEl.textContent = newNameHint;
  newNameInput.placeholder = placeholder;

  const optionHtml = [
    ...safeList.map((s, idx) => {
      const displayName = String(s.seriesName || '').trim() || (mode === 'video' ? '未命名连续剧' : '未命名套书');
      const rangeText = mode === 'video'
        ? ((s.episodeMin != null && s.episodeMax != null) ? `（第${s.episodeMin}-${s.episodeMax}集）` : '')
        : ((s.chapterMin != null && s.chapterMax != null) ? `（第${s.chapterMin}-${s.chapterMax}话）` : '');
      const unit = mode === 'video' ? '个视频' : '本';
      return `<option value="${idx}">${esc(displayName)} · ${Number(s.count || 0)}${unit} ${rangeText}</option>`;
    }),
    `<option value="__new__">+ 新建${mode === 'video' ? '连续剧' : '套书'}</option>`
  ];
  targetSelect.innerHTML = optionHtml.join('');
  targetSelect.value = safeList.length ? '0' : '__new__';
  newNameInput.value = suggestedName || (mode === 'video' ? '我的连续剧' : '我的套书');
  onSeriesArchiveTargetChange();

  modal.style.display = 'flex';

  return new Promise(resolve => {
    seriesArchivePickerResolver = resolve;
  });
}

function exitSeriesArchiveMode() {
  seriesArchiveMode = false;
  seriesSelectedIds.clear();
  closeSeriesArchivePicker(null);
  updateSeriesArchiveUI();
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
  if (activeView === 'view-duplicates') renderDuplicateView();
}

async function runSeriesArchiveAction() {
  if (currentType !== 'manga') {
    showToast('请先切换到漫画模式', 'error');
    return;
  }
  if (!seriesArchiveMode) {
    enterSeriesArchiveMode();
    return;
  }

  const ids = [...seriesSelectedIds];
  if (!ids.length) {
    showToast('请至少选择一本漫画', 'error');
    return;
  }

  const selectedPool = [...allItems, ...duplicateItems, ...duplicateIgnoredItems, ...tagItems, ...favoriteItems];
  const selectedMap = new Map();
  selectedPool.forEach(item => {
    if (!item || !ids.includes(item.id)) return;
    if (!selectedMap.has(item.id)) selectedMap.set(item.id, item);
  });
  const selectedItems = [...selectedMap.values()];
  const suggestedName = getCommonTitlePrefix(selectedItems.map(item => item.title)) || '我的套书';
  const target = await openSeriesArchivePicker({ suggestedName });
  if (!target) return;
  if (target.isNew && ids.length < 2) {
    showToast('新建套书至少需要选择两本漫画', 'error');
    return;
  }

  try {
    const resp = await fetch('/api/mangas/series/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groups: [{
          seriesId: target.seriesId || '',
          seriesName: target.seriesName,
          mangaIds: ids
        }]
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '归档失败');
    }
    const result = await resp.json();
    if (Array.isArray(result.warnings) && result.warnings.length) {
      showToast(`归档完成，但有提示：${result.warnings[0]}`, '');
    }
    invalidateTagSourceCache('manga');
    exitSeriesArchiveMode();
    await loadLibrary();
    await loadMeta();
    if (currentView === 'duplicates') await loadDuplicateWorkspace({ keepPage: true });
    if (selectedTags.length) applyTagFilter();
    showToast(`套书归档完成，已归档 ${result.affected || 0} 部漫画`, 'success');
  } catch (e) {
    showToast(e.message || '套书归档失败', 'error');
  }
}

function toggleSeriesRemoveSelection(e, id) {
  if (e) e.stopPropagation();
  if (!seriesRemoveMode) return;
  if (seriesRemoveSelectedIds.has(id)) seriesRemoveSelectedIds.delete(id);
  else seriesRemoveSelectedIds.add(id);

  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
  if (activeView === 'view-duplicates') renderDuplicateView();
  updateMangaFeatureButtons();
}

function enterSeriesRemoveMode() {
  if (!activeSeriesLib) {
    showToast('请先选择一个套书', 'error');
    return;
  }
  if (batchExportMode) exitBatchExportMode();
  if (seriesArchiveMode) exitSeriesArchiveMode();
  seriesRemoveMode = true;
  seriesRemoveSelectedIds.clear();
  updateMangaFeatureButtons();
  if (currentView === 'library') renderLibrary();
  showToast('已进入移出模式，请选择漫画后再次点击“移出已选”', '');
}

function exitSeriesRemoveMode() {
  seriesRemoveMode = false;
  seriesRemoveSelectedIds.clear();
  updateMangaFeatureButtons();
  if (currentView === 'library') renderLibrary();
}

async function removeMangasFromSeries(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return { successCount: 0, failedCount: 0 };
  const tasks = list.map(id =>
    fetch('/api/mangas/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeFromSeries: true })
    })
  );
  const results = await Promise.allSettled(tasks);
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  const failedCount = list.length - successCount;
  list.forEach(id => syncItemLocalState(id, 'manga', { seriesId: '', seriesName: '', seriesCreatedAt: '', chapterNo: null }));
  invalidateTagSourceCache('manga');
  await loadLibrary({ resetPage: false });
  await loadMeta();
  if (currentView === 'duplicates' && currentType === 'manga') await loadDuplicateWorkspace({ keepPage: true });
  if (selectedTags.length) await applyTagFilter();
  return { successCount, failedCount };
}

async function quickRemoveFromSeries(e, id) {
  if (e) e.stopPropagation();
  if (!confirm('确定将该漫画从当前套书中移除吗？')) return;
  try {
    const { failedCount } = await removeMangasFromSeries([id]);
    if (failedCount) showToast('移出失败', 'error');
    else showToast('已移出该漫画', 'success');
  } catch {
    showToast('移出失败', 'error');
  }
}

async function runSeriesRemoveAction() {
  if (currentType !== 'manga') {
    showToast('请先切换到漫画模式', 'error');
    return;
  }
  if (!activeSeriesLib) {
    showToast('请先选择一个套书', 'error');
    return;
  }
  if (!seriesRemoveMode) {
    enterSeriesRemoveMode();
    return;
  }
  const ids = [...seriesRemoveSelectedIds];
  if (!ids.length) {
    showToast('请先选择要移出的漫画', 'error');
    return;
  }
  try {
    const { successCount, failedCount } = await removeMangasFromSeries(ids);
    exitSeriesRemoveMode();
    if (failedCount > 0) showToast(`已移出 ${successCount} 本，${failedCount} 本失败`, 'error');
    else showToast(`已移出 ${successCount} 本漫画`, 'success');
  } catch {
    showToast('批量移出失败', 'error');
  }
}

function toggleExportSelection(e, id, type) {
  e.stopPropagation();
  const set = exportSelected[type] || exportSelected.manga;
  if (set.has(id)) set.delete(id);
  else set.add(id);

  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
  updateBatchExportUI();
}

function enterBatchExportMode() {
  if (seriesArchiveMode) exitSeriesArchiveMode();
  if (seriesRemoveMode) exitSeriesRemoveMode();
  batchExportMode = true;
  exportSelected[currentType].clear();
  updateBatchExportUI();
  renderLibrary();
  showToast('已进入批量导出，请先选择文件，再点击“导出已选”', '');
}

function updateBatchExportUI() {
  const count = exportSelected[currentType].size;
  const btn = document.getElementById('batchExportBtn');
  const cancelBtn = document.getElementById('cancelBatchExportBtn');
  if (!btn || !cancelBtn) return;
  btn.textContent = batchExportMode ? `⬇ 导出已选（${count}）` : '⬇ 批量导出';
  cancelBtn.style.display = batchExportMode ? '' : 'none';
  renderMobileToolbarState();
}

function handleBatchExportAction() {
  if (!batchExportMode) {
    enterBatchExportMode();
    return;
  }
  exportSelectedItems();
}

function exitBatchExportMode() {
  batchExportMode = false;
  exportSelected[currentType].clear();
  updateBatchExportUI();
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-library') renderLibrary();
  if (activeView === 'view-tags' && document.getElementById('tagFilterResult').style.display !== 'none') renderTagResult();
}

async function exportSelectedItems() {
  const ids = [...exportSelected[currentType]];
  if (!ids.length) {
    showToast('请先选择要导出的文件', 'error');
    return;
  }
  const url = currentType === 'manga' ? '/api/mangas/export' : '/api/novels/export';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!resp.ok) throw new Error((await resp.json()).error || '导出失败');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getDownloadFileName(resp, `${currentType}_selected_export.zip`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    exitBatchExportMode();
    showToast('开始导出', 'success');
  } catch (e) {
    showToast(e.message || '导出失败', 'error');
  }
}

async function exportItem(e, id, type) {
  e.stopPropagation();
  const url = type === 'manga' ? `/api/mangas/${id}/export` : `/api/novels/${id}/export`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error((await resp.json()).error || '导出失败');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = getDownloadFileName(resp, `${id}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast(err.message || '导出失败', 'error');
  }
}

/* ── 分页 ─────────────────────────────────────────────────────── */
function renderPagination(cid, current, total, onPage) {
  const el = document.getElementById(cid);
  if (total <= 1) { el.innerHTML = ''; return; }
  const show = new Set();
  [1,total,current-2,current-1,current,current+1,current+2].filter(p=>p>=1&&p<=total).forEach(p=>show.add(p));
  const pages = [...show].sort((a,b)=>a-b);
  let html='', prev=0;
  pages.forEach(p => {
    if (prev && p-prev>1) html += `<span class="pg-ellipsis">…</span>`;
    html += `<button class="pg-btn${p===current?' active':''}" onclick="(${onPage.toString()})(${p})">${p}</button>`;
    prev=p;
  });
  const jumpHtml = cid === 'pagination'
    ? `<span class="pg-jump"><span class="pg-jump-label">跳至</span><input class="pg-jump-input" type="number" min="1" max="${total}" value="${current}" onkeydown="jumpLibraryPageFromInput(event,this.value,${total})"><span class="pg-jump-label">页</span></span>`
    : '';
  el.innerHTML =
    `<button class="pg-btn pg-prev" onclick="(${onPage.toString()})(${current-1})" ${current<=1?'disabled':''}>‹</button>`+
    html+
    `<button class="pg-btn pg-next" onclick="(${onPage.toString()})(${current+1})" ${current>=total?'disabled':''}>›</button>`+
    jumpHtml;
}

/* ── Meta / Sidebar ───────────────────────────────────────────── */
async function loadMeta() {
  const typeQuery = `?type=${encodeURIComponent(currentType)}`;
  const seriesQuery = `?sort=${encodeURIComponent(seriesSortBy)}`;
  const isMediaType = currentType === 'image' || currentType === 'video';
  const requests = isMediaType
    ? [
      fetch('/api/media/tags' + typeQuery).then(r=>r.json()),
      Promise.resolve([]),
      Promise.resolve([])
    ]
    : [
      fetch('/api/tags' + typeQuery).then(r=>r.json()),
      fetch('/api/authors' + typeQuery).then(r=>r.json()),
      fetch('/api/mangas/series' + seriesQuery).then(r=>r.json())
    ];

  const [tagsRes, authorsRes, seriesRes] = await Promise.all(requests);
  allTags = tagsRes;
  allAuthors = authorsRes;
  allSeries = seriesRes || [];

  if (activeSeriesLib) {
    const hit = allSeries.find(s => (activeSeriesLib.seriesId && s.seriesId === activeSeriesLib.seriesId)
      || (!activeSeriesLib.seriesId && s.seriesName === activeSeriesLib.seriesName));
    if (!hit) activeSeriesLib = null;
  }

  renderSidebar();
  if (currentView === 'tags') renderTagFilterCloud();
  if (currentView === 'series') renderSeriesOverview();
  if (currentView === 'video-series') renderVideoSeriesOverview();
}

function buildVideoSeriesOverview(videos) {
  const grouped = new Map();
  const normalizeKey = (value) => String(value || '').trim().toLowerCase();
  (Array.isArray(videos) ? videos : []).forEach((video) => {
    const seriesId = String(video?.seriesId || '').trim();
    const seriesName = String(video?.seriesName || '').trim();
    if (!seriesId && !seriesName) return;
    const key = seriesId ? `id:${seriesId}` : `name:${normalizeKey(seriesName)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        seriesKey: seriesId || normalizeKey(seriesName),
        seriesId,
        seriesName: seriesName || seriesId,
        count: 0,
        episodeMin: null,
        episodeMax: null,
        createdAt: '',
        updatedAt: '',
        viewedAt: '',
        sample: null
      });
    }
    const group = grouped.get(key);
    group.seriesKey = seriesId || normalizeKey(seriesName);
    group.count += 1;
    const ep = Number(video?.episodeNo);
    if (Number.isFinite(ep) && ep > 0) {
      const safeEp = Math.floor(ep);
      group.episodeMin = group.episodeMin == null ? safeEp : Math.min(group.episodeMin, safeEp);
      group.episodeMax = group.episodeMax == null ? safeEp : Math.max(group.episodeMax, safeEp);
    }
    const uploadedAt = String(video?.uploadedAt || '');
    if (!group.createdAt || new Date(uploadedAt || 0) < new Date(group.createdAt || 0)) group.createdAt = uploadedAt;
    if (!group.updatedAt || new Date(uploadedAt || 0) > new Date(group.updatedAt || 0)) group.updatedAt = uploadedAt;
    if (!group.sample) group.sample = video;
  });
  return [...grouped.values()];
}

function updateVideoSeriesBatchClearUI() {
  const batchBtn = document.getElementById('videoSeriesBatchClearBtn');
  const cancelBtn = document.getElementById('videoSeriesBatchCancelBtn');
  const renameBtn = document.getElementById('videoSeriesRenameBtn');
  const selectedCount = videoSeriesBatchSelectedKeys.size;
  if (batchBtn) {
    batchBtn.textContent = videoSeriesBatchClearMode
      ? `🧹 清空已选（${selectedCount}）`
      : '🧹 批量清空连续剧归档';
  }
  if (cancelBtn) cancelBtn.style.display = videoSeriesBatchClearMode ? '' : 'none';
  if (renameBtn) renameBtn.style.display = !videoSeriesBatchClearMode && !!activeVideoSeriesOverviewKey ? '' : 'none';
}

function getVideoSeriesItemByKey(seriesKey) {
  const key = String(seriesKey || '').trim();
  if (!key) return null;
  return (Array.isArray(videoSeriesOverviewItems) ? videoSeriesOverviewItems : [])
    .find(item => String(item?.seriesKey || '').trim() === key) || null;
}

function markVideoSeriesViewed(series) {
  const payload = {
    seriesId: String(series?.seriesId || '').trim(),
    seriesName: String(series?.seriesName || '').trim()
  };
  if (!payload.seriesId && !payload.seriesName) return;
  const now = new Date().toISOString();
  videoSeriesOverviewItems = (Array.isArray(videoSeriesOverviewItems) ? videoSeriesOverviewItems : []).map(item => {
    const hit = (payload.seriesId && String(item?.seriesId || '').trim() === payload.seriesId)
      || (!payload.seriesId && String(item?.seriesName || '').trim() === payload.seriesName);
    return hit ? { ...item, viewedAt: now } : item;
  });
  fetch('/api/videos/series/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function toggleVideoSeriesBatchClearSelection(seriesKey) {
  const key = String(seriesKey || '').trim();
  if (!videoSeriesBatchClearMode || !key) return;
  if (videoSeriesBatchSelectedKeys.has(key)) videoSeriesBatchSelectedKeys.delete(key);
  else videoSeriesBatchSelectedKeys.add(key);
  updateVideoSeriesBatchClearUI();
  renderVideoSeriesOverview();
}

function toggleVideoSeriesBatchClearSelectionByIndex(index) {
  const idx = Number(index);
  const item = (Array.isArray(videoSeriesOverviewItems) ? videoSeriesOverviewItems[idx] : null);
  if (!item) return;
  toggleVideoSeriesBatchClearSelection(String(item.seriesKey || '').trim());
}

function exitVideoSeriesBatchClearMode() {
  videoSeriesBatchClearMode = false;
  videoSeriesBatchSelectedKeys.clear();
  updateVideoSeriesBatchClearUI();
  if (currentView === 'video-series') renderVideoSeriesOverview();
}

async function handleVideoSeriesBatchClearAction() {
  if (!videoSeriesBatchClearMode) {
    videoSeriesBatchClearMode = true;
    videoSeriesBatchSelectedKeys.clear();
    updateVideoSeriesBatchClearUI();
    renderVideoSeriesOverview();
    showToast('已进入批量清空模式，请先选择连续剧后再次点击', '');
    return;
  }
  const selectedKeys = [...videoSeriesBatchSelectedKeys];
  if (!selectedKeys.length) {
    showToast('请先选择要清空归档的连续剧', 'error');
    return;
  }
  const selectedItems = selectedKeys
    .map(key => getVideoSeriesItemByKey(key))
    .filter(Boolean);
  if (!selectedItems.length) {
    showToast('未找到要清空的连续剧', 'error');
    return;
  }
  if (!confirm(`确定清空已选 ${selectedItems.length} 个连续剧的归档吗？`)) return;
  try {
    const resp = await fetch('/api/videos/series/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets: selectedItems.map(item => ({
          seriesId: String(item.seriesId || '').trim(),
          seriesName: String(item.seriesName || '').trim()
        }))
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '批量清空连续剧归档失败');
    }
    const result = await resp.json();
    if (activeVideoSeriesOverviewKey && selectedKeys.includes(activeVideoSeriesOverviewKey)) {
      activeVideoSeriesOverviewKey = '';
    }
    exitVideoSeriesBatchClearMode();
    await renderVideoSeriesOverview();
    if (currentView === 'videos') await loadVideos();
    showToast(`已清空归档（${result.affected || 0} 个视频）`, 'success');
  } catch (e) {
    showToast(e.message || '批量清空连续剧归档失败', 'error');
  }
}

function renameActiveVideoSeries() {
  if (!activeVideoSeriesOverviewKey) {
    showToast('请先选择一个连续剧', 'error');
    return;
  }
  const item = getVideoSeriesItemByKey(activeVideoSeriesOverviewKey);
  if (!item) {
    showToast('未找到可重命名的连续剧', 'error');
    return;
  }
  openSeriesRenameModal({
    kind: 'video',
    seriesId: String(item.seriesId || '').trim(),
    seriesName: String(item.seriesName || '').trim()
  });
}

function sortVideoSeriesOverview(items, sort) {
  const list = Array.isArray(items) ? [...items] : [];
  const ts = (value) => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const byName = (a, b) => String(a.seriesName || '').localeCompare(String(b.seriesName || ''));
  if (sort === 'created_asc') return list.sort((a, b) => (ts(a.createdAt) - ts(b.createdAt)) || byName(a, b));
  if (sort === 'created_desc') return list.sort((a, b) => (ts(b.createdAt) - ts(a.createdAt)) || byName(a, b));
  if (sort === 'viewed_desc') return list.sort((a, b) => (ts(b.viewedAt) - ts(a.viewedAt)) || (ts(b.updatedAt) - ts(a.updatedAt)) || byName(a, b));
  return list.sort((a, b) => (ts(b.updatedAt) - ts(a.updatedAt)) || (ts(b.createdAt) - ts(a.createdAt)) || byName(a, b));
}

async function renderVideoSeriesOverview() {
  const grid = document.getElementById('videoSeriesGrid');
  const countEl = document.getElementById('videoSeriesCount');
  const sortSelect = document.getElementById('videoSeriesSortSelect');
  if (!grid || !countEl) return;
  if (sortSelect) sortSelect.value = normalizeVideoSeriesSort(videoSeriesSortBy);

  let list = [];
  try {
    const resp = await fetch(`/api/videos/series?sort=${encodeURIComponent(videoSeriesSortBy)}`);
    const payload = await resp.json().catch(() => []);
    list = Array.isArray(payload)
      ? payload.map((item) => {
        const seriesId = String(item?.seriesId || '').trim();
        const seriesName = String(item?.seriesName || '').trim();
        return {
          seriesKey: seriesId || String(seriesName || '').trim().toLowerCase(),
          seriesId,
          seriesName: seriesName || seriesId || '未命名连续剧',
          count: Number(item?.count || 0),
          episodeMin: item?.episodeMin ?? null,
          episodeMax: item?.episodeMax ?? null,
          createdAt: String(item?.seriesCreatedAt || '').trim(),
          updatedAt: String(item?.seriesUpdatedAt || '').trim(),
          viewedAt: String(item?.seriesViewedAt || '').trim(),
          previewUrl: String(item?.previewUrl || '').trim(),
          previewCover: String(item?.previewCover || '').trim(),
          previewTitle: String(item?.previewTitle || '').trim()
        };
      })
      : [];
  } catch {
    list = [];
  }

  if (!list.length) {
    try {
      const resp = await fetch('/api/videos');
      const videos = await resp.json().catch(() => []);
      list = sortVideoSeriesOverview(buildVideoSeriesOverview(videos), videoSeriesSortBy);
    } catch {
      list = [];
    }
  }

  videoSeriesOverviewItems = list;
  if (activeVideoSeriesOverviewKey && !list.some(item => String(item.seriesKey || '').trim() === activeVideoSeriesOverviewKey)) {
    activeVideoSeriesOverviewKey = '';
  }
  if (videoSeriesBatchSelectedKeys.size) {
    videoSeriesBatchSelectedKeys = new Set([...videoSeriesBatchSelectedKeys].filter(key =>
      list.some(item => String(item.seriesKey || '').trim() === key)
    ));
  }
  countEl.textContent = `已归类连续剧 ${list.length} 部`;
  updateVideoSeriesBatchClearUI();

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎬</div><p>暂无已归类连续剧</p></div>';
    requestAnimationFrame(() => {
      window.scrollTo({ top: videoSeriesViewScrollTop, behavior: 'auto' });
    });
    return;
  }

  grid.innerHTML = list.map((series, idx) => {
    const title = String(series.seriesName || '未命名连续剧').trim() || '未命名连续剧';
    const titleClass = title.length <= 10 ? ' is-short' : '';
    const episodeText = (series.episodeMin != null && series.episodeMax != null)
      ? `第 ${series.episodeMin} - ${series.episodeMax} 集`
      : '集数未标注';
    const previewCover = String(series.previewCover || series.sample?.poster || '').trim();
    const previewUrl = String(series.previewUrl || series.sample?.url || '').trim();
    const previewTitle = String(series.previewTitle || series.sample?.title || title).trim();
    const coverHtml = previewCover
      ? `<img class="series-cover" src="${previewCover}" alt="${esc(previewTitle)}" loading="lazy">`
      : (previewUrl
        ? `<video class="series-cover" src="${previewUrl}" preload="metadata" muted playsinline></video>`
        : '<div class="series-cover-placeholder">🎬</div>');
    const seriesKey = String(series.seriesKey || '').trim();
    const selectedClass = videoSeriesBatchSelectedKeys.has(seriesKey) || (!videoSeriesBatchClearMode && activeVideoSeriesOverviewKey === seriesKey)
      ? ' selected-export'
      : '';
    const selectBtn = videoSeriesBatchClearMode
      ? `<button class="clear-btn series-rename-btn" type="button" onclick="toggleVideoSeriesBatchClearSelectionByIndex(${idx});event.stopPropagation();">${videoSeriesBatchSelectedKeys.has(seriesKey) ? '☑ 取消选择' : '☐ 选择'}</button>`
      : '';
    return `<article class="series-card${selectedClass}" data-video-series-index="${idx}" onclick="openVideoSeriesShelfFromOverview(${idx})">
      <div class="series-cover-wrap">${coverHtml}</div>
      <div class="series-title${titleClass}">${esc(title)}</div>
      <div class="series-meta">${Number(series.count || 0)} 个视频 · ${esc(episodeText)}</div>
      <div class="series-card-actions">
        <button class="clear-btn series-open-btn" type="button" onclick="openVideoSeriesShelfFromOverview(${idx});event.stopPropagation();">查看该连续剧</button>
        <button class="clear-btn series-rename-btn" type="button" onclick="openVideoSeriesRenameModalByIndex(${idx});event.stopPropagation();">改名</button>
        ${selectBtn}
      </div>
    </article>`;
  }).join('');

  requestAnimationFrame(() => {
    window.scrollTo({ top: videoSeriesViewScrollTop, behavior: 'auto' });
  });
}

function openVideoSeriesShelfFromOverview(index) {
  const idx = Number(index);
  const item = (Array.isArray(videoSeriesOverviewItems) ? videoSeriesOverviewItems[idx] : null);
  if (!item) return;
  const seriesKey = String(item.seriesKey || '').trim();
  activeVideoSeriesOverviewKey = seriesKey;
  if (videoSeriesBatchClearMode) {
    toggleVideoSeriesBatchClearSelection(seriesKey);
    return;
  }
  markVideoSeriesViewed(item);
  updateVideoSeriesBatchClearUI();
  if (currentType !== 'video') switchType('video');
  if (currentView !== 'videos') showView('videos');
  window.MediaFeature?.changeVideoSeriesFilter?.(seriesKey);
  history.pushState({ view: 'videos', videoSeriesFilter: true }, '', '');
}

function openVideoSeriesRenameModalByIndex(index) {
  const idx = Number(index);
  const item = (Array.isArray(videoSeriesOverviewItems) ? videoSeriesOverviewItems[idx] : null);
  if (!item) return;
  activeVideoSeriesOverviewKey = String(item.seriesKey || '').trim();
  updateVideoSeriesBatchClearUI();
  openSeriesRenameModal({
    kind: 'video',
    seriesId: String(item.seriesId || '').trim(),
    seriesName: String(item.seriesName || '').trim()
  });
}

async function changeVideoSeriesSort(value) {
  const next = normalizeVideoSeriesSort(value);
  videoSeriesViewScrollTop = getWindowScrollTop();
  if (next === videoSeriesSortBy) {
    if (currentView === 'video-series') renderVideoSeriesOverview();
    return;
  }
  videoSeriesSortBy = next;
  localStorage.setItem(VIDEO_SERIES_SORT_KEY, videoSeriesSortBy);
  if (currentView === 'video-series') await renderVideoSeriesOverview();
}

async function renderSeriesOverview() {
  const grid = document.getElementById('seriesGrid');
  const countEl = document.getElementById('seriesCount');
  const sortSelect = document.getElementById('seriesSortSelect');
  if (!grid || !countEl) return;
  if (sortSelect) sortSelect.value = normalizeSeriesSort(seriesSortBy);

  const list = sortSeriesForView(allSeries, seriesSortBy);
  seriesOverviewItems = list;
  countEl.textContent = `已归类套书 ${list.length} 个`;

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📚</div><p>暂无已归类套书</p></div>';
    requestAnimationFrame(() => {
      window.scrollTo({ top: seriesViewScrollTop, behavior: 'auto' });
    });
    return;
  }

  let mangas = [];
  try {
    const resp = await fetch('/api/mangas');
    mangas = await resp.json();
  } catch {
    mangas = [];
  }

  const normalizeKey = (value) => String(value || '').trim().toLowerCase();
  const coverBySeries = new Map();
  const grouped = new Map();
  (Array.isArray(mangas) ? mangas : []).forEach(m => {
    const byId = String(m.seriesId || '').trim();
    const byName = normalizeKey(m.seriesName);
    const key = byId ? `id:${byId}` : (byName ? `name:${byName}` : '');
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m);
  });

  grouped.forEach((items, key) => {
    const sorted = [...items].sort((a, b) => {
      const ac = Number(a.chapterNo);
      const bc = Number(b.chapterNo);
      const aOk = Number.isFinite(ac) && ac > 0;
      const bOk = Number.isFinite(bc) && bc > 0;
      if (aOk && bOk && ac !== bc) return ac - bc;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0);
    });
    const pick = sorted.find(x => !!x.cover) || sorted[0];
    coverBySeries.set(key, pick?.cover || '');
  });

  grid.innerHTML = list.map((series, idx) => {
    const seriesTitle = String(series.seriesName || '未命名套书').trim() || '未命名套书';
    const shortTitleClass = seriesTitle.length <= 10 ? ' is-short' : '';
    const chapterText = (series.chapterMin != null && series.chapterMax != null)
      ? `第 ${series.chapterMin} - ${series.chapterMax} 话`
      : '';
    const key = series.seriesId
      ? `id:${String(series.seriesId).trim()}`
      : `name:${normalizeKey(series.seriesName)}`;
    const cover = coverBySeries.get(key) || '';
    const coverHtml = cover
      ? `<img class="series-cover" src="${cover}" alt="${esc(series.seriesName || '套书封面')}" loading="lazy">`
      : '<div class="series-cover-placeholder">📚</div>';
    return `<article class="series-card" data-series-index="${idx}" onclick="openSeriesShelfFromOverview(${idx})">
      <div class="series-cover-wrap">${coverHtml}</div>
      <div class="series-title${shortTitleClass}">${esc(seriesTitle)}</div>
      <div class="series-meta">${Number(series.count || 0)} 本${chapterText ? ` · ${esc(chapterText)}` : ''}</div>
      <div class="series-card-actions">
        <button class="clear-btn series-open-btn" type="button" onclick="openSeriesShelfFromOverview(${idx});event.stopPropagation();">查看该套书</button>
        <button class="clear-btn series-rename-btn" type="button" onclick="openSeriesRenameModalByIndex(${idx});event.stopPropagation();">改名</button>
      </div>
    </article>`;
  }).join('');

  bindSeriesCardLongPress();

  requestAnimationFrame(() => {
    window.scrollTo({ top: seriesViewScrollTop, behavior: 'auto' });
  });
}

function openSeriesShelfFromOverview(index) {
  if (Date.now() < seriesCardLongPressSuppressUntil) return;
  const idx = Number(index);
  const item = (Array.isArray(seriesOverviewItems) ? seriesOverviewItems[idx] : null) || allSeries[idx];
  if (!item) return;
  reportSeriesViewed(item);
  if (currentType !== 'manga') switchType('manga');
  activeSeriesLib = {
    seriesId: String(item.seriesId || '').trim(),
    seriesName: String(item.seriesName || '').trim()
  };
  returnToSeriesViewOnClear = true;
  if (currentView !== 'library') showView('library');
  history.pushState({ view: 'library', seriesFilter: true, fromSeriesOverview: true }, '', '');
  updateFilterUI();
  loadLibrary({ resetPage: true });
  renderSidebar();
}

function reportSeriesViewed(series) {
  const payload = {
    seriesId: String(series?.seriesId || '').trim(),
    seriesName: String(series?.seriesName || '').trim()
  };
  if (!payload.seriesId && !payload.seriesName) return;
  const now = new Date().toISOString();
  allSeries = (Array.isArray(allSeries) ? allSeries : []).map(item => {
    const hit = (payload.seriesId && String(item?.seriesId || '').trim() === payload.seriesId)
      || (!payload.seriesId && String(item?.seriesName || '').trim() === payload.seriesName);
    return hit ? { ...item, seriesViewedAt: now } : item;
  });
  fetch('/api/mangas/series/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

async function changeSeriesSort(value) {
  const next = normalizeSeriesSort(value);
  seriesViewScrollTop = getWindowScrollTop();
  if (next === seriesSortBy) {
    if (currentView === 'series') renderSeriesOverview();
    return;
  }
  seriesSortBy = next;
  localStorage.setItem(SERIES_SORT_KEY, seriesSortBy);
  try {
    await loadMeta();
  } catch {
    showToast('套书排序更新失败', 'error');
  }
}

function bindSeriesCardLongPress() {
  const cards = document.querySelectorAll('#seriesGrid .series-card');
  cards.forEach(card => {
    const idx = Number(card.dataset.seriesIndex);
    if (!Number.isFinite(idx)) return;

    const cancelPress = () => {
      const timer = seriesCardLongPressTimers.get(idx);
      if (timer) {
        clearTimeout(timer);
        seriesCardLongPressTimers.delete(idx);
      }
      seriesCardLongPressStarts.delete(idx);
    };

    card.addEventListener('touchstart', (e) => {
      const touch = e.touches?.[0];
      if (!touch) return;
      seriesCardLongPressStarts.set(idx, {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      });
      const timer = setTimeout(() => {
        seriesCardLongPressSuppressUntil = Date.now() + 700;
        openSeriesRenameModalByIndex(idx);
        cancelPress();
      }, LONG_PRESS_DURATION);
      seriesCardLongPressTimers.set(idx, timer);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const start = seriesCardLongPressStarts.get(idx);
      const touch = e.touches?.[0];
      if (!start || !touch) return;
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > LONG_PRESS_MOVE_THRESHOLD) cancelPress();
    }, { passive: true });

    card.addEventListener('touchend', cancelPress);
    card.addEventListener('touchcancel', cancelPress);
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function openSeriesRenameModalByIndex(index) {
  const idx = Number(index);
  const item = (Array.isArray(seriesOverviewItems) ? seriesOverviewItems[idx] : null) || allSeries[idx];
  if (!item) return;
  openSeriesRenameModal({
    seriesId: String(item.seriesId || '').trim(),
    seriesName: String(item.seriesName || '').trim()
  });
}

function openSeriesRenameModal(target) {
  const modal = document.getElementById('seriesRenameModal');
  const oldInput = document.getElementById('seriesRenameOldName');
  const input = document.getElementById('seriesRenameInput');
  if (!modal || !oldInput || !input) return;

  const seriesId = String(target?.seriesId || '').trim();
  const seriesName = String(target?.seriesName || '').trim();
  if (!seriesId && !seriesName) {
    showToast('未找到可修改的套书', 'error');
    return;
  }

  const kind = String(target?.kind || 'manga').trim() === 'video' ? 'video' : 'manga';
  seriesRenameTarget = { kind, seriesId, seriesName };
  oldInput.value = seriesName || (kind === 'video' ? '未命名连续剧' : '未命名套书');
  input.value = seriesName;
  modal.style.display = 'flex';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function closeSeriesRenameModal() {
  const modal = document.getElementById('seriesRenameModal');
  if (modal) modal.style.display = 'none';
  seriesRenameTarget = null;
}

function handleSeriesRenameInputKey(event) {
  if (!event) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    submitSeriesRenameModal();
  }
}

async function submitSeriesRenameModal() {
  if (!seriesRenameTarget) return;
  const input = document.getElementById('seriesRenameInput');
  const nextName = String(input?.value || '').trim();
  if (!nextName) {
    showToast('套书名称不能为空', 'error');
    return;
  }

  const oldName = String(seriesRenameTarget.seriesName || '').trim();
  const renameKind = String(seriesRenameTarget.kind || 'manga').trim() === 'video' ? 'video' : 'manga';
  if (nextName === oldName) {
    showToast('新名称与当前名称相同', '');
    return;
  }

  try {
    if (renameKind === 'manga' && currentView === 'series') {
      seriesViewScrollTop = getWindowScrollTop();
    }
    if (renameKind === 'video' && currentView === 'video-series') {
      videoSeriesViewScrollTop = getWindowScrollTop();
    }
    const endpoint = renameKind === 'video' ? '/api/videos/series/rename' : '/api/mangas/series/rename';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: seriesRenameTarget.seriesId || '',
        seriesName: seriesRenameTarget.seriesName || '',
        newSeriesName: nextName
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '套书改名失败');
    }

    const result = await resp.json();
    const renamed = {
      seriesId: String(result.seriesId || seriesRenameTarget.seriesId || '').trim(),
      seriesName: String(result.seriesName || nextName).trim()
    };

    if (activeSeriesLib) {
      const hit = (activeSeriesLib.seriesId && activeSeriesLib.seriesId === seriesRenameTarget.seriesId)
        || (!activeSeriesLib.seriesId && activeSeriesLib.seriesName === seriesRenameTarget.seriesName);
      if (hit && renameKind === 'manga') activeSeriesLib = renamed;
    }

    closeSeriesRenameModal();
    invalidateTagSourceCache(renameKind === 'video' ? 'video' : 'manga');
    if (renameKind === 'video') {
      await renderVideoSeriesOverview();
      if (currentView === 'videos') await loadVideos();
      showToast(`连续剧名称已更新（${result.affected || 0} 个视频）`, 'success');
      return;
    }
    await loadMeta();
    if (currentView === 'library') await loadLibrary({ resetPage: true });
    if (selectedTags.length) await applyTagFilter();
    showToast(`套书名称已更新（${result.affected || 0} 部）`, 'success');
  } catch (e) {
    showToast(e.message || (renameKind === 'video' ? '连续剧改名失败' : '套书改名失败'), 'error');
  }
}

function returnToSeriesOverviewAfterClear() {
  loadLibrary({ resetPage: true });
  renderSidebar();
  showView('series');
}

function renderSidebar() {
  document.getElementById('authorList').innerHTML = allAuthors.map(a=>
    `<div class="filter-item${activeAuthors.includes(a)?' active':''}" onclick="filterAuthor('${esc(a)}')">${esc(a)}</div>`
  ).join('');
  document.getElementById('tagCloud').innerHTML = allTags.map(t=>
    `<span class="tag-pill${activeTagLib===t?' active':''}" onclick="filterTag('${esc(t)}')">${esc(t)}</span>`
  ).join('');

  const seriesEl = document.getElementById('seriesList');
  const seriesOptionHtml = '<option value="">全部套书</option>' + allSeries.map((s, idx) => {
    const displayName = String(s.seriesName || '').trim() || '未命名套书';
    const chapterText = (s.chapterMin != null && s.chapterMax != null)
      ? `（${s.chapterMin}-${s.chapterMax}）`
      : '';
    return `<option value="${idx}">${esc(displayName)} · ${s.count}本 ${chapterText}</option>`;
  }).join('');
  if (seriesEl) {
    seriesEl.innerHTML = currentType !== 'manga'
      ? ''
      : allSeries.map((s, idx) => {
        const isActive = activeSeriesLib && ((activeSeriesLib.seriesId && activeSeriesLib.seriesId === s.seriesId)
          || (!activeSeriesLib.seriesId && activeSeriesLib.seriesName === s.seriesName));
        const displayName = String(s.seriesName || '').trim() || '未命名套书';
        const chapterText = (s.chapterMin != null && s.chapterMax != null)
          ? `（第${s.chapterMin}-${s.chapterMax}话）`
          : '';
        return `<div class="filter-item${isActive?' active':''}" onclick="filterSeriesByIndex(${idx})">${esc(displayName)} · ${s.count}本 ${chapterText}${isActive ? ` <button class="af-chip-btn" title="取消套书筛选" onclick="clearActiveSeriesFilter(event)">×</button>` : ''}</div>`;
      }).join('');
  }

  const clearSeriesBtn = document.getElementById('clearSeriesBtn');
  const shouldShowClearSeriesArchive = currentType === 'manga' && !!activeSeriesLib;
  if (clearSeriesBtn) clearSeriesBtn.style.display = shouldShowClearSeriesArchive ? '' : 'none';

  const desktopSeriesWrap = document.getElementById('desktopSeriesWrap');
  const desktopSeriesSelect = document.getElementById('desktopSeriesSelect');
  if (desktopSeriesWrap && desktopSeriesSelect) {
    const showDesktopSeries = currentType === 'manga';
    desktopSeriesWrap.style.display = showDesktopSeries ? '' : 'none';
    if (showDesktopSeries) {
      desktopSeriesSelect.innerHTML = seriesOptionHtml;
      const activeIndex = allSeries.findIndex(s => activeSeriesLib && (
        (activeSeriesLib.seriesId && activeSeriesLib.seriesId === s.seriesId)
        || (!activeSeriesLib.seriesId && activeSeriesLib.seriesName === s.seriesName)
      ));
      desktopSeriesSelect.value = activeIndex >= 0 ? String(activeIndex) : '';
      desktopSeriesSelect.disabled = !allSeries.length;
    } else {
      desktopSeriesSelect.value = '';
    }
  }

  const mobileSeriesWrap = document.getElementById('mobileSeriesWrap');
  const mobileSeriesSelect = document.getElementById('mobileSeriesSelect');
  const mobileClearSeriesBtn = document.getElementById('mobileClearSeriesBtn');
  if (mobileSeriesWrap && mobileSeriesSelect) {
    const showMobileSeries = currentType === 'manga';
    mobileSeriesWrap.style.display = showMobileSeries ? '' : 'none';
    if (showMobileSeries) {
      mobileSeriesSelect.innerHTML = seriesOptionHtml;
      const activeIndex = allSeries.findIndex(s => activeSeriesLib && (
        (activeSeriesLib.seriesId && activeSeriesLib.seriesId === s.seriesId)
        || (!activeSeriesLib.seriesId && activeSeriesLib.seriesName === s.seriesName)
      ));
      mobileSeriesSelect.value = activeIndex >= 0 ? String(activeIndex) : '';
      mobileSeriesSelect.disabled = !allSeries.length;
    } else {
      mobileSeriesSelect.value = '';
    }
  }
  if (mobileClearSeriesBtn) mobileClearSeriesBtn.style.display = shouldShowClearSeriesArchive ? '' : 'none';
  updateMangaFeatureButtons();
}

function clearActiveSeriesFilter(e) {
  if (e) e.stopPropagation();
  if (!activeSeriesLib) return;
  activeSeriesLib = null;
  const shouldBackToSeriesView = returnToSeriesViewOnClear;
  returnToSeriesViewOnClear = false;
  updateFilterUI();
  if (shouldBackToSeriesView) {
    returnToSeriesOverviewAfterClear();
    return;
  }
  renderSidebar();
  loadLibrary({ resetPage: true });
}

function filterAuthor(a) {
  const idx = activeAuthors.indexOf(a);
  if (idx === -1) activeAuthors.push(a);
  else activeAuthors.splice(idx, 1);
  updateFilterUI(); loadLibrary({ resetPage: true }); renderSidebar();
}
function filterTag(t)     { activeTagLib = activeTagLib===t?null:t; updateFilterUI(); loadLibrary({ resetPage: true }); renderSidebar(); }
function filterSeries(seriesId, seriesName) {
  const isSame = activeSeriesLib && (
    (seriesId && activeSeriesLib.seriesId === seriesId)
    || (!seriesId && activeSeriesLib.seriesName === seriesName)
  );
  activeSeriesLib = isSame ? null : { seriesId: seriesId || '', seriesName: seriesName || '' };
  const shouldBackToSeriesView = isSame && returnToSeriesViewOnClear;
  if (!isSame) {
    returnToSeriesViewOnClear = false;
    history.pushState({ view: 'library', seriesFilter: true }, '', '');
  }
  if (isSame) returnToSeriesViewOnClear = false;
  updateFilterUI();
  if (shouldBackToSeriesView) {
    returnToSeriesOverviewAfterClear();
    return;
  }
  renderSidebar();
  loadLibrary({ resetPage: true });
}
function filterSeriesByIndex(index) {
  const item = allSeries[index];
  if (!item) return;
  filterSeries(item.seriesId || '', item.seriesName || '');
}
function clearAuthorFilter() {
  if (!activeAuthors.length) return;
  activeAuthors = [];
  updateFilterUI();
  loadLibrary({ resetPage: true });
  renderSidebar();
}
function removeAuthorFilter(name) {
  const idx = activeAuthors.indexOf(name);
  if (idx === -1) return;
  activeAuthors.splice(idx, 1);
  updateFilterUI();
  loadLibrary({ resetPage: true });
  renderSidebar();
}
function removeAuthorFilterByIndex(index) {
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= activeAuthors.length) return;
  activeAuthors.splice(idx, 1);
  updateFilterUI();
  loadLibrary({ resetPage: true });
  renderSidebar();
}
function handleMobileSeriesSelect(value) {
  handleSeriesSelectByIndexValue(value);
}

function handleDesktopSeriesSelect(value) {
  handleSeriesSelectByIndexValue(value);
}

function handleSeriesSelectByIndexValue(value) {
  if (value === '') {
    if (activeSeriesLib) {
      activeSeriesLib = null;
      const shouldBackToSeriesView = returnToSeriesViewOnClear;
      returnToSeriesViewOnClear = false;
      updateFilterUI();
      if (shouldBackToSeriesView) {
        returnToSeriesOverviewAfterClear();
        return;
      }
      renderSidebar();
      loadLibrary({ resetPage: true });
    }
    return;
  }
  returnToSeriesViewOnClear = false;
  const index = Number(value);
  if (!Number.isFinite(index)) return;
  filterSeriesByIndex(index);
}
function clearFilters() {
  const shouldBackToSeriesView = !!activeSeriesLib && returnToSeriesViewOnClear;
  activeAuthors = [];
  activeTagLib = null;
  activeSeriesLib = null;
  returnToSeriesViewOnClear = false;
  searchQuery = '';
  syncSearchInputs('');
  updateFilterUI();
  if (shouldBackToSeriesView) {
    returnToSeriesOverviewAfterClear();
    return;
  }
  if (currentView === 'favorites') {
    loadFavorites({ resetPage: true });
    return;
  }
  if (currentView === 'images') {
    loadImages();
    return;
  }
  if (currentView === 'videos') {
    loadVideos();
    return;
  }
  if (currentView === 'video-history') {
    renderVideoHistory({ resetPage: true });
    return;
  }
  loadLibrary({ resetPage: true });
  renderSidebar();
}
function updateFilterUI() {
  const chips=[];
  activeAuthors.forEach((a, i) => chips.push(
    `<span class="af-chip">作者: ${esc(a)} <button class="af-chip-btn" title="取消作者筛选" onclick="removeAuthorFilterByIndex(${i})">×</button></span>`
  ));
  if (activeTagLib) chips.push(`<span class="af-chip">标签: ${esc(activeTagLib)}</span>`);
  if (activeSeriesLib?.seriesName) chips.push(`<span class="af-chip">套书: ${esc(activeSeriesLib.seriesName)} <button class="af-chip-btn" title="取消套书筛选" onclick="clearActiveSeriesFilter(event)">×</button></span>`);
  if (searchQuery)  chips.push(`<span class="af-chip">搜索: ${esc(searchQuery)}</span>`);
  document.getElementById('activeFilters').innerHTML = chips.join('');
  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) {
    const onlySeriesFilter = !!activeSeriesLib && !activeAuthors.length && !activeTagLib && !searchQuery;
    clearBtn.style.display = (chips.length && !onlySeriesFilter) ? '' : 'none';
  }
  saveLibraryViewState();
  renderMobileToolbarState();
}
function debounceSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = document.getElementById('searchInput').value.trim();
    syncSearchInputs(searchQuery);
    activeAuthors=[]; activeTagLib=null; activeSeriesLib=null; updateFilterUI();
    if (currentView === 'favorites') {
      loadFavorites({ resetPage: true });
      return;
    }
    if (currentView === 'images') {
      loadImages();
      return;
    }
    if (currentView === 'videos') {
      loadVideos();
      return;
    }
    if (currentView === 'video-history') {
      renderVideoHistory({ resetPage: true });
      return;
    }
    loadLibrary({ resetPage: true });
  }, 300);
}

async function clearActiveSeriesArchive() {
  if (currentType !== 'manga' || !activeSeriesLib) {
    showToast('请先选择一个套书', 'error');
    return;
  }
  const name = activeSeriesLib.seriesName || '该套书';
  if (!confirm(`确定取消“${name}”的套书归档吗？`)) return;
  try {
    const resp = await fetch('/api/mangas/series/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesId: activeSeriesLib.seriesId || '',
        seriesName: activeSeriesLib.seriesName || ''
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '取消系列失败');
    }
    const result = await resp.json();
    activeSeriesLib = null;
    invalidateTagSourceCache('manga');
    await loadLibrary({ resetPage: true });
    await loadMeta();
    showToast(`已取消该系列归档（${result.affected || 0} 部）`, 'success');
  } catch (e) {
    showToast(e.message || '取消系列失败', 'error');
  }
}

async function renameActiveSeries() {
  if (currentType !== 'manga' || !activeSeriesLib) {
    showToast('请先选择一个套书', 'error');
    return;
  }
  openSeriesRenameModal({
    seriesId: activeSeriesLib.seriesId || '',
    seriesName: activeSeriesLib.seriesName || ''
  });
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('seriesArchiveModal');
  if (modal && modal.style.display !== 'none') closeSeriesArchivePicker(null);
  const renameModal = document.getElementById('seriesRenameModal');
  if (renameModal && renameModal.style.display !== 'none') closeSeriesRenameModal();
});

/* ── 标签多选页 ───────────────────────────────────────────────── */
function renderTagFilterCloud() {
  document.getElementById('tagFilterCloud').innerHTML = allTags.map(t=>
    `<span class="tag-filter-pill${selectedTags.includes(t)?' active':''}" onclick="toggleTagFilter('${esc(t)}')">${esc(t)}</span>`
  ).join('');
}
function toggleTagFilter(tag) {
  const idx=selectedTags.indexOf(tag);
  if (idx===-1) selectedTags.push(tag); else selectedTags.splice(idx,1);
  renderTagFilterCloud(); applyTagFilter();
}
function clearTagFilter() {
  selectedTags=[]; renderTagFilterCloud();
  document.getElementById('tagFilterResult').style.display='none';
  document.getElementById('tagEmptyResult').style.display='none';
  document.getElementById('tagNoSelect').style.display='';
}
async function applyTagFilter() {
  if (!selectedTags.length) { clearTagFilter(); return; }
  const list = await getTagSourceList(currentType);
  tagItems = list.filter(m=>selectedTags.every(t=>(m.tags||[]).includes(t)));
  if (sortBy === 'read_latest') tagItems = applyReadHistorySort(tagItems, currentType);
  tagPage=1; renderTagResult();
}
function renderTagResult() {
  document.getElementById('tagNoSelect').style.display='none';
  if (!tagItems.length) { document.getElementById('tagFilterResult').style.display='none'; document.getElementById('tagEmptyResult').style.display=''; return; }
  document.getElementById('tagEmptyResult').style.display='none';
  document.getElementById('tagFilterResult').style.display='';
  const total=tagItems.length, totalPages=Math.max(1,Math.ceil(total/tagPerPage));
  if (tagPage>totalPages) tagPage=totalPages;
  const slice=tagItems.slice((tagPage-1)*tagPerPage, tagPage*tagPerPage);
  document.getElementById('tagResultCount').textContent = '共 '+total+' 项'+(totalPages>1?`（第 ${tagPage}/${totalPages} 页）`:'');
  renderCards('tagMangaGrid', slice);
  renderPagination('tagPagination', tagPage, totalPages, p=>{tagPage=p;renderTagResult();});
}
function changeTagPerPage(v) { tagPerPage=Number(v); tagPage=1; renderTagResult(); }

/* ═══════════════════════════════════════════════════════════════
   漫画阅读器
   ═══════════════════════════════════════════════════════════════ */
let readerUIVisible=true, readerUITimer=null;
let readerProgressScrubRaf = 0;
let readerProgressPendingIndex = -1;

async function openReader(id) {
  try {
    touchReadHistory('manga', id);
    if (sortBy === 'read_latest') {
      if (currentView === 'favorites') loadFavorites({ resetPage: false });
      else if (currentView === 'tags' && selectedTags.length) applyTagFilter();
      else if (currentView === 'library') loadLibrary({ resetPage: false });
    }
    const manga = await fetch('/api/mangas/'+id).then(r=>r.json());
    reportSeriesViewed(manga);
    const saved  = getProgress(id);
    reader = { id, title: manga.title, pages: manga.pageUrls||[], currentPage: Math.min(saved,manga.pageUrls.length-1), horizontal: false, zoom: 1, _scrollingTo:-1 };
    document.getElementById('readerTitle').textContent = manga.title;
    document.getElementById('pageTotalLabel').textContent = reader.pages.length;
    document.getElementById('modeBtn').textContent = '⇅';
    document.getElementById('readerModal').style.display='flex';
    document.getElementById('readerModal').classList.remove('ui-hidden');
    readerUIVisible=true; clearTimeout(readerUITimer);
    document.body.style.overflow='hidden';
    history.pushState({ reader:true, id }, '', '');
    renderReaderPage();
    if (saved>0) showToast(`从第 ${saved+1} 页继续阅读`,'');
  } catch { showToast('打开失败','error'); }
}

function closeReader(fromPopState=false) {
  if (pageObserver) { pageObserver.disconnect(); pageObserver=null; }
  clearReaderRetryTimers();
  if (readerProgressScrubRaf) {
    cancelAnimationFrame(readerProgressScrubRaf);
    readerProgressScrubRaf = 0;
  }
  readerProgressPendingIndex = -1;
  clearTimeout(saveProgressTimer); clearTimeout(readerUITimer);
  clearTimeout(readerZoomToastTimer);
  if (reader.id) saveProgress(reader.id, reader.currentPage);
  document.getElementById('readerModal').style.display='none';
  document.getElementById('readerModal').style.removeProperty('--reader-zoom');
  document.body.style.overflow='';
  reader.id=null;
  if (!fromPopState) history.back();
  if (selectedTags.length) applyTagFilter();
}

function isDesktopReader() {
  return window.matchMedia('(min-width:721px)').matches;
}

function clampReaderZoom(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(READER_ZOOM_MIN, Math.min(READER_ZOOM_MAX, Number(num.toFixed(2))));
}

function applyReaderZoom() {
  const modal = document.getElementById('readerModal');
  if (!modal || !reader.id) return;
  const zoom = isDesktopReader() ? clampReaderZoom(reader.zoom || 1) : 1;
  modal.style.setProperty('--reader-zoom', String(zoom));
}

function adjustReaderZoom(stepDelta) {
  if (!reader.id || !isDesktopReader()) return;
  const nextZoom = clampReaderZoom((reader.zoom || 1) + stepDelta);
  if (nextZoom === reader.zoom) return;
  reader.zoom = nextZoom;
  applyReaderZoom();
  clearTimeout(readerZoomToastTimer);
  readerZoomToastTimer = setTimeout(() => {
    showToast(`缩放 ${Math.round(nextZoom * 100)}%`, '');
  }, 120);
}

function setupReaderZoomWheel() {
  const body = document.getElementById('readerBody');
  if (!body) return;
  body.addEventListener('wheel', (e) => {
    if (!reader.id || !e.ctrlKey || !isDesktopReader()) return;
    e.preventDefault();
    adjustReaderZoom(e.deltaY < 0 ? READER_ZOOM_STEP : -READER_ZOOM_STEP);
  }, { passive: false });
}

function updateReaderProgressUI(previewValue = null) {
  const range = document.getElementById('readerProgressRange');
  const label = document.getElementById('readerProgressLabel');
  if (!range || !label || !reader.id) return;

  const total = Math.max(1, Number(reader.pages?.length || 1));
  const pageNum = previewValue == null
    ? Math.max(1, Math.min(total, reader.currentPage + 1))
    : Math.max(1, Math.min(total, Math.round(Number(previewValue) || 1)));

  range.min = '1';
  range.max = String(total);
  range.step = '1';
  range.value = String(pageNum);
  label.textContent = `${pageNum} / ${total} 页`;
}

function flushReaderProgressScrub() {
  readerProgressScrubRaf = 0;
  if (readerProgressPendingIndex < 0 || !reader.id) return;
  const target = readerProgressPendingIndex;
  readerProgressPendingIndex = -1;
  if (target === reader.currentPage) return;
  scrollToPage(target, false);
}

function scheduleReaderProgressScrub(targetIndex) {
  readerProgressPendingIndex = targetIndex;
  if (readerProgressScrubRaf) return;
  readerProgressScrubRaf = requestAnimationFrame(flushReaderProgressScrub);
}

function handleReaderProgressInput(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const target = Math.max(1, Math.min(reader.pages.length || 1, Math.round(value))) - 1;
  updateReaderProgressUI(target + 1);
  scheduleReaderProgressScrub(target);
}

function handleReaderProgressChange(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const target = Math.max(1, Math.min(reader.pages.length || 1, Math.round(value))) - 1;
  if (readerProgressScrubRaf) {
    cancelAnimationFrame(readerProgressScrubRaf);
    readerProgressScrubRaf = 0;
  }
  readerProgressPendingIndex = -1;
  scrollToPage(target, false);
}

function clearReaderRetryTimers() {
  readerRetryTimers.forEach(timer => clearTimeout(timer));
  readerRetryTimers.clear();
}

function getReaderWindowRange(centerIdx) {
  const total = reader.pages.length;
  const start = Math.max(0, centerIdx - READER_WINDOW_BEFORE);
  const end = Math.min(total - 1, centerIdx + READER_WINDOW_AFTER);
  return { start, end };
}

function isReaderIndexInWindow(idx, centerIdx = reader.currentPage) {
  const { start, end } = getReaderWindowRange(centerIdx);
  return idx >= start && idx <= end;
}

function scheduleReaderImageRetry(imgEl, idx) {
  const retryCount = Number(imgEl.dataset.retryCount || 0);
  if (retryCount >= READER_MAX_RETRY || !isReaderIndexInWindow(idx)) {
    imgEl.classList.add('is-failed');
    imgEl.classList.add('is-placeholder');
    return;
  }
  const nextCount = retryCount + 1;
  imgEl.dataset.retryCount = String(nextCount);
  const timer = setTimeout(() => {
    readerRetryTimers.delete(idx);
    if (!isReaderIndexInWindow(idx)) return;
    imgEl.classList.add('is-placeholder');
    imgEl.classList.remove('is-failed');
    imgEl.src = `${imgEl.dataset.src}${imgEl.dataset.src.includes('?') ? '&' : '?'}retry=${nextCount}&t=${Date.now()}`;
  }, READER_RETRY_DELAY * nextCount);
  if (readerRetryTimers.has(idx)) clearTimeout(readerRetryTimers.get(idx));
  readerRetryTimers.set(idx, timer);
}

function activateReaderImage(imgEl, idx) {
  if (!imgEl || !imgEl.dataset.src) return;
  if (!isReaderIndexInWindow(idx)) return;
  if (imgEl.dataset.active === '1') return;

  imgEl.dataset.active = '1';
  imgEl.classList.add('is-placeholder');
  imgEl.classList.remove('is-failed');
  imgEl.loading = Math.abs(idx - reader.currentPage) <= READER_EAGER_RANGE ? 'eager' : 'lazy';
  imgEl.decoding = 'async';
  imgEl.src = imgEl.dataset.src;
}

function deactivateReaderImage(imgEl, idx) {
  if (!imgEl) return;
  if (readerRetryTimers.has(idx)) {
    clearTimeout(readerRetryTimers.get(idx));
    readerRetryTimers.delete(idx);
  }
  imgEl.dataset.active = '0';
  imgEl.dataset.retryCount = '0';
  imgEl.classList.remove('is-failed');
  imgEl.classList.add('is-placeholder');
  imgEl.removeAttribute('src');
}

function preloadReaderPage(idx) {
  if (idx < 0 || idx >= reader.pages.length) return;
  const src = reader.pages[idx];
  if (!src || readerPreloadCache.has(src)) return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => readerPreloadCache.add(src);
  img.onerror = () => {};
  img.src = src;
}

function updateReaderVirtualWindow(centerIdx = reader.currentPage) {
  const pages = document.querySelectorAll('#pageContainer .reader-page');
  if (!pages.length) return;
  const { start, end } = getReaderWindowRange(centerIdx);

  pages.forEach((imgEl, idx) => {
    if (idx >= start && idx <= end) activateReaderImage(imgEl, idx);
    else deactivateReaderImage(imgEl, idx);
  });

  for (let i = 1; i <= READER_PRELOAD_AHEAD; i += 1) preloadReaderPage(centerIdx + i);
}

function startPageObserver() {
  if (pageObserver) pageObserver.disconnect();
  const body = document.getElementById('readerBody');
  pageObserver = new IntersectionObserver(entries => {
    let best=null, bestRatio=0;
    entries.forEach(e => { if (e.intersectionRatio>bestRatio) { bestRatio=e.intersectionRatio; best=e.target; }});
    if (!best) return;
    const idx = parseInt(best.dataset.idx);
    if (isNaN(idx)||idx===reader.currentPage) return;
    reader.currentPage=idx;
    updateReaderVirtualWindow(idx);
    updateReaderProgressUI();
    const inp=document.getElementById('pageJumpInput');
    if (document.activeElement!==inp) inp.value=idx+1;
    clearTimeout(saveProgressTimer);
    saveProgressTimer=setTimeout(()=>{ if(reader.id) saveProgress(reader.id,idx); },800);
  }, { root:body, threshold:[0,0.1,0.3,0.5,0.7,0.9,1.0] });
  document.querySelectorAll('#pageContainer .reader-page').forEach(img=>pageObserver.observe(img));
}

function renderReaderPage() {
  if (pageObserver) { pageObserver.disconnect(); pageObserver=null; }
  clearReaderRetryTimers();
  const container=document.getElementById('pageContainer');
  container.innerHTML='';
  container.className='page-container'+(reader.horizontal?' horizontal':'');
  applyReaderZoom();
  const fragment = document.createDocumentFragment();
  reader.pages.forEach((url,idx)=>{
    const img=document.createElement('img');
    img.className='reader-page is-placeholder';
    img.loading='lazy';
    img.decoding='async';
    img.dataset.src=url;
    img.dataset.idx=idx;
    img.dataset.active='0';
    img.dataset.retryCount='0';
    img.addEventListener('load', () => {
      img.dataset.retryCount = '0';
      img.classList.remove('is-placeholder');
      img.classList.remove('is-failed');
      if (img.dataset.src) readerPreloadCache.add(img.dataset.src);
    });
    img.addEventListener('error', () => {
      if (img.dataset.active !== '1') return;
      scheduleReaderImageRetry(img, idx);
    });
    fragment.appendChild(img);
  });
  container.appendChild(fragment);
  updateReaderVirtualWindow(reader.currentPage);
  updateReaderProgressUI();
  scrollToPage(reader.currentPage,false);
  setTimeout(()=>startPageObserver(),150);
}

function scrollToPage(idx,smooth=true) {
  const pages=document.querySelectorAll('#pageContainer .reader-page');
  if (!pages[idx]) return;
  updateReaderVirtualWindow(idx);
  reader._scrollingTo=idx;
  if (reader.horizontal) pages[idx].scrollIntoView({behavior:smooth?'smooth':'instant',inline:'start',block:'nearest'});
  else                   pages[idx].scrollIntoView({behavior:smooth?'smooth':'instant',block:'start'});
  reader.currentPage=idx;
  updateReaderProgressUI();
  document.getElementById('pageJumpInput').value=idx+1;
  if (reader.id) saveProgress(reader.id,idx);
  setTimeout(()=>{reader._scrollingTo=-1;},smooth?500:50);
}

function nextPage() { if (reader.currentPage<reader.pages.length-1) scrollToPage(reader.currentPage+1); }
function prevPage() { if (reader.currentPage>0) scrollToPage(reader.currentPage-1); }

function handlePageJump(e) {
  if (e.key!=='Enter') return;
  const val=parseInt(e.target.value);
  if (!isNaN(val)) { const p=Math.max(1,Math.min(val,reader.pages.length)); scrollToPage(p-1); e.target.value=p; e.target.blur(); }
}
function handlePageJumpBlur() { document.getElementById('pageJumpInput').value=reader.currentPage+1; }

function toggleReaderUI() { if (readerUIVisible) hideReaderUI(); else showReaderUI(); }
function showReaderUI() {
  readerUIVisible=true;
  document.getElementById('readerModal').classList.remove('ui-hidden');
  clearTimeout(readerUITimer);
  if (window.matchMedia('(max-width:720px)').matches) readerUITimer=setTimeout(hideReaderUI,5000);
}
function hideReaderUI() {
  readerUIVisible=false; clearTimeout(readerUITimer);
  document.getElementById('readerModal').classList.add('ui-hidden');
}

function handleReaderClick(e) {
  if (e.target.closest('.page-jump')) return;
  const body=document.getElementById('readerBody');
  const rect=body.getBoundingClientRect();
  const relX=e.clientX-rect.left;
  if (relX>=rect.width*0.35&&relX<=rect.width*0.65) { toggleReaderUI(); return; }
  showReaderUI();
  if (relX>rect.width*0.65)      nextPage();
  else if (relX<rect.width*0.35) prevPage();
}

function toggleReadingMode() {
  reader.horizontal=!reader.horizontal;
  document.getElementById('modeBtn').textContent=reader.horizontal?'⇄':'⇅';
  renderReaderPage();
}

document.addEventListener('keydown', e => {
  if (novel.id) {
    if (e.key==='ArrowRight'||e.key==='ArrowDown') nextChapter();
    if (e.key==='ArrowLeft' ||e.key==='ArrowUp')   prevChapter();
    if (e.key==='Escape') closeNovel();
    return;
  }
  if (!reader.id) return;
  if (e.target.tagName==='INPUT') return;
  if (e.key==='ArrowRight'||e.key==='ArrowDown') nextPage();
  if (e.key==='ArrowLeft' ||e.key==='ArrowUp')   prevPage();
  if (e.key==='Escape') closeReader();
});

window.addEventListener('popstate', e => {
  if (window.MediaFeature?.isImageViewerOpen?.()) {
    window.MediaFeature.closeImageViewer(true);
    return;
  }
  if (window.MediaFeature?.isVideoViewerOpen?.()) {
    window.MediaFeature.closeVideoViewer(true);
    return;
  }
  if (reader.id) { closeReader(true); return; }
  if (novel.id)  { closeNovel(true);  return; }
  if (activeSeriesLib) {
    const shouldBackToSeriesView = returnToSeriesViewOnClear;
    activeSeriesLib = null;
    returnToSeriesViewOnClear = false;
    updateFilterUI();
    renderSidebar();
    loadLibrary({ resetPage: true });
    if (shouldBackToSeriesView) {
      showView('series', true);
      return;
    }
    showView('library', true);
    return;
  }
  const hasViewState = typeof e?.state?.view === 'string' && e.state.view.trim();
  if (hasViewState) {
    const targetView = normalizeView(e.state.view);
    if (targetView !== currentView) {
      showView(targetView, true);
    }
    return;
  }
  const targetView = normalizeView(e?.state?.view);
  if (targetView && targetView !== currentView) {
    showView(targetView, true);
    return;
  }
  showView('library', true);
});

/* ═══════════════════════════════════════════════════════════════
   小说阅读器
   ═══════════════════════════════════════════════════════════════ */
async function openNovel(id) {
  try {
    touchReadHistory('novel', id);
    if (sortBy === 'read_latest') {
      if (currentView === 'favorites') loadFavorites({ resetPage: false });
      else if (currentView === 'tags' && selectedTags.length) applyTagFilter();
      else if (currentView === 'library') loadLibrary({ resetPage: false });
    }
    showToast('加载中…','');
    const data  = await fetch('/api/novels/'+id).then(r=>r.json());
    const saved = getNovelProgress(id);
    const safeChapter = clampNovelChapterIndex(saved.chapter, data.chapterCount || 0);
    novel = {
      id,
      title: data.title,
      chapters: data.chapters||[],
      currentChapter: safeChapter,
      chapterCount: data.chapterCount,
      chapterCache: {},
      savedScrollRatio: saved.scrollRatio || 0
    };
    document.getElementById('novelReaderTitle').textContent = data.title;
    document.getElementById('novelModal').style.display='flex';
    document.getElementById('novelModal').classList.remove('ui-hidden');
    setNovelSettingsPanel(false);
    switchNovelProgressMode('book');
    toggleNovelPanel(false);
    novelUIVisible = true;
    document.body.style.overflow='hidden';
    history.pushState({ novel:true, id },'','');
    applyNovelSettings();
    renderChapterList();
    bindNovelScrollSave();
    await loadChapter(safeChapter);
    if (saved.chapter>0 || saved.scrollRatio>0) showToast(`从第 ${saved.chapter+1} 章继续阅读`,'');
    else showToast('','');
  } catch { showToast('打开失败','error'); }
}

function closeNovel(fromPopState=false) {
  if (novel.id) saveCurrentNovelProgress();
  clearTimeout(novelSaveScrollTimer);
  document.getElementById('novelModal').style.display='none';
  document.body.style.overflow='';
  setNovelSettingsPanel(false);
  toggleNovelPanel(false);
  novel.id=null;
  if (!fromPopState) history.back();
  if (selectedTags.length) applyTagFilter();
}

function renderChapterList() {
  const list=document.getElementById('chapterList');
  list.innerHTML=novel.chapters.map((ch,i)=>
    `<div class="chapter-item${i===novel.currentChapter?' active':''}" onclick="loadChapter(${i})">${esc(ch.title||'第'+(i+1)+'章')}</div>`
  ).join('');
}

async function getNovelChapterData(idx) {
  if (idx < 0 || idx >= novel.chapters.length) return null;
  if (!novel.chapterCache[idx]) {
    novel.chapterCache[idx] = await fetch(`/api/novels/${novel.id}/chapter/${idx}`).then(r=>r.json());
  }
  return novel.chapterCache[idx] || { title: `第${idx+1}章`, content: '' };
}

function renderNovelChapterBlock(ch, idx, withDivider = false) {
  const title = esc(ch.title || `第${idx + 1}章`);
  const paragraphs = (ch.content || '').split(/\n+/).filter(p=>p.trim());
  const html = paragraphs.map(p=>`<p>${esc(p.trim())}</p>`).join('');
  return `
    <section class="novel-chapter-block" data-idx="${idx}">
      ${withDivider ? '<div class="chapter-divider"></div>' : ''}
      <h2 class="chapter-title">${title}</h2>
      ${html}
    </section>`;
}

function updateNovelChapterUI(idx) {
  updateNovelProgressUI();
  document.querySelectorAll('.chapter-item').forEach((el,i)=>{
    el.classList.toggle('active',i===idx);
  });
  const activeItem=document.querySelector('.chapter-item.active');
  if (activeItem) activeItem.scrollIntoView({block:'nearest'});
}

async function appendNextChapterIfNeeded() {
  if (!novel.id || novelAutoAppending) return;
  const content = document.getElementById('novelContent');
  const lastIdx = Number(content.dataset.lastIdx || novel.currentChapter);
  const nextIdx = lastIdx + 1;
  if (nextIdx >= novel.chapterCount) return;

  novelAutoAppending = true;
  try {
    const ch = await getNovelChapterData(nextIdx);
    if (!ch) return;
    content.insertAdjacentHTML('beforeend', renderNovelChapterBlock(ch, nextIdx, true));
    content.dataset.lastIdx = String(nextIdx);
    novel.currentChapter = nextIdx;
    trimNovelRenderedChapters();
    updateNovelChapterUI(nextIdx);
    saveCurrentNovelProgress();
  } catch {}
  finally {
    novelAutoAppending = false;
  }
}

function trimNovelRenderedChapters() {
  const body = document.getElementById('novelBody');
  const content = document.getElementById('novelContent');
  if (!body || !content) return;
  const blocks = content.querySelectorAll('.novel-chapter-block');
  if (blocks.length <= NOVEL_MAX_RENDERED_CHAPTER_BLOCKS) return;

  const removeCount = blocks.length - NOVEL_MAX_RENDERED_CHAPTER_BLOCKS;
  let removedHeight = 0;
  for (let i = 0; i < removeCount; i += 1) {
    const block = blocks[i];
    removedHeight += block.offsetHeight;
    block.remove();
  }

  if (removedHeight > 0) body.scrollTop = Math.max(0, body.scrollTop - removedHeight);
}

async function loadChapter(idx) {
  const safeIdx = clampNovelChapterIndex(idx, novel.chapters.length);
  if (safeIdx<0||safeIdx>=novel.chapters.length) return;
  novel.currentChapter=safeIdx;
  const ch = await getNovelChapterData(safeIdx);
  const content = document.getElementById('novelContent');
  content.innerHTML = renderNovelChapterBlock(ch, safeIdx, false);
  content.dataset.lastIdx = String(safeIdx);

  // 滚到顶部
  const body = document.getElementById('novelBody');
  body.scrollTop=0;
  if (safeIdx === getNovelProgress(novel.id).chapter && novel.savedScrollRatio > 0) {
    const maxScroll = Math.max(body.scrollHeight - body.clientHeight, 0);
    body.scrollTop = Math.round(maxScroll * novel.savedScrollRatio);
  }
  updateNovelChapterUI(safeIdx);

  // 手机上加载章节后自动关闭侧边栏
  if (window.matchMedia('(max-width:720px)').matches && novelPanelOpen) toggleNovelPanel(false);
  saveCurrentNovelProgress();
}

function nextChapter() { loadChapter(novel.currentChapter+1); }
function prevChapter() { loadChapter(novel.currentChapter-1); }

function toggleNovelPanel(forceOpen = null) {
  novelPanelOpen = typeof forceOpen === 'boolean' ? forceOpen : !novelPanelOpen;
  document.getElementById('novelSidebar').classList.toggle('open', novelPanelOpen);
  document.getElementById('chapterPanelBtn').classList.toggle('active', novelPanelOpen);
}

function setNovelSettingsPanel(open) {
  novelSettingsPanelOpen = !!open;
  const bar = document.getElementById('novelSettingsBar');
  const btn = document.getElementById('novelSettingsBtn');
  if (bar) bar.style.display = novelSettingsPanelOpen ? 'flex' : 'none';
  if (btn) btn.classList.toggle('active', novelSettingsPanelOpen);
}

function toggleNovelSettingsPanel() {
  setNovelSettingsPanel(!novelSettingsPanelOpen);
}

function getNovelChapterScrollPercent() {
  const body = document.getElementById('novelBody');
  if (!body) return 0;
  const maxScroll = Math.max(body.scrollHeight - body.clientHeight, 0);
  if (!maxScroll) return 0;
  return Math.max(0, Math.min(100, Math.round((body.scrollTop / maxScroll) * 100)));
}

function updateNovelProgressUI(previewValue = null) {
  const range = document.getElementById('novelProgressRange');
  const label = document.getElementById('novelProgressLabel');
  if (!range || !label || !novel.id) return;

  const count = Math.max(1, Number(novel.chapterCount || novel.chapters?.length || 1));
  if (novelProgressMode === 'chapter') {
    const value = previewValue == null ? getNovelChapterScrollPercent() : Math.max(0, Math.min(100, Math.round(Number(previewValue) || 0)));
    range.min = '0';
    range.max = '100';
    range.step = '1';
    range.value = String(value);
    label.textContent = `第 ${novel.currentChapter + 1} 章 ${value}%`;
  } else {
    const value = previewValue == null
      ? Math.max(1, Math.min(count, novel.currentChapter + 1))
      : Math.max(1, Math.min(count, Math.round(Number(previewValue) || 1)));
    range.min = '1';
    range.max = String(count);
    range.step = '1';
    range.value = String(value);
    label.textContent = `${value} / ${count} 章`;
  }

  document.getElementById('bookProgressTab')?.classList.toggle('active', novelProgressMode === 'book');
  document.getElementById('chapterProgressTab')?.classList.toggle('active', novelProgressMode === 'chapter');
}

function switchNovelProgressMode(mode) {
  novelProgressMode = mode === 'chapter' ? 'chapter' : 'book';
  updateNovelProgressUI();
}

function handleNovelProgressInput(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (novelProgressMode === 'chapter') {
    const body = document.getElementById('novelBody');
    if (!body) return;
    const maxScroll = Math.max(body.scrollHeight - body.clientHeight, 0);
    body.scrollTop = maxScroll * (Math.max(0, Math.min(100, value)) / 100);
    updateNovelProgressUI(value);
    return;
  }
  updateNovelProgressUI(value);
}

function handleNovelProgressChange(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (novelProgressMode === 'chapter') {
    updateNovelProgressUI(value);
    saveCurrentNovelProgress();
    return;
  }
  loadChapter(Math.max(0, Math.round(value) - 1));
}

function openNovelEdit() {
  if (!novel.id) return;
  openEdit(null, novel.id, 'novel');
}

function renameNovelTitle() {
  openNovelEdit();
}

// 设置
function loadNovelSettings() {
  try { const s=JSON.parse(localStorage.getItem('novel_settings')||'{}'); Object.assign(novelSettings,s); } catch {}
}
function saveNovelSettingsLocal() { localStorage.setItem('novel_settings',JSON.stringify(novelSettings)); }
function applyNovelSettings() {
  const body=document.getElementById('novelBody');
  if (!body) return;
  body.style.fontSize    = novelSettings.fontSize+'px';
  body.style.lineHeight  = novelSettings.lineHeight;
  body.style.background  = novelSettings.bg;
  body.style.color       = novelSettings.color;
  body.style.fontFamily  = novelSettings.fontFamily;
  document.getElementById('fontSizeLabel').textContent   = novelSettings.fontSize;
  document.getElementById('lineHeightLabel').textContent = novelSettings.lineHeight.toFixed(1);
  const ff = document.getElementById('fontFamilySelect');
  if (ff) ff.value = novelSettings.fontFamily;
}
function changeFontSize(d) {
  novelSettings.fontSize = Math.max(12, Math.min(28, novelSettings.fontSize+d));
  applyNovelSettings(); saveNovelSettingsLocal();
}
function changeLineHeight(d) {
  novelSettings.lineHeight = parseFloat(Math.max(1.2,Math.min(3.0,novelSettings.lineHeight+d)).toFixed(1));
  applyNovelSettings(); saveNovelSettingsLocal();
}
function setBg(bg, color, el) {
  novelSettings.bg=bg; novelSettings.color=color;
  applyNovelSettings(); saveNovelSettingsLocal();
  document.querySelectorAll('.bg-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

function changeFontFamily(v) {
  novelSettings.fontFamily = v;
  applyNovelSettings();
  saveNovelSettingsLocal();
}

function saveCurrentNovelProgress() {
  if (!novel.id) return;
  const body = document.getElementById('novelBody');
  if (!body) return;
  const maxScroll = Math.max(body.scrollHeight - body.clientHeight, 0);
  const scrollRatio = maxScroll ? (body.scrollTop / maxScroll) : 0;
  saveNovelProgress(novel.id, {
    chapter: clampNovelChapterIndex(novel.currentChapter, novel.chapterCount),
    scrollRatio
  });
}

function bindNovelScrollSave() {
  const body = document.getElementById('novelBody');
  if (!body) return;
  body.onscroll = () => {
    const nearBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 140;
    if (nearBottom) appendNextChapterIfNeeded();
    if (novelProgressMode === 'chapter') updateNovelProgressUI();
    clearTimeout(novelSaveScrollTimer);
    novelSaveScrollTimer = setTimeout(() => saveCurrentNovelProgress(), 180);
  };
}

function toggleNovelUI() {
  novelUIVisible = !novelUIVisible;
  document.getElementById('novelModal').classList.toggle('ui-hidden', !novelUIVisible);
}

function handleNovelBodyClick(e) {
  if (window.matchMedia('(max-width:720px)').matches && novelPanelOpen) {
    toggleNovelPanel(false);
    return;
  }
  if (e.target.closest('.novel-nav') || e.target.closest('.chapter-item') || e.target.closest('button') || e.target.closest('a')) return;
  toggleNovelUI();
}

/* ═══════════════════════════════════════════════════════════════
   删除 & 编辑
   ═══════════════════════════════════════════════════════════════ */
async function deleteItem(e, id, type, options = {}) {
  if (e) e.stopPropagation();
  if (options.preventDefault && e?.preventDefault) e.preventDefault();
  if (options.skipConfirm !== true && !confirm('确定删除？')) return false;
  const url = type === 'manga'
    ? '/api/mangas/' + id
    : type === 'novel'
      ? '/api/novels/' + id
      : type === 'image'
        ? '/api/images/' + id
        : '/api/videos/' + id;
  try {
    const resp = await fetch(url,{method:'DELETE'});
    if (!resp.ok) throw new Error('删除失败');
    invalidateTagSourceCache(type);
    (exportSelected[type] || exportSelected.manga).delete(id);
    updateBatchExportUI();
    showToast('已删除','success');
    if (currentView === 'favorites') await loadFavorites({ resetPage: false });
    else if (currentView === 'images') await loadImages();
    else if (currentView === 'videos') await loadVideos();
    else await loadLibrary();
    await loadMeta();
    if (currentView === 'duplicates' && currentType === 'manga') await loadDuplicateWorkspace({ keepPage: true });
    if (selectedTags.length) applyTagFilter();
    return true;
  } catch {
    showToast('删除失败','error');
    return false;
  }
}

async function deleteCurrentEditItem() {
  const id = String(document.getElementById('editId')?.value || '').trim();
  const type = String(document.getElementById('editType')?.value || '').trim();
  if (!id || !type) return;
  if (!confirm('确定删除当前内容吗？该操作不可撤销。')) return;
  const ok = await deleteItem(null, id, type, { skipConfirm: true });
  if (ok) closeEdit();
}

function openEdit(e, id, type) {
  if (e) e.stopPropagation();
  const item = [...allItems, ...tagItems, ...duplicateItems, ...favoriteItems, ...imageItems, ...videoItems].find(x=>x.id===id);
  if (!item) return;
  document.getElementById('editId').value    = id;
  document.getElementById('editType').value  = type;
  document.getElementById('editTitle').value  = item.title;
  document.getElementById('editAuthor').value = item.author||'';
  const ratingWrap = document.getElementById('editRatingWrap');
  ratingWrap.style.display = (type === 'manga' || type === 'novel' || type === 'video') ? '' : 'none';
  renderEditRating(item.rating || 0);
  editTags=[...(item.tags||[])];
  renderEditTags();
  const favoriteInput = document.getElementById('editFavoriteCategory');
  if (favoriteInput) favoriteInput.value = String(item.favoriteCategory || '').trim();
  updateEditFavoriteButton();
  const seriesWrap = document.getElementById('editSeriesWrap');
  const seriesNameInput = document.getElementById('editSeriesName');
  const removeSeriesFlag = document.getElementById('editRemoveSeriesFlag');
  const videoSeriesWrap = document.getElementById('editVideoSeriesWrap');
  const videoSeriesNameInput = document.getElementById('editVideoSeriesName');
  const videoEpisodeWrap = document.getElementById('editVideoEpisodeWrap');
  const videoEpisodeInput = document.getElementById('editVideoEpisodeNo');
  const videoCoverWrap = document.getElementById('editVideoCoverWrap');
  const videoCoverSource = document.getElementById('editVideoCoverSource');
  const videoCoverPreview = document.getElementById('editVideoCoverPreview');
  const videoCoverHint = document.getElementById('editVideoCoverHint');
  const hasSeries = type === 'manga' && !!String(item.seriesName || '').trim();
  if (seriesWrap) seriesWrap.style.display = hasSeries ? '' : 'none';
  if (seriesNameInput) seriesNameInput.value = hasSeries ? String(item.seriesName || '').trim() : '';
  if (removeSeriesFlag) removeSeriesFlag.value = '0';
  if (videoSeriesWrap) videoSeriesWrap.style.display = type === 'video' ? '' : 'none';
  if (videoEpisodeWrap) videoEpisodeWrap.style.display = type === 'video' ? '' : 'none';
  if (videoSeriesNameInput) videoSeriesNameInput.value = type === 'video' ? String(item.seriesName || '').trim() : '';
  if (videoEpisodeInput) {
    const episodeNo = Number(item.episodeNo);
    videoEpisodeInput.value = type === 'video' && Number.isFinite(episodeNo) && episodeNo > 0
      ? String(Math.floor(episodeNo))
      : '';
  }
  if (videoCoverWrap) videoCoverWrap.style.display = type === 'video' ? '' : 'none';
  editVideoCoverDirty = false;
  editVideoCoverValue = type === 'video' ? String(item.cover || item.poster || '').trim() : '';
  editVideoSourceUrl = type === 'video' ? String(item.url || '').trim() : '';
  if (videoCoverSource) {
    videoCoverSource.pause();
    videoCoverSource.src = type === 'video' ? editVideoSourceUrl : '';
    if (type === 'video' && editVideoSourceUrl) {
      videoCoverSource.load();
      videoCoverSource.currentTime = 0;
    }
  }
  if (videoCoverPreview) {
    videoCoverPreview.src = editVideoCoverValue || VIDEO_FALLBACK_POSTER;
  }
  if (videoCoverHint) {
    videoCoverHint.textContent = editVideoCoverValue
      ? '当前已设置封面，拖动上方视频到目标位置后可重新取帧覆盖。'
      : '拖动上方视频进度条后点击“使用当前帧作为封面”。';
  }
  updateEditSeriesRemoveButton();
  document.getElementById('editModal').style.display='flex';
}
function clearEditField(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.value = '';
  input.focus();
}
function closeEdit() {
  document.getElementById('editModal').style.display='none';
  editTags=[];
  const favoriteInput = document.getElementById('editFavoriteCategory');
  if (favoriteInput) favoriteInput.value = '';
  updateEditFavoriteButton();
  const seriesWrap = document.getElementById('editSeriesWrap');
  const seriesNameInput = document.getElementById('editSeriesName');
  const removeSeriesFlag = document.getElementById('editRemoveSeriesFlag');
  const videoSeriesWrap = document.getElementById('editVideoSeriesWrap');
  const videoSeriesNameInput = document.getElementById('editVideoSeriesName');
  const videoEpisodeWrap = document.getElementById('editVideoEpisodeWrap');
  const videoEpisodeInput = document.getElementById('editVideoEpisodeNo');
  const videoCoverWrap = document.getElementById('editVideoCoverWrap');
  const videoCoverSource = document.getElementById('editVideoCoverSource');
  const videoCoverPreview = document.getElementById('editVideoCoverPreview');
  const videoCoverHint = document.getElementById('editVideoCoverHint');
  if (seriesWrap) seriesWrap.style.display = 'none';
  if (seriesNameInput) seriesNameInput.value = '';
  if (removeSeriesFlag) removeSeriesFlag.value = '0';
  if (videoSeriesWrap) videoSeriesWrap.style.display = 'none';
  if (videoSeriesNameInput) videoSeriesNameInput.value = '';
  if (videoEpisodeWrap) videoEpisodeWrap.style.display = 'none';
  if (videoEpisodeInput) videoEpisodeInput.value = '';
  if (videoCoverWrap) videoCoverWrap.style.display = 'none';
  if (videoCoverSource) {
    videoCoverSource.pause();
    videoCoverSource.removeAttribute('src');
    try { videoCoverSource.load(); } catch {}
  }
  if (videoCoverPreview) videoCoverPreview.src = '';
  if (videoCoverHint) videoCoverHint.textContent = '拖动上方视频进度条后点击“使用当前帧作为封面”。';
  editVideoCoverValue = '';
  editVideoCoverDirty = false;
  editVideoSourceUrl = '';
  updateEditSeriesRemoveButton();
}

function captureEditVideoCoverFrame() {
  const type = String(document.getElementById('editType')?.value || '').trim();
  if (type !== 'video') return;
  const videoEl = document.getElementById('editVideoCoverSource');
  const previewEl = document.getElementById('editVideoCoverPreview');
  const hintEl = document.getElementById('editVideoCoverHint');
  if (!videoEl || !previewEl) return;
  if (videoEl.readyState < 2 || !Number(videoEl.videoWidth || 0) || !Number(videoEl.videoHeight || 0)) {
    showToast('视频尚未可截图，请稍后再试', 'error');
    return;
  }

  const sourceWidth = Math.max(2, Number(videoEl.videoWidth || 0));
  const sourceHeight = Math.max(2, Number(videoEl.videoHeight || 0));
  const maxWidth = 960;
  const scale = sourceWidth > maxWidth ? (maxWidth / sourceWidth) : 1;
  const targetWidth = Math.max(2, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(2, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast('截图失败，请重试', 'error');
    return;
  }

  try {
    ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (!String(dataUrl || '').startsWith('data:image/')) {
      showToast('截图失败，请重试', 'error');
      return;
    }
    editVideoCoverValue = dataUrl;
    editVideoCoverDirty = true;
    previewEl.src = dataUrl;
    if (hintEl) hintEl.textContent = '已使用当前帧作为封面，点击“保存”生效。';
    showToast('已选中当前帧作为封面', 'success');
  } catch {
    showToast('截图失败，请重试', 'error');
  }
}

function clearEditVideoCover() {
  const type = String(document.getElementById('editType')?.value || '').trim();
  if (type !== 'video') return;
  const previewEl = document.getElementById('editVideoCoverPreview');
  const hintEl = document.getElementById('editVideoCoverHint');
  editVideoCoverValue = '';
  editVideoCoverDirty = true;
  if (previewEl) previewEl.src = VIDEO_FALLBACK_POSTER;
  if (hintEl) hintEl.textContent = '已清空封面，点击“保存”生效。';
  showToast('已清空封面', '');
}
function renderEditTags() {
  document.getElementById('editTagBadges').innerHTML = editTags.map((t,i)=>
    `<span class="tag-badge">${esc(t)}<span class="rm" onclick="removeEditTag(${i})">×</span></span>`
  ).join('');
}
function removeEditTag(idx) { editTags.splice(idx,1); renderEditTags(); }
function handleEditTagInput(e) {
  const val=e.target.value.trim(), sugg=document.getElementById('editTagSuggestions');
  if (e.type==='keydown') {
    if (e.key!=='Enter') return; e.preventDefault();
    if (val&&!editTags.includes(val)){editTags.push(val);renderEditTags();}
    e.target.value=''; sugg.classList.remove('open'); return;
  }
  const q=val.toLowerCase(), matches=allTags.filter(t=>t.toLowerCase().includes(q)&&!editTags.includes(t));
  if (!q||!matches.length){sugg.classList.remove('open');return;}
  sugg.innerHTML=matches.slice(0,6).map(t=>`<div class="suggestion-item" onclick="addEditTagFromSug('${esc(t)}')">${esc(t)}</div>`).join('');
  sugg.classList.add('open');
}
function addEditTagFromSug(tag){if(!editTags.includes(tag)){editTags.push(tag);renderEditTags();}document.getElementById('editTagInput').value='';document.getElementById('editTagSuggestions').classList.remove('open');}
function addEditTagFromInput(){const input=document.getElementById('editTagInput');const val=input.value.trim();if(val&&!editTags.includes(val)){editTags.push(val);renderEditTags();}input.value='';document.getElementById('editTagSuggestions').classList.remove('open');}
function renderEditRating(value) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const editor = document.getElementById('editRatingEditor');
  editor.dataset.value = String(v);
  editor.innerHTML = Array.from({ length: 5 }).map((_, i) => {
    const n = i + 1;
    return `<button class="star-btn${n<=v?' active':''}" onclick="setEditRating(${n})">★</button>`;
  }).join('');
}
function setEditRating(v) { renderEditRating(v); }

function syncItemLocalState(id, type, patch = {}) {
  const targetType = type === 'novel'
    ? 'novel'
    : type === 'image'
      ? 'image'
      : type === 'video'
        ? 'video'
        : 'manga';
  const apply = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach(item => {
      if (!item || item.id !== id) return;
      const itemType = item.type === 'novel'
        ? 'novel'
        : item.type === 'image'
          ? 'image'
          : item.type === 'video'
            ? 'video'
            : 'manga';
      if (itemType !== targetType) return;
      Object.assign(item, patch);
    });
  };
  apply(allItems);
  apply(tagItems);
  apply(duplicateItems);
  apply(duplicateIgnoredItems);
  apply(favoriteItems);
  apply(imageItems);
  apply(videoItems);
}

async function saveEdit() {
  const id=document.getElementById('editId').value, type=document.getElementById('editType').value;
  const title=document.getElementById('editTitle').value.trim(), author=document.getElementById('editAuthor').value.trim();
  const favoriteCategory = document.getElementById('editFavoriteCategory')?.value.trim() || '';
  const removeFromSeries = type === 'manga' && document.getElementById('editRemoveSeriesFlag')?.value === '1';
  const videoSeriesName = String(document.getElementById('editVideoSeriesName')?.value || '').trim();
  const videoEpisodeRaw = String(document.getElementById('editVideoEpisodeNo')?.value || '').trim();
  const videoEpisodeNo = videoEpisodeRaw ? Number(videoEpisodeRaw) : null;
  if (!title){showToast('标题不能为空','error');return;}
  const url = type === 'manga'
    ? '/api/mangas/' + id
    : type === 'novel'
      ? '/api/novels/' + id
      : type === 'image'
        ? '/api/images/' + id
        : '/api/videos/' + id;
  const rating = Number(document.getElementById('editRatingEditor').dataset.value || 0);
  const payload = (type === 'manga' || type === 'novel' || type === 'video')
    ? {
      title,
      author,
      tags: editTags,
      rating,
      favoriteCategory,
      ...(type === 'manga' ? { removeFromSeries } : {}),
      ...(type === 'video'
        ? {
          seriesName: videoSeriesName,
          seriesId: videoSeriesName,
          episodeNo: Number.isFinite(videoEpisodeNo) && videoEpisodeNo > 0 ? Math.floor(videoEpisodeNo) : null,
          ...(editVideoCoverDirty ? { cover: editVideoCoverValue } : {})
        }
        : {})
    }
    : { title, tags: editTags, favoriteCategory };
  try {
    await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    syncItemLocalState(id, type, {
      ...payload,
      ...(removeFromSeries ? { seriesId: '', seriesName: '', seriesCreatedAt: '', chapterNo: null } : {})
    });
    invalidateTagSourceCache(type);
    showToast('已保存','success'); closeEdit();
    if (currentView === 'favorites') await loadFavorites({ resetPage: false });
    else if (currentView === 'images') await loadImages();
    else if (currentView === 'videos') await loadVideos();
    else await loadLibrary();
    await loadMeta();
    if (currentView === 'duplicates' && currentType === 'manga') await loadDuplicateWorkspace({ keepPage: true });
    if (selectedTags.length) applyTagFilter();
  } catch {showToast('保存失败','error');}
}

/* ═══════════════════════════════════════════════════════════════
   上传
   ═══════════════════════════════════════════════════════════════ */
let currentUploadType = 'manga';
function switchUploadType(type) {
  currentUploadType = normalizeUploadType(type);
  document.getElementById('utabManga').classList.toggle('active', currentUploadType === 'manga');
  document.getElementById('utabNovel').classList.toggle('active', currentUploadType === 'novel');
  document.getElementById('utabImage').classList.toggle('active', currentUploadType === 'image');
  document.getElementById('utabVideo').classList.toggle('active', currentUploadType === 'video');
  document.getElementById('uploadMangaForm').style.display  = currentUploadType === 'manga' ? '' : 'none';
  document.getElementById('uploadNovelForm').style.display  = currentUploadType === 'novel' ? '' : 'none';
  document.getElementById('uploadImageForm').style.display  = currentUploadType === 'image' ? '' : 'none';
  document.getElementById('uploadVideoForm').style.display  = currentUploadType === 'video' ? '' : 'none';
  saveLibraryViewState();
}

function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function openFilePicker(type) {
  const inputMap = {
    manga: 'fileInput',
    novel: 'novelFileInput',
    image: 'imageFileInput',
    video: 'videoFileInput'
  };
  const inputId = inputMap[type] || 'fileInput';
  document.getElementById(inputId).click();
}

function handleDrop(e,type){
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files || []);
  if(files.length) setFiles(files,type);
}
function handleFileSelect(e,type){
  const files = Array.from(e.target.files || []);
  if(files.length) setFiles(files,type);
  e.target.value = '';
}

function parseFilename(filename) {
  const n = filename.replace(/\.(zip|cbz|cbr|rar|txt|epub|jpg|jpeg|png|gif|webp|bmp|avif|svg|mp4|webm|mov|m4v|avi|mkv)$/i,'').trim();
  const pairMap = {
    '[': ']',
    '【': '】',
    '(': ')',
    '（': '）',
    '［': '］'
  };
  const first = n.charAt(0);
  const close = pairMap[first];
  if (close) {
    const closeIdx = n.indexOf(close, 1);
    if (closeIdx > 1) {
      const author = n.slice(1, closeIdx).trim();
      const title = n.slice(closeIdx + 1).trim();
      if (author && title) return { author, title };
    }
  }
  const m = n.match(/^[\[（【(]([\s\S]+?)[\]）】)]\s*(.+)$/);
  if (m) return { author: m[1].trim(), title: m[2].trim() };
  return { author:'', title:n };
}

function fileTitleFromName(filename) {
  return String(filename || '').replace(/\.(zip|cbz|cbr|rar|txt|epub|jpg|jpeg|png|gif|webp|bmp|avif|svg|mp4|webm|mov|m4v|avi|mkv)$/i, '').trim();
}

function updateSelectedFileInfo(type) {
  const filesByType = {
    manga: selectedFileManga,
    novel: selectedFileNovel,
    image: selectedFileImage,
    video: selectedFileVideo
  };
  const infoIdByType = {
    manga: 'fileInfo',
    novel: 'novelFileInfo',
    image: 'imageFileInfo',
    video: 'videoFileInfo'
  };
  const btnIdByType = {
    manga: 'uploadBtn',
    novel: 'novelUploadBtn',
    image: 'imageUploadBtn',
    video: 'videoUploadBtn'
  };
  const iconByType = { manga: '📦', novel: '📝', image: '🖼', video: '🎬' };
  const files = filesByType[type] || [];
  const infoId = infoIdByType[type] || 'fileInfo';
  const btnId = btnIdByType[type] || 'uploadBtn';
  const infoEl = document.getElementById(infoId);
  if (!files.length) {
    infoEl.style.display = 'none';
    document.getElementById(btnId).disabled = true;
    return;
  }

  const file = files[0];
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
  const parsed = parseFilename(file.name);
  const author = parsed.author;
  const hint=(type==='manga'&&files.length===1&&author)?`<span class="parse-hint">✓ 已自动识别作者：<strong>${esc(author)}</strong></span>`:'';
  const mangaMultiHint = (type === 'manga' && files.length > 1)
    ? `<span class="parse-hint">✓ 已选择 <strong>${files.length}</strong> 个文件，将按文件名自动生成标题并逐个导入</span>`
    : '';
  const novelMultiHint = (type === 'novel' && files.length > 1)
    ? `<span class="parse-hint">✓ 已选择 <strong>${files.length}</strong> 个文件，将按文件名自动生成标题并逐个导入</span>`
    : '';
  const imageMultiHint = (type === 'image' && files.length > 1)
    ? `<span class="parse-hint">✓ 已选择 <strong>${files.length}</strong> 张图片，将按文件名自动生成标题并逐个导入</span>`
    : '';
  const videoMultiHint = (type === 'video' && files.length > 1)
    ? `<span class="parse-hint">✓ 已选择 <strong>${files.length}</strong> 个视频，将按文件名自动生成标题并逐个导入</span>`
    : '';
  const nameLine = files.length > 1
    ? `已选择文件：${esc(file.name)} 等 ${files.length} 个文件`
    : `已选择文件：${esc(file.name)}`;
  const sizeText = files.length > 1
    ? `总计 ${formatSize(totalSize)}`
    : formatSize(file.size || 0);
  const infoHtml=`<span class="file-info-icon">${iconByType[type] || '📁'}</span>
    <div style="flex:1;min-width:0">
      <div class="file-info-name">${nameLine}</div>
      ${hint || mangaMultiHint || novelMultiHint || imageMultiHint || videoMultiHint}
    </div>
    <span class="file-info-size">${sizeText}</span>`;
  infoEl.style.display = 'flex';
  infoEl.innerHTML = infoHtml;
  document.getElementById(btnId).disabled = false;
}

function setFiles(files,type){
  const validFiles = Array.from(files || []);
  const file = validFiles[0];
  if (!file) return;
  const parsed = parseFilename(file.name);
  const author = parsed.author;
  const parsedTitle = parsed.title;
  const rawTitle = fileTitleFromName(file.name);
  if (type==='manga'){
    selectedFileManga = validFiles;
    if (validFiles.length === 1) {
      document.getElementById('titleInput').value=parsedTitle;
      document.getElementById('authorInput').value=author;
    } else {
      document.getElementById('titleInput').value='';
    }
  } else if (type === 'novel') {
    selectedFileNovel = validFiles;
    if (validFiles.length === 1) {
      document.getElementById('novelTitleInput').value=rawTitle;
      document.getElementById('novelAuthorInput').value='';
    } else {
      document.getElementById('novelTitleInput').value='';
    }
  } else if (type === 'image') {
    selectedFileImage = validFiles;
    if (validFiles.length === 1) {
      document.getElementById('imageTitleInput').value = rawTitle;
    } else {
      document.getElementById('imageTitleInput').value = '';
    }
  } else if (type === 'video') {
    selectedFileVideo = validFiles;
    if (validFiles.length === 1) {
      document.getElementById('videoTitleInput').value = rawTitle;
    } else {
      document.getElementById('videoTitleInput').value = '';
    }
  }
  updateSelectedFileInfo(type);
}

function formatSize(b){ if(b>=1e9)return(b/1e9).toFixed(2)+' GB'; if(b>=1e6)return(b/1e6).toFixed(1)+' MB'; return(b/1e3).toFixed(0)+' KB'; }

function handleTagInput(e,type){
  if(e.key!=='Enter')return; e.preventDefault();
  const input=type==='manga'?document.getElementById('tagInput'):document.getElementById('novelTagInput');
  const tags=type==='manga'?uploadTagsManga:uploadTagsNovel;
  const val=input.value.trim();
  if(val&&!tags.includes(val)){tags.push(val);renderUploadTags(type);}
  input.value='';
  const suggId=type==='manga'?'tagSuggestions':'novelTagSuggestions';
  document.getElementById(suggId).classList.remove('open');
}
function handleTagInputSug(e,type){
  const val=e.target.value.toLowerCase();
  const suggId=type==='manga'?'tagSuggestions':'novelTagSuggestions';
  const list=document.getElementById(suggId);
  const tags=type==='manga'?uploadTagsManga:uploadTagsNovel;
  const matches=allTags.filter(t=>t.toLowerCase().includes(val)&&!tags.includes(t));
  if(!val||!matches.length){list.classList.remove('open');return;}
  list.innerHTML=matches.slice(0,6).map(t=>`<div class="suggestion-item" onclick="addUploadTagFromSug('${esc(t)}','${type}')">${esc(t)}</div>`).join('');
  list.classList.add('open');
}
function addUploadTagFromSug(tag,type){
  const tags=type==='manga'?uploadTagsManga:uploadTagsNovel;
  if(!tags.includes(tag)){tags.push(tag);renderUploadTags(type);}
  const inputId=type==='manga'?'tagInput':'novelTagInput';
  const suggId=type==='manga'?'tagSuggestions':'novelTagSuggestions';
  document.getElementById(inputId).value='';
  document.getElementById(suggId).classList.remove('open');
}
function renderUploadTags(type){
  const badgeId=type==='manga'?'tagBadges':'novelTagBadges';
  const tags=type==='manga'?uploadTagsManga:uploadTagsNovel;
  document.getElementById(badgeId).innerHTML=tags.map((t,i)=>
    `<span class="tag-badge">${esc(t)}<span class="rm" onclick="removeUploadTag(${i},'${type}')">×</span></span>`
  ).join('');
}
function removeUploadTag(idx,type){
  if(type==='manga')uploadTagsManga.splice(idx,1); else uploadTagsNovel.splice(idx,1);
  renderUploadTags(type);
}

function setupAuthorSuggestions(){
  [['authorInput','authorSuggestions'],['novelAuthorInput','novelAuthorSugg']].forEach(([inId,suId])=>{
    const inp=document.getElementById(inId), list=document.getElementById(suId);
    if(!inp||!list)return;
    inp.addEventListener('input',()=>{
      const q=inp.value.toLowerCase(), m=allAuthors.filter(a=>a.toLowerCase().includes(q));
      if(!q||!m.length){list.classList.remove('open');return;}
      list.innerHTML=m.slice(0,6).map(a=>`<div class="suggestion-item" onclick="selectAuthor('${esc(a)}','${inId}','${suId}')">${esc(a)}</div>`).join('');
      list.classList.add('open');
    });
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('#authorInput')&&!e.target.closest('#authorSuggestions')) document.getElementById('authorSuggestions').classList.remove('open');
    if(!e.target.closest('#novelAuthorInput')&&!e.target.closest('#novelAuthorSugg')) document.getElementById('novelAuthorSugg').classList.remove('open');
  });
}
function selectAuthor(name,inId,suId){ document.getElementById(inId).value=name; document.getElementById(suId).classList.remove('open'); }

async function rollbackUploadedItems(type, uploadedIds) {
  const ids = Array.from(new Set((uploadedIds || []).filter(Boolean)));
  if (!ids.length) return { rolledBack: 0, failed: 0 };
  const endpointBase = type === 'manga'
    ? '/api/mangas/'
    : type === 'novel'
      ? '/api/novels/'
      : type === 'image'
        ? '/api/images/'
        : '/api/videos/';
  const tasks = ids.map(id => fetch(endpointBase + encodeURIComponent(id), { method: 'DELETE' }));
  const results = await Promise.allSettled(tasks);
  const rolledBack = results.filter(r => r.status === 'fulfilled' && r.value && r.value.ok).length;
  const failed = ids.length - rolledBack;
  return { rolledBack, failed };
}

async function startUpload(type){
  const filesByType = {
    manga: selectedFileManga,
    novel: selectedFileNovel,
    image: selectedFileImage,
    video: selectedFileVideo
  };
  const fieldByType = {
    manga: { titleId: 'titleInput', authorId: 'authorInput', progArea: 'progressArea', progText: 'progressText', progPct: 'progressPercent', progFill: 'progressFill', btnId: 'uploadBtn', tags: uploadTagsManga, url: '/api/upload', itemKey: 'manga', typeLabel: '漫画' },
    novel: { titleId: 'novelTitleInput', authorId: 'novelAuthorInput', progArea: 'novelProgressArea', progText: 'novelProgressText', progPct: 'novelProgressPercent', progFill: 'novelProgressFill', btnId: 'novelUploadBtn', tags: uploadTagsNovel, url: '/api/novels/upload', itemKey: 'novel', typeLabel: '小说' }
  };
  const mediaPreset = window.MediaFeature?.getUploadPreset?.(type);
  const cfg = mediaPreset || fieldByType[type] || fieldByType.manga;
  const files = filesByType[type] || [];
  if (!files || !files.length) return;
  const file = files[0];
  const title  = document.getElementById(cfg.titleId)?.value.trim() || '';
  const author = cfg.authorId ? (document.getElementById(cfg.authorId)?.value.trim() || '') : '';
  if (files.length === 1 && !title){showToast('请填写标题','error');return;}

  const btn=document.getElementById(cfg.btnId);
  btn.disabled=true;
  document.getElementById(cfg.progArea).style.display='';

  const url = cfg.url;
  const uploadedIds = [];

  try {
    if (files.length > 1) {
      const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0) || 1;
      let uploadedBytes = 0;
      for (let i = 0; i < files.length; i += 1) {
        const currentFile = files[i];
        const parsed = parseFilename(currentFile.name);
        const currentTitle = (parsed.title || fileTitleFromName(currentFile.name) || `${cfg.typeLabel}${i + 1}`);
        const currentAuthor = parsed.author || author;
        const uploadResult = await uploadSingleFile({
          url,
          file: currentFile,
          title: currentTitle,
          author: currentAuthor,
          tags: cfg.tags,
          onProgress: (e) => {
            if(!e.lengthComputable) return;
            const currentLoaded = Math.min(e.loaded, currentFile.size || e.loaded || 0);
            const pct=Math.round(((uploadedBytes + currentLoaded) / totalBytes) * 100);
            setProgress(
              pct,
              `上传中（${i + 1}/${files.length}）${currentFile.name}`,
              cfg.progText,
              cfg.progPct,
              cfg.progFill
            );
          }
        });
        const uploadedItem = uploadResult?.[cfg.itemKey];
        if (uploadedItem?.id) uploadedIds.push(uploadedItem.id);
        uploadedBytes += (currentFile.size || 0);
      }
    } else {
      const singleResult = await uploadSingleFile({
        url,
        file,
        title,
        author,
        tags: cfg.tags,
        onProgress: (e) => {
          if(!e.lengthComputable)return;
          const pct=Math.round(e.loaded/e.total*100);
          setProgress(pct,`上传中 ${file.name}`,cfg.progText,cfg.progPct,cfg.progFill);
        }
      });
      const uploadedItem = singleResult?.[cfg.itemKey];
      if (uploadedItem?.id) uploadedIds.push(uploadedItem.id);
    }
  } catch (err) {
    const failedFileName = err.fileName || file.name || '未知文件';
    setProgress(0,`上传失败：${failedFileName}`,cfg.progText,cfg.progPct,cfg.progFill);
    let message = err.message || `上传失败：${failedFileName}`;
    if (files.length > 1 && uploadedIds.length > 0) {
      setProgress(0,'检测到异常，正在回滚本次已上传内容…',cfg.progText,cfg.progPct,cfg.progFill);
      try {
        const rb = await rollbackUploadedItems(type, uploadedIds);
        if (rb.failed > 0) {
          message = `${message}；已回滚 ${rb.rolledBack} 个，另有 ${rb.failed} 个回滚失败`;
        } else {
          message = `${message}；本次已上传内容已回滚删除`;
        }
      } catch {
        message = `${message}；回滚删除失败，请手动检查书库`;
      }
    }
    showToast(message,'error');
    btn.disabled=false;
    return;
  }

  setProgress(100,'上传成功！',cfg.progText,cfg.progPct,cfg.progFill);
  showToast('上传成功','success');
  if (type === 'manga' || type === 'novel') invalidateTagSourceCache(type);
  setTimeout(() => {
    resetUploadForm(type);
    if (type === 'image') {
      showView('images');
      loadImages();
      return;
    }
    if (type === 'video') {
      showView('videos');
      loadVideos();
      return;
    }
    showView('library');
    switchType(type);
  }, 800);
}

function uploadSingleFile({ url, file, title, author, tags, onProgress }) {
  return new Promise((resolve, reject) => {
    const fd=new FormData();
    fd.append('file',file);
    fd.append('title',title);
    fd.append('author',author);
    fd.append('tags',JSON.stringify(tags));

    const xhr=new XMLHttpRequest();
    xhr.open('POST',url);
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = onProgress;
    xhr.onload = () => {
      if (xhr.status === 200) {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
        if (data.success) resolve(data);
        else {
          const error = new Error(`${file.name}：${data.error || '上传失败'}`);
          error.fileName = file.name;
          reject(error);
        }
      } else {
        let msg='上传失败';
        try{msg=JSON.parse(xhr.responseText).error||msg;}catch{}
        const error = new Error(`${file.name}：${msg}`);
        error.fileName = file.name;
        reject(error);
      }
    };
    xhr.onerror = () => {
      const error = new Error(`${file.name}：网络错误`);
      error.fileName = file.name;
      reject(error);
    };
    xhr.ontimeout = () => {
      const error = new Error(`${file.name}：上传超时`);
      error.fileName = file.name;
      reject(error);
    };
    xhr.send(fd);
  });
}

function setProgress(pct,text,textId,pctId,fillId){
  document.getElementById(fillId).style.width=pct+'%';
  document.getElementById(pctId).textContent=pct+'%';
  document.getElementById(textId).textContent=text;
}
function resetUploadForm(type){
  if(type==='manga'){
    selectedFileManga=[]; uploadTagsManga=[];
    ['titleInput','authorInput','tagInput'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('titleInput').disabled=false;
    document.getElementById('fileInput').value='';
    document.getElementById('tagBadges').innerHTML='';
    document.getElementById('fileInfo').style.display='none';
    document.getElementById('progressArea').style.display='none';
    document.getElementById('uploadBtn').disabled=true;
    setProgress(0,'','progressText','progressPercent','progressFill');
  } else if (type === 'novel') {
    selectedFileNovel=[]; uploadTagsNovel=[];
    ['novelTitleInput','novelAuthorInput','novelTagInput'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('novelTitleInput').disabled=false;
    document.getElementById('novelFileInput').value='';
    document.getElementById('novelTagBadges').innerHTML='';
    document.getElementById('novelFileInfo').style.display='none';
    document.getElementById('novelProgressArea').style.display='none';
    document.getElementById('novelUploadBtn').disabled=true;
    setProgress(0,'','novelProgressText','novelProgressPercent','novelProgressFill');
  } else if (type === 'image') {
    selectedFileImage=[];
    document.getElementById('imageTitleInput').value='';
    document.getElementById('imageFileInput').value='';
    document.getElementById('imageFileInfo').style.display='none';
    document.getElementById('imageProgressArea').style.display='none';
    document.getElementById('imageUploadBtn').disabled=true;
    setProgress(0,'','imageProgressText','imageProgressPercent','imageProgressFill');
  } else if (type === 'video') {
    selectedFileVideo=[];
    document.getElementById('videoTitleInput').value='';
    document.getElementById('videoFileInput').value='';
    document.getElementById('videoFileInfo').style.display='none';
    document.getElementById('videoProgressArea').style.display='none';
    document.getElementById('videoUploadBtn').disabled=true;
    setProgress(0,'','videoProgressText','videoProgressPercent','videoProgressFill');
  }
}

/* ── Toast ────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg,type=''){
  clearTimeout(toastTimer);
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show '+type;
  toastTimer=setTimeout(()=>t.className='toast',3000);
}

/* ── Util ─────────────────────────────────────────────────────── */
function esc(str){const d=document.createElement('div');d.appendChild(document.createTextNode(String(str)));return d.innerHTML;}
