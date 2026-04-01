(function () {
  // 长按编辑相关存储
  const mediaCardLongPressTimers = new Map();
  const mediaCardLongPressStarts = new Map();
  const mediaCardLongPressSuppressUntil = new Map();
  let mediaTouchGestureSuppressClickUntil = 0;
  const LONG_PRESS_DURATION = 650;
  const LONG_PRESS_DURATION_VIDEO = 520;
  const LONG_PRESS_MOVE_THRESHOLD = 10;
  const LONG_PRESS_MOVE_THRESHOLD_VIDEO = 16;
  const VIDEO_THUMBNAIL_STATE_KEY = 'video_preview_time_state';
  const VIDEO_PREVIEW_MIN_SEC = 2;
  const VIDEO_PREVIEW_MIN_RATIO = 0.08;
  const VIDEO_PREVIEW_MAX_RATIO = 0.75;
  const VIDEO_PREVIEW_FALLBACK_RATIO = 0.38;
  const VIDEO_PREVIEW_SMOOTH_ALPHA = 0.35;
  const VIDEO_VIEW_HISTORY_KEY = 'video_view_history';
  const VIDEO_VIEW_HISTORY_LIMIT = 500;
  const VIDEO_FALLBACK_POSTER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#374151"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="160" cy="100" r="36" fill="rgba(255,255,255,0.18)"/><polygon points="150,82 150,118 180,100" fill="rgba(255,255,255,0.92)"/></svg>')}`;
  let imageViewerOpenedByHistory = false;
  let videoViewerOpenedByHistory = false;
  let activeVideoViewerItemId = '';
  let imageViewerItems = [];
  let imageViewerIndex = 0;
  let imageViewerMode = 'single'; // 'single' | 'scroll'
  let imageViewerTouchStartX = 0;
  let imageViewerTouchStartY = 0;
  let imageViewerTouchTracking = false;
  let imageViewerScrollRaf = null;
  let imageViewerSingleSwipeAnimating = false;
  const IMAGE_VIEWER_ZOOM_MIN = 1;
  const IMAGE_VIEWER_ZOOM_MAX = 4;
  const IMAGE_VIEWER_ZOOM_STEP = 0.18;
  const IMAGE_VIEWER_DOUBLE_TAP_MS = 280;
  const imageViewerZoomMap = new Map();
  const imageViewerPanMap = new Map();
  let imageViewerPinchState = null;
  let imageViewerPinchSuppressUntil = 0;
  let imageViewerPanState = null;
  let imageViewerPanSuppressUntil = 0;
  let imageViewerLastTapAt = 0;
  let imageViewerLastTapKey = '';
  const IMAGE_VIEWER_MODE_KEY = 'iv_mode';
  let imageBatchMode = false;
  const imageBatchSelected = new Set();
  let videoBatchMode = false;
  const videoBatchSelected = new Set();
  let imageListCache = [];
  let videoListCache = [];
  let lastImageLoadCtx = {};
  let lastVideoLoadCtx = {};
  let imageDuplicatePanelVisible = false;
  let imageDuplicateLoading = false;
  let imageDuplicateThreshold = 10;
  let imageDuplicateIgnoredView = false;
  let imageDuplicateSelectMode = '';
  const imageDuplicateSelected = new Set();
  let imageDuplicateThresholdTimer = null;
  let imageDuplicateResult = {
    exactGroups: [],
    similarPairs: [],
    ignoredItems: [],
    ignoredCount: 0,
    total: 0
  };
  let videoDuplicatePanelVisible = false;
  let videoDuplicateLoading = false;
  let videoDuplicateIgnoredView = false;
  let videoDuplicateSelectMode = '';
  const videoDuplicateSelected = new Set();
  let videoDuplicateResult = {
    exactGroups: [],
    similarPairs: [],
    ignoredItems: [],
    ignoredCount: 0,
    total: 0
  };
  let imagePage = 1;
  let imagePerPage = 40;
  let lastImageSearchQuery = '';
  let videoPage = 1;
  let videoPerPage = 40;
  let lastVideoSearchQuery = '';
  let videoSortBy = 'latest';
  let videoSeriesFilter = '';
  const IMAGE_PAGING_STATE_KEY = 'image_paging_state';
  const VIDEO_PAGING_STATE_KEY = 'video_paging_state';
  let imagePagingStateHydrated = false;
  let videoPagingStateHydrated = false;
  const videoThumbnailCache = new Map();
  let videoThumbnailStateHydrated = false;
  let videoViewerPlaylist = [];
  let videoViewerPlaylistIndex = -1;
  let videoHistoryLastPersistAt = 0;
  let videoPlaybackLastErrorAt = 0;
  const videoCardPosterFrameCache = new Map();
  const videoCardPosterFramePending = new Set();
  const VIDEO_GESTURE_DOUBLE_TAP_MS = 280;
  const VIDEO_GESTURE_LONG_PRESS_MS = 320;
  const VIDEO_GESTURE_TAP_MOVE_THRESHOLD = 10;
  const VIDEO_GESTURE_VERTICAL_THRESHOLD = 54;
  const VIDEO_GESTURE_AXIS_LOCK_RATIO = 1.16;
  const VIDEO_GESTURE_VOLUME_STEP = 0.0033;
  const VIDEO_GESTURE_BRIGHTNESS_STEP = 0.0036;
  let videoGestureTouchStartX = 0;
  let videoGestureTouchStartY = 0;
  let videoGestureTouchStartTime = 0;
  let videoGestureTracking = false;
  let videoGestureMoved = false;
  let videoGestureLongPressActive = false;
  let videoGestureLongPressTimer = null;
  let videoGestureLastTapAt = 0;
  let videoGestureBasePlaybackRate = 1;
  let videoGestureBrightness = 1;
  let videoGestureTouchIdentifier = null;

  function loadVideoViewHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(VIDEO_VIEW_HISTORY_KEY) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  function saveVideoViewHistory(history) {
    try {
      localStorage.setItem(VIDEO_VIEW_HISTORY_KEY, JSON.stringify(history && typeof history === 'object' ? history : {}));
    } catch {
      // ignore persistence errors
    }
  }

  function persistVideoViewHistory(item, videoEl) {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const title = String(item?.title || '').trim();
    const url = String(item?.url || '').trim();
    const poster = String(item?.poster || '').trim();
    const cover = String(item?.cover || '').trim();
    const seriesName = String(item?.seriesName || '').trim();
    const episodeNoRaw = Number(item?.episodeNo);
    const episodeNo = Number.isFinite(episodeNoRaw) ? Math.max(0, Math.floor(episodeNoRaw)) : 0;
    const currentTimeRaw = Number(videoEl?.currentTime || 0);
    const durationRaw = Number(videoEl?.duration || item?.duration || 0);
    const position = Number.isFinite(currentTimeRaw) && currentTimeRaw > 0 ? currentTimeRaw : 0;
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0;

    const history = loadVideoViewHistory();
    history[id] = {
      id,
      title,
      url,
      poster,
      cover,
      seriesName,
      episodeNo,
      position,
      duration,
      lastViewedAt: Date.now()
    };

    const keys = Object.keys(history);
    if (keys.length > VIDEO_VIEW_HISTORY_LIMIT) {
      const sortedKeys = keys.sort((a, b) => Number(history[b]?.lastViewedAt || 0) - Number(history[a]?.lastViewedAt || 0));
      sortedKeys.slice(VIDEO_VIEW_HISTORY_LIMIT).forEach((key) => {
        delete history[key];
      });
    }
    saveVideoViewHistory(history);
  }

  function getCurrentVideoViewerItem() {
    if (!videoViewerPlaylist.length || videoViewerPlaylistIndex < 0) return null;
    return videoViewerPlaylist[videoViewerPlaylistIndex] || null;
  }

  function loadImagePagingState() {
    try {
      const raw = JSON.parse(localStorage.getItem(IMAGE_PAGING_STATE_KEY) || '{}');
      const page = Number(raw.page);
      const perPage = Number(raw.perPage);
      const search = String(raw.search || '').trim();
      return {
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
        perPage: Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 40,
        search
      };
    } catch {
      return { page: 1, perPage: 40, search: '' };
    }
  }

  function saveImagePagingState() {
    try {
      localStorage.setItem(IMAGE_PAGING_STATE_KEY, JSON.stringify({
        page: Math.max(1, Math.floor(Number(imagePage) || 1)),
        perPage: Math.max(1, Math.floor(Number(imagePerPage) || 40)),
        search: String(lastImageSearchQuery || '').trim()
      }));
    } catch {
      // ignore persistence errors
    }
  }

  function hydrateImagePagingState() {
    if (imagePagingStateHydrated) return;
    const state = loadImagePagingState();
    imagePage = state.page;
    imagePerPage = state.perPage;
    lastImageSearchQuery = state.search;
    imagePagingStateHydrated = true;
  }

  function loadVideoPagingState() {
    try {
      const raw = JSON.parse(localStorage.getItem(VIDEO_PAGING_STATE_KEY) || '{}');
      const page = Number(raw.page);
      const perPage = Number(raw.perPage);
      const search = String(raw.search || '').trim();
      const videoSearch = String(raw.videoSearch || '').trim();
      const sort = String(raw.sort || '').trim();
      const series = String(raw.series || '').trim();
      return {
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
        perPage: Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 40,
        search,
        videoSearch,
        sort,
        series
      };
    } catch {
      return { page: 1, perPage: 21, search: '', videoSearch: '', sort: 'latest', series: '' };
    }
  }

  function saveVideoPagingState() {
    try {
      localStorage.setItem(VIDEO_PAGING_STATE_KEY, JSON.stringify({
        page: Math.max(1, Math.floor(Number(videoPage) || 1)),
        perPage: Math.max(1, Math.floor(Number(videoPerPage) || 21)),
        search: String(lastVideoSearchQuery || '').trim(),
        sort: String(videoSortBy || 'latest').trim(),
        series: String(videoSeriesFilter || '').trim()
      }));
    } catch {
      // ignore persistence errors
    }
  }

  function hydrateVideoPagingState() {
    if (videoPagingStateHydrated) return;
    const state = loadVideoPagingState();
    videoPage = state.page;
    videoPerPage = state.perPage;
    lastVideoSearchQuery = state.search;
    videoSortBy = ['latest', 'oldest', 'title_asc', 'title_desc', 'author_asc', 'author_desc', 'rating_desc', 'rating_asc'].includes(state.sort)
      ? state.sort
      : 'latest';
    videoSeriesFilter = state.series;
    videoPagingStateHydrated = true;
  }

  function normalizeVideoSeriesKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getVideoSeriesValue(item) {
    const idValue = String(item?.seriesId || '').trim();
    if (idValue) return idValue;
    return String(item?.seriesName || '').trim();
  }

  function sortVideoSeriesEpisodes(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const aNoRaw = Number(a?.episodeNo);
      const bNoRaw = Number(b?.episodeNo);
      const aNo = Number.isFinite(aNoRaw) && aNoRaw > 0 ? Math.floor(aNoRaw) : Number.MAX_SAFE_INTEGER;
      const bNo = Number.isFinite(bNoRaw) && bNoRaw > 0 ? Math.floor(bNoRaw) : Number.MAX_SAFE_INTEGER;
      if (aNo !== bNo) return aNo - bNo;
      const ta = new Date(a?.uploadedAt || 0).getTime();
      const tb = new Date(b?.uploadedAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a?.title || '').localeCompare(String(b?.title || ''));
    });
  }

  function getFilteredVideoList() {
    const list = Array.isArray(videoListCache) ? videoListCache : [];
    const filter = normalizeVideoSeriesKey(videoSeriesFilter);
    if (!filter) return list;
    return list.filter(item => normalizeVideoSeriesKey(getVideoSeriesValue(item)) === filter);
  }

  function renderVideoSeriesFilter() {
    const select = document.getElementById('videoSeriesSelect');
    const clearBtn = document.getElementById('videoSeriesClearBtn');
    if (!select) {
      if (clearBtn) clearBtn.style.display = videoSeriesFilter ? '' : 'none';
      return;
    }
    const groups = new Map();
    videoListCache.forEach((item) => {
      const key = normalizeVideoSeriesKey(getVideoSeriesValue(item));
      if (!key) return;
      const name = String(item?.seriesName || item?.seriesId || '').trim();
      if (!groups.has(key)) groups.set(key, { value: key, label: name || key, count: 0 });
      groups.get(key).count += 1;
    });
    const options = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
    select.innerHTML = '<option value="">全部</option>' + options
      .map(opt => `<option value="${opt.value}">${opt.label}（${opt.count}）</option>`)
      .join('');
    if (videoSeriesFilter && !groups.has(normalizeVideoSeriesKey(videoSeriesFilter))) {
      videoSeriesFilter = '';
      saveVideoPagingState();
    }
    select.value = videoSeriesFilter;
    if (clearBtn) clearBtn.style.display = videoSeriesFilter ? '' : 'none';
  }

  async function fetchMediaList(endpoint, searchQuery, extraParams = {}) {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const raw = String(value).trim();
      if (!raw) return;
      params.set(key, raw);
    });
    return fetch(`${endpoint}?${params}`).then(r => r.json());
  }

  function loadVideoThumbnailState() {
    if (videoThumbnailStateHydrated) return;
    try {
      const raw = JSON.parse(localStorage.getItem(VIDEO_THUMBNAIL_STATE_KEY) || '{}');
      Object.entries(raw || {}).forEach(([id, previewTime]) => {
        const key = String(id || '').trim();
        const value = Number(previewTime);
        if (key && Number.isFinite(value) && value >= 0) videoThumbnailCache.set(key, value);
      });
    } catch {
      // ignore invalid cache
    }
    videoThumbnailStateHydrated = true;
  }

  function saveVideoThumbnailState() {
    try {
      const payload = {};
      for (const [id, previewTime] of videoThumbnailCache.entries()) {
        if (!id || !Number.isFinite(previewTime) || previewTime < 0) continue;
        payload[id] = Number(previewTime.toFixed(3));
      }
      localStorage.setItem(VIDEO_THUMBNAIL_STATE_KEY, JSON.stringify(payload));
    } catch {
      // ignore persistence errors
    }
  }

  function getVideoPreviewBounds(duration) {
    const d = Number(duration || 0);
    if (!Number.isFinite(d) || d <= 0) return { min: VIDEO_PREVIEW_MIN_SEC, max: Number.MAX_SAFE_INTEGER };
    const min = Math.max(VIDEO_PREVIEW_MIN_SEC, d * VIDEO_PREVIEW_MIN_RATIO);
    const max = Math.max(min + 0.2, d * VIDEO_PREVIEW_MAX_RATIO);
    return { min, max };
  }

  function pickStableVideoPreviewTime(currentTime, duration, previousTime = 0) {
    const current = Number(currentTime || 0);
    const d = Number(duration || 0);
    const prev = Number(previousTime || 0);
    if (!Number.isFinite(current) || current <= 0.05) {
      return Number.isFinite(prev) && prev > 0 ? prev : 0;
    }

    if (!Number.isFinite(d) || d <= 0) {
      const direct = Math.max(0, current);
      if (Number.isFinite(prev) && prev > 0) {
        return Number((prev * (1 - VIDEO_PREVIEW_SMOOTH_ALPHA) + direct * VIDEO_PREVIEW_SMOOTH_ALPHA).toFixed(3));
      }
      return Number(direct.toFixed(3));
    }

    const { min, max } = getVideoPreviewBounds(d);
    const nearEnd = current >= d - 0.6;
    const nearStart = current <= min;
    const fallbackMiddle = Math.max(min, Math.min(max, d * VIDEO_PREVIEW_FALLBACK_RATIO));
    const candidate = nearStart || nearEnd
      ? fallbackMiddle
      : Math.max(min, Math.min(max, current));

    if (Number.isFinite(prev) && prev > 0) {
      const blended = prev * (1 - VIDEO_PREVIEW_SMOOTH_ALPHA) + candidate * VIDEO_PREVIEW_SMOOTH_ALPHA;
      return Number(blended.toFixed(3));
    }
    return Number(candidate.toFixed(3));
  }

  function saveLastPlayedVideoThumbnail(videoId, videoEl) {
    const id = String(videoId || '').trim();
    if (!id || !videoEl) return;
    const current = Number(videoEl.currentTime || 0);
    const duration = Number(videoEl.duration || 0);
    const previous = Number(videoThumbnailCache.get(id) || 0);
    const previewTime = pickStableVideoPreviewTime(current, duration, previous);
    if (!Number.isFinite(previewTime) || previewTime <= 0) return;
    videoThumbnailCache.set(id, Math.max(0, previewTime));
    saveVideoThumbnailState();
  }

  function applyVideoCardPosterFrame(videoId, posterDataUrl) {
    const id = String(videoId || '').trim();
    const src = String(posterDataUrl || '').trim();
    if (!id || !src) return;
    const nodes = document.querySelectorAll(`.media-video-cover-thumb[data-video-id="${id}"]`);
    nodes.forEach((img) => {
      img.src = src;
      img.classList.remove('is-fallback');
    });
  }

  function extractVideoPosterFrame(item, previewHint = 0) {
    const url = String(item?.url || '').trim();
    if (!url) return Promise.resolve('');
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
        } catch {
          // ignore draw failures
        }
        finish('');
      };

      const seekFrame = () => {
        try {
          const duration = Number(probe.duration || 0);
          let target = Number(previewHint || 0);
          if (Number.isFinite(duration) && duration > 0) {
            if (!(Number.isFinite(target) && target > 0)) target = duration * VIDEO_PREVIEW_FALLBACK_RATIO;
            const { min, max } = getVideoPreviewBounds(duration);
            target = Math.max(min, Math.min(max, target));
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
      probe.src = url;
      document.body.appendChild(probe);
    });
  }

  function hydrateVideoCardPoster(item) {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const rawCover = String(item?.cover || '').trim();
    if (rawCover) return;

    const cached = String(videoCardPosterFrameCache.get(id) || '').trim();
    if (cached) {
      applyVideoCardPosterFrame(id, cached);
      return;
    }
    if (videoCardPosterFramePending.has(id)) return;
    videoCardPosterFramePending.add(id);

    const previewHint = Number(videoThumbnailCache.get(id) || 0);
    extractVideoPosterFrame(item, previewHint)
      .then((dataUrl) => {
        const next = String(dataUrl || '').trim();
        if (!next) return;
        videoCardPosterFrameCache.set(id, next);
        applyVideoCardPosterFrame(id, next);
      })
      .finally(() => {
        videoCardPosterFramePending.delete(id);
      });
  }

  function getVideoMimeTypeByUrl(url) {
    const value = String(url || '').toLowerCase();
    if (!value) return '';
    if (value.includes('.mp4') || value.includes('.m4v')) return 'video/mp4';
    if (value.includes('.webm')) return 'video/webm';
    if (value.includes('.mov')) return 'video/quicktime';
    if (value.includes('.ogg') || value.includes('.ogv')) return 'video/ogg';
    return '';
  }

  function getVideoExtHint(item) {
    const ext = String(item?.ext || '').trim().toLowerCase();
    if (ext) return ext;
    const url = String(item?.url || '').trim().toLowerCase();
    const matched = url.match(/\.(mp4|m4v|webm|mov|mkv|avi|flv)(?:$|\?|#)/i);
    return matched ? `.${String(matched[1] || '').toLowerCase()}` : '';
  }

  function showVideoPlaybackErrorTip(item, errorName = '') {
    const now = Date.now();
    if (now - videoPlaybackLastErrorAt < 2200) return;
    videoPlaybackLastErrorAt = now;
    const ext = getVideoExtHint(item);
    const extText = ext ? `（当前文件：${ext}）` : '';
    const blockedTip = errorName === 'NotAllowedError'
      ? '手机浏览器拦截了自动播放，已尝试静音重试。'
      : '当前手机浏览器无法解码该视频。';
    showImageBatchToast(`${blockedTip}${extText} 建议转码为 H.264 + AAC 的 MP4。`, 'error');
  }

  function tryOpenVideoExternally(item) {
    const url = String(item?.url || '').trim();
    if (!url) return;
    const shouldOpen = confirm('当前页面内播放失败，是否尝试用系统播放器打开该视频？');
    if (!shouldOpen) return;
    try {
      window.location.href = url;
    } catch {
      // ignore navigation failures
    }
  }

  async function tryPlayVideoElement(videoEl, item) {
    if (!videoEl) return;
    try {
      await videoEl.play();
      return;
    } catch (err) {
      const name = String(err?.name || '');
      if (name === 'NotAllowedError' && !videoEl.muted) {
        try {
          videoEl.muted = true;
          await videoEl.play();
          showImageBatchToast('已切换为静音自动播放，可用播放器按钮恢复声音。', '');
          return;
        } catch (retryErr) {
          showVideoPlaybackErrorTip(item, String(retryErr?.name || name));
          return;
        }
      }
      showVideoPlaybackErrorTip(item, name);
    }
  }

  function renderMediaCards({ gridId, list, kind, esc, formatSize, onOpen, showManageButtons = false }) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(list) || !list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">${kind === 'image' ? '🖼' : '🎬'}</div><p>暂无内容</p></div>`;
      return;
    }

    list.forEach(item => {
      const card = document.createElement('div');
      const selected = (kind === 'image' && imageBatchMode && imageBatchSelected.has(item.id))
        || (kind === 'video' && videoBatchMode && videoBatchSelected.has(item.id));
      card.className = `manga-card media-card${selected ? ' selected-export' : ''}`;
      const videoPreviewTime = Number(videoThumbnailCache.get(item.id) || 0);
      const videoPosterRaw = String(item.cover || '').trim();
      const videoPoster = videoPosterRaw || VIDEO_FALLBACK_POSTER;
      const cachedFramePoster = String(videoCardPosterFrameCache.get(String(item.id || '').trim()) || '').trim();
      const finalPoster = videoPosterRaw ? videoPosterRaw : (cachedFramePoster || videoPoster);
      const imageCardSrc = String(item.thumbUrl || item.cover || item.url || '').trim();
      const coverHtml = kind === 'image'
        ? `<img class="manga-cover media-cover" src="${esc(imageCardSrc)}" alt="${esc(item.title)}" loading="lazy" decoding="async" fetchpriority="low" draggable="false" ondragstart="return false" oncontextmenu="return false" onerror="if(this.dataset.fallbackApplied==='1')return;this.dataset.fallbackApplied='1';this.src='${esc(String(item.url || ''))}'">`
        : videoPosterRaw
          ? `<img class="manga-cover media-cover media-video-cover" src="${esc(videoPosterRaw)}" alt="${esc(item.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${VIDEO_FALLBACK_POSTER}'">`
          : `<img class="manga-cover media-cover media-video-cover media-video-cover-thumb${cachedFramePoster ? '' : ' is-fallback'}" src="${esc(finalPoster)}" alt="${esc(item.title)}" loading="lazy" decoding="async" data-video-id="${esc(String(item.id || '').trim())}" data-video-url="${esc(item.url)}" data-preview-time="${videoPreviewTime}" onerror="this.onerror=null;this.src='${VIDEO_FALLBACK_POSTER}'">`;
      const sizeText = Number(item.size || 0) > 0 ? formatSize(Number(item.size || 0)) : '未知大小';
      const timeText = item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '';
      const showActions = kind === 'image' || kind === 'video' ? !!showManageButtons : true;
      const videoEpisode = Number(item.episodeNo);
      const videoSeriesName = String(item.seriesName || '').trim();
      const videoEpisodeText = Number.isFinite(videoEpisode) && videoEpisode > 0
        ? `第${Math.floor(videoEpisode)}集`
        : '未标集数';
      const videoSeriesDisplayName = videoSeriesName || '未归档';
      const infoHtml = kind === 'image'
        ? ''
        : kind === 'video'
          ? `<div class="manga-info video-info">
            <div class="manga-title video-title">${esc(item.title || '')}</div>
            <div class="manga-meta video-series-meta">
              <div class="video-series-name" title="${esc(videoSeriesDisplayName)}">${esc(videoSeriesDisplayName)}</div>
              <div class="video-episode-text">${esc(videoEpisodeText)}</div>
            </div>
          </div>`
          : `<div class="manga-info">
            <div class="manga-title">${esc(item.title || '')}</div>
            <div class="manga-meta">${esc(sizeText)} ${timeText ? `· ${esc(timeText)}` : ''}</div>
          </div>`;
      card.innerHTML = `
        <div class="card-actions${showActions ? '' : ' is-hidden'}">
          ${kind === 'image' && imageBatchMode ? `<button class="card-btn select${selected ? ' active' : ''}" title="${selected ? '取消选择' : '选择'}" onclick="MediaFeature.toggleImageBatchSelection(event,'${item.id}')">${selected ? '☑' : '☐'}</button>` : ''}
          ${kind === 'video' && videoBatchMode ? `<button class="card-btn select${selected ? ' active' : ''}" title="${selected ? '取消选择' : '选择'}" onclick="MediaFeature.toggleVideoBatchSelection(event,'${item.id}')">${selected ? '☑' : '☐'}</button>` : ''}
          ${kind === 'image' ? '<button class="card-btn media-info-btn" title="信息">ℹ</button>' : ''}
          <button class="card-btn" title="编辑" onclick="openEdit(event,'${item.id}','${kind}')">✎</button>
          <button class="card-btn del" title="删除" onclick="deleteMediaItem(event,'${kind}','${item.id}')">✕</button>
        </div>
        ${coverHtml}
        ${infoHtml}`;
      if (kind === 'image') {
        const infoBtn = card.querySelector('.media-info-btn');
        if (infoBtn) {
          infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const lines = [
              `标题：${item.title || ''}`,
              `大小：${sizeText}`,
              `上传时间：${timeText || '-'}`
            ];
            alert(lines.join('\n'));
          });
        }
      }

      card.addEventListener('click', (e) => {
        if (Date.now() < mediaTouchGestureSuppressClickUntil) {
          e.preventDefault();
          return;
        }
        if (Date.now() < Number(mediaCardLongPressSuppressUntil.get(item.id) || 0)) {
          e.preventDefault();
          return;
        }
        if (e.target.closest('.card-btn')) return;
        if (kind === 'image' && imageBatchMode) {
          toggleImageBatchSelection({ event: e, id: item.id, silent: true });
          return;
        }
        if (kind === 'video' && videoBatchMode) {
          toggleVideoBatchSelection({ event: e, id: item.id, silent: true });
          return;
        }
        onOpen(item);
      });

      card.addEventListener('contextmenu', (e) => {
        if (window.matchMedia('(max-width:720px)').matches) return;
        if (e.target.closest('.card-btn')) return;
        e.preventDefault();
        if (typeof window.toggleCardActionButtons === 'function') {
          window.toggleCardActionButtons(true);
        }
        showImageBatchToast('已显示管理按钮，可进行导出/编辑/删除', '');
      });

      // 长按编辑（图片/视频卡片）
      if (kind === 'image' || kind === 'video') {
        card.addEventListener('touchstart', (e) => {
          if (e.touches?.length !== 1) return;
          if (e.target.closest('.card-btn')) return;
          const touch = e.touches[0];
          mediaCardLongPressStarts.set(item.id, {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now()
          });
          const longPressDuration = kind === 'video' ? LONG_PRESS_DURATION_VIDEO : LONG_PRESS_DURATION;
          const timer = setTimeout(() => {
            mediaCardLongPressTimers.delete(item.id);
            mediaCardLongPressStarts.delete(item.id);
            mediaCardLongPressSuppressUntil.set(item.id, Date.now() + 420);
            openEdit(null, item.id, kind);
          }, longPressDuration);
          mediaCardLongPressTimers.set(item.id, timer);
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
          const start = mediaCardLongPressStarts.get(item.id);
          if (!start) return;
          const touch = e.touches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          const moveThreshold = kind === 'video' ? LONG_PRESS_MOVE_THRESHOLD_VIDEO : LONG_PRESS_MOVE_THRESHOLD;
          // 使用平方比较避免 sqrt 开销
          if (deltaX * deltaX + deltaY * deltaY > moveThreshold * moveThreshold) {
            // 发生滑动手势后短暂屏蔽 click，避免下滑结束时误触打开其他卡片
            mediaTouchGestureSuppressClickUntil = Date.now() + 420;
            const timer = mediaCardLongPressTimers.get(item.id);
            if (timer) {
              clearTimeout(timer);
              mediaCardLongPressTimers.delete(item.id);
            }
            mediaCardLongPressStarts.delete(item.id);
          }
        }, { passive: true });

        card.addEventListener('touchend', () => {
          const timer = mediaCardLongPressTimers.get(item.id);
          if (timer) {
            clearTimeout(timer);
            mediaCardLongPressTimers.delete(item.id);
          }
          mediaCardLongPressStarts.delete(item.id);
        }, { passive: true });

        card.addEventListener('touchcancel', () => {
          const timer = mediaCardLongPressTimers.get(item.id);
          if (timer) {
            clearTimeout(timer);
            mediaCardLongPressTimers.delete(item.id);
          }
          mediaCardLongPressStarts.delete(item.id);
        }, { passive: true });

        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
        });
      }

      grid.appendChild(card);
    });
  }

  function renderImagePagination(total, totalPages) {
    const el = document.getElementById('imagePagination');
    if (!el) return;
    if (!total || totalPages <= 1) {
      el.innerHTML = '';
      return;
    }
    const show = new Set();
    [1, totalPages, imagePage - 2, imagePage - 1, imagePage, imagePage + 1, imagePage + 2]
      .filter(p => p >= 1 && p <= totalPages)
      .forEach(p => show.add(p));
    const pages = [...show].sort((a, b) => a - b);
    let html = '';
    let prev = 0;
    pages.forEach(p => {
      if (prev && p - prev > 1) html += '<span class="pg-ellipsis">…</span>';
      html += `<button class="pg-btn${p === imagePage ? ' active' : ''}" onclick="MediaFeature.changeImagePage(${p})">${p}</button>`;
      prev = p;
    });
    const jumpHtml = `<span class="pg-jump"><span class="pg-jump-label">跳至</span><input class="pg-jump-input" type="number" min="1" max="${totalPages}" value="${imagePage}" onkeydown="MediaFeature.handleImagePageJumpInput(event,this.value,${totalPages})"><span class="pg-jump-label">页</span></span>`;
    el.innerHTML =
      `<button class="pg-btn pg-prev" onclick="MediaFeature.changeImagePage(${imagePage - 1})" ${imagePage <= 1 ? 'disabled' : ''}>‹</button>` +
      html +
      `<button class="pg-btn pg-next" onclick="MediaFeature.changeImagePage(${imagePage + 1})" ${imagePage >= totalPages ? 'disabled' : ''}>›</button>` +
      jumpHtml;
  }

  function renderImagesFromCache() {
    const esc = typeof lastImageLoadCtx?.esc === 'function' ? lastImageLoadCtx.esc : (value => String(value || ''));
    const formatSize = typeof lastImageLoadCtx?.formatSize === 'function'
      ? lastImageLoadCtx.formatSize
      : (size => `${Math.max(0, Number(size || 0))} B`);
    const showManageButtons = !!lastImageLoadCtx?.showManageButtons;

    const total = imageListCache.length;
    const totalPages = Math.max(1, Math.ceil(total / imagePerPage));
    const beforePage = imagePage;
    if (imagePage > totalPages) imagePage = totalPages;
    if (imagePage < 1) imagePage = 1;
    if (imagePage !== beforePage) saveImagePagingState();

    const start = (imagePage - 1) * imagePerPage;
    const pageItems = imageListCache.slice(start, start + imagePerPage);
    renderMediaCards({
      gridId: 'imageGrid',
      list: pageItems,
      kind: 'image',
      esc,
      formatSize,
      onOpen: openImageViewer,
      showManageButtons
    });

    const countEl = document.getElementById('imageCount');
    const selectedCount = imageBatchSelected.size;
    if (countEl) {
      const pageText = total > 0 ? `（第 ${imagePage}/${totalPages} 页）` : '';
      countEl.textContent = imageBatchMode
        ? `共 ${total} 张图片 ${pageText} · 已选 ${selectedCount} 张`
        : `共 ${total} 张图片 ${pageText}`;
    }

    const perPageSelect = document.getElementById('imagePerPageSelect');
    if (perPageSelect) perPageSelect.value = String(imagePerPage);
    renderImagePagination(total, totalPages);
    updateImageBatchToolbar();
  }

  function renderVideoPagination(total, totalPages) {
    const el = document.getElementById('videoPagination');
    if (!el) return;
    if (!total || totalPages <= 1) {
      el.innerHTML = '';
      return;
    }
    const show = new Set();
    [1, totalPages, videoPage - 2, videoPage - 1, videoPage, videoPage + 1, videoPage + 2]
      .filter(p => p >= 1 && p <= totalPages)
      .forEach(p => show.add(p));
    const pages = [...show].sort((a, b) => a - b);
    let html = '';
    let prev = 0;
    pages.forEach(p => {
      if (prev && p - prev > 1) html += '<span class="pg-ellipsis">…</span>';
      html += `<button class="pg-btn${p === videoPage ? ' active' : ''}" onclick="MediaFeature.changeVideoPage(${p})">${p}</button>`;
      prev = p;
    });
    const jumpHtml = `<span class="pg-jump"><span class="pg-jump-label">跳至</span><input class="pg-jump-input" type="number" min="1" max="${totalPages}" value="${videoPage}" onkeydown="MediaFeature.handleVideoPageJumpInput(event,this.value,${totalPages})"><span class="pg-jump-label">页</span></span>`;
    el.innerHTML =
      `<button class="pg-btn pg-prev" onclick="MediaFeature.changeVideoPage(${videoPage - 1})" ${videoPage <= 1 ? 'disabled' : ''}>‹</button>` +
      html +
      `<button class="pg-btn pg-next" onclick="MediaFeature.changeVideoPage(${videoPage + 1})" ${videoPage >= totalPages ? 'disabled' : ''}>›</button>` +
      jumpHtml;
  }

  function renderVideosFromCache() {
    const esc = typeof lastVideoLoadCtx?.esc === 'function' ? lastVideoLoadCtx.esc : (value => String(value || ''));
    const formatSize = typeof lastVideoLoadCtx?.formatSize === 'function'
      ? lastVideoLoadCtx.formatSize
      : (size => `${Math.max(0, Number(size || 0))} B`);
    const showManageButtons = !!lastVideoLoadCtx?.showManageButtons;

    const filteredList = getFilteredVideoList();
    const total = filteredList.length;
    const totalPages = Math.max(1, Math.ceil(total / videoPerPage));
    const beforePage = videoPage;
    if (videoPage > totalPages) videoPage = totalPages;
    if (videoPage < 1) videoPage = 1;
    if (videoPage !== beforePage) saveVideoPagingState();

    const start = (videoPage - 1) * videoPerPage;
    const pageItems = filteredList.slice(start, start + videoPerPage);
    renderMediaCards({
      gridId: 'videoGrid',
      list: pageItems,
      kind: 'video',
      esc,
      formatSize,
      onOpen: openVideoViewer,
      showManageButtons
    });

    const countEl = document.getElementById('videoCount');
    const selectedCount = videoBatchSelected.size;
    if (countEl) {
      const pageText = total > 0 ? `（第 ${videoPage}/${totalPages} 页）` : '';
      const filterHint = videoSeriesFilter ? ' · 连续剧筛选中' : '';
      const inSeriesFilterMode = !!String(videoSeriesFilter || '').trim();
      const showSelectedCount = videoBatchMode && !inSeriesFilterMode;
      countEl.textContent = showSelectedCount
        ? `共 ${total} 个视频 ${pageText}${filterHint} · 已选 ${selectedCount} 个`
        : `共 ${total} 个视频 ${pageText}${filterHint}`;
    }

    const perPageSelect = document.getElementById('videoPerPageSelect');
    if (perPageSelect) perPageSelect.value = String(videoPerPage);
    const sortSelect = document.getElementById('videoSortSelect');
    if (sortSelect) sortSelect.value = videoSortBy;
    renderVideoSeriesFilter();
    renderVideoPagination(total, totalPages);
    updateVideoBatchToolbar();
  }

  async function loadImages(ctx) {
    const { searchQuery = '', showToast } = ctx || {};
    hydrateImagePagingState();
    lastImageLoadCtx = ctx || {};
    const normalizedSearch = String(searchQuery || '').trim();
    if (normalizedSearch !== lastImageSearchQuery) {
      lastImageSearchQuery = normalizedSearch;
      imagePage = 1;
      saveImagePagingState();
    }
    try {
      // 如果有缓存，立即渲染（使页面无白屏），同时在后台刷新数据
      if (imageListCache.length > 0) renderImagesFromCache();
      const list = await fetchMediaList('/api/images', searchQuery);
      imageListCache = Array.isArray(list) ? list : [];
      const validIds = new Set(imageListCache.map(item => item.id));
      [...imageBatchSelected].forEach(id => {
        if (!validIds.has(id)) imageBatchSelected.delete(id);
      });
      for (const [id, timer] of mediaCardLongPressTimers) {
        if (!validIds.has(id)) {
          clearTimeout(timer);
          mediaCardLongPressTimers.delete(id);
          mediaCardLongPressStarts.delete(id);
        }
      }
      renderImagesFromCache();
      return imageListCache;
    } catch {
      if (typeof showToast === 'function') showToast('图片加载失败', 'error');
      return [];
    }
  }

  async function loadVideos(ctx) {
    const { searchQuery = '', showToast } = ctx || {};
    hydrateVideoPagingState();
    loadVideoThumbnailState();
    lastVideoLoadCtx = ctx || {};
    const normalizedSearch = String(searchQuery || '').trim();
    if (normalizedSearch !== lastVideoSearchQuery) {
      lastVideoSearchQuery = normalizedSearch;
      videoPage = 1;
      saveVideoPagingState();
    }
    try {
      // 如果有缓存，立即渲染（使页面无白屏），同时在后台刷新数据
      if (videoListCache.length > 0) renderVideosFromCache();
      const list = await fetchMediaList('/api/videos', normalizedSearch, { sort: videoSortBy });
      videoListCache = Array.isArray(list) ? list : [];
      const validSeries = new Set(videoListCache.map(item => normalizeVideoSeriesKey(getVideoSeriesValue(item))).filter(Boolean));
      if (videoSeriesFilter && !validSeries.has(normalizeVideoSeriesKey(videoSeriesFilter))) {
        videoSeriesFilter = '';
        saveVideoPagingState();
      }
      const validIds = new Set(videoListCache.map(item => item.id));
      [...videoBatchSelected].forEach(id => {
        if (!validIds.has(id)) videoBatchSelected.delete(id);
      });
      const staleThumbIds = [];
      for (const id of videoThumbnailCache.keys()) {
        if (!validIds.has(id)) staleThumbIds.push(id);
      }
      if (staleThumbIds.length) {
        staleThumbIds.forEach(id => videoThumbnailCache.delete(id));
        saveVideoThumbnailState();
      }
      renderVideosFromCache();
      return videoListCache;
    } catch {
      if (typeof showToast === 'function') showToast('视频加载失败', 'error');
      return [];
    }
  }

  function changeVideoSeriesFilter(value) {
    const next = normalizeVideoSeriesKey(value);
    if (next === normalizeVideoSeriesKey(videoSeriesFilter)) return;
    videoSeriesFilter = next;
    videoPage = 1;
    saveVideoPagingState();
    renderVideosFromCache();
  }

  function clearVideoSeriesFilter() {
    if (!videoSeriesFilter) return;
    videoSeriesFilter = '';
    videoPage = 1;
    saveVideoPagingState();
    renderVideosFromCache();
  }

  // ── 图片查看器：双模式（单图左右滑 / 连续滚动） ──────────────

  function setImageViewerMode(mode) {
    const prevMode = imageViewerMode;
    if (prevMode === 'scroll' && mode === 'single') {
      // 从滚动模式切回单图前，先按当前可见内容同步索引
      syncImageViewerIndexByScroll();
    }
    imageViewerMode = mode === 'scroll' ? 'scroll' : 'single';
    try { localStorage.setItem(IMAGE_VIEWER_MODE_KEY, imageViewerMode); } catch {}
    const singlePane = document.getElementById('ivSinglePane');
    const scrollPane = document.getElementById('ivScrollPane');
    const btnSingle = document.getElementById('ivModeSingle');
    const btnScroll = document.getElementById('ivModeScroll');
    if (!singlePane || !scrollPane) return;
    if (imageViewerMode === 'scroll') {
      singlePane.style.display = 'none';
      scrollPane.style.display = 'flex';
      if (btnSingle) btnSingle.classList.remove('active');
      if (btnScroll) btnScroll.classList.add('active');
      renderImageViewerScrollList();
    } else {
      scrollPane.style.display = 'none';
      singlePane.style.display = 'flex';
      if (btnScroll) btnScroll.classList.remove('active');
      if (btnSingle) btnSingle.classList.add('active');
      renderImageViewerSingle();
    }
  }

  function openImageViewer(item) {
    const modal = document.getElementById('imageViewerModal');
    if (!modal) return;

    // 恢复上次模式偏好
    try {
      const saved = localStorage.getItem(IMAGE_VIEWER_MODE_KEY);
      if (saved === 'scroll' || saved === 'single') imageViewerMode = saved;
    } catch {}

    const cachedSource = Array.isArray(imageListCache) && imageListCache.length
      ? imageListCache
      : [];
    let source = cachedSource;
    const targetId = String(item?.id || '').trim();
    const targetUrl = String(item?.url || '').trim();
    const existsInCache = cachedSource.some((x) => {
      const id = String(x?.id || '').trim();
      const url = String(x?.url || '').trim();
      return (targetId && id === targetId) || (targetUrl && url === targetUrl);
    });
    if (!existsInCache && item) {
      // 兜底：即使缓存不含该项，也保证先展示用户点中的图片
      source = [item, ...cachedSource];
    } else if (!source.length && item) {
      source = [item];
    }

    imageViewerItems = [...source];
    const byId = imageViewerItems.findIndex(x => x?.id && item?.id && x.id === item.id);
    const byUrl = byId >= 0 ? byId : imageViewerItems.findIndex(x => x?.url && item?.url && x.url === item.url);
    imageViewerIndex = byUrl >= 0 ? byUrl : 0;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 初始化模式按钮状态
    const btnSingle = document.getElementById('ivModeSingle');
    const btnScroll = document.getElementById('ivModeScroll');
    if (btnSingle) btnSingle.classList.toggle('active', imageViewerMode === 'single');
    if (btnScroll) btnScroll.classList.toggle('active', imageViewerMode === 'scroll');

    setImageViewerMode(imageViewerMode);
    bindImageViewerInteractions();

    if (!imageViewerOpenedByHistory) {
      history.pushState({ imageViewer: true }, '', '');
      imageViewerOpenedByHistory = true;
    }
  }

  function closeImageViewer(fromPopState = false) {
    const modal = document.getElementById('imageViewerModal');
    const listEl = document.getElementById('imageViewerList');
    if (listEl) listEl.innerHTML = '';
    imageViewerItems = [];
    imageViewerIndex = 0;
    imageViewerTouchTracking = false;
    imageViewerZoomMap.clear();
    imageViewerPanMap.clear();
    imageViewerPinchState = null;
    imageViewerPinchSuppressUntil = 0;
    imageViewerPanState = null;
    imageViewerPanSuppressUntil = 0;
    imageViewerLastTapAt = 0;
    imageViewerLastTapKey = '';
    if (imageViewerScrollRaf) {
      cancelAnimationFrame(imageViewerScrollRaf);
      imageViewerScrollRaf = null;
    }
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    const shouldBack = imageViewerOpenedByHistory && !fromPopState;
    imageViewerOpenedByHistory = false;
    if (shouldBack) history.back();
  }

  function updateImageViewerTitle() {
    const titleEl = document.getElementById('imageViewerTitle');
    if (!titleEl) return;
    if (!imageViewerItems.length) { titleEl.textContent = '图片'; return; }
    const current = imageViewerItems[imageViewerIndex] || imageViewerItems[0];
    const name = String(current?.title || '图片');
    titleEl.textContent = `${name}（${imageViewerIndex + 1}/${imageViewerItems.length}）`;
  }

  // ── 单图模式 ──
  function clampImageViewerZoom(value) {
    const zoom = Number(value);
    if (!Number.isFinite(zoom)) return IMAGE_VIEWER_ZOOM_MIN;
    return Math.max(IMAGE_VIEWER_ZOOM_MIN, Math.min(IMAGE_VIEWER_ZOOM_MAX, Number(zoom.toFixed(3))));
  }

  function getImageViewerItemKey(index = imageViewerIndex) {
    const item = imageViewerItems[index];
    if (!item) return '';
    return String(item.id || item.url || index);
  }

  function getImageViewerZoom(index = imageViewerIndex) {
    const key = getImageViewerItemKey(index);
    return clampImageViewerZoom(imageViewerZoomMap.get(key) || IMAGE_VIEWER_ZOOM_MIN);
  }

  function getImageViewerPan(index = imageViewerIndex) {
    const key = getImageViewerItemKey(index);
    const pan = key ? imageViewerPanMap.get(key) : null;
    return pan && Number.isFinite(pan.x) && Number.isFinite(pan.y)
      ? { x: pan.x, y: pan.y }
      : { x: 0, y: 0 };
  }

  function setImageViewerZoom(index, value) {
    const key = getImageViewerItemKey(index);
    if (!key) return IMAGE_VIEWER_ZOOM_MIN;
    const zoom = clampImageViewerZoom(value);
    if (zoom <= IMAGE_VIEWER_ZOOM_MIN + 0.001) {
      imageViewerZoomMap.delete(key);
      imageViewerPanMap.delete(key);
    } else {
      imageViewerZoomMap.set(key, zoom);
    }
    return zoom;
  }

  function setImageViewerPan(index, x, y) {
    const key = getImageViewerItemKey(index);
    if (!key) return { x: 0, y: 0 };
    const nx = Number.isFinite(Number(x)) ? Number(x) : 0;
    const ny = Number.isFinite(Number(y)) ? Number(y) : 0;
    if (Math.abs(nx) < 0.5 && Math.abs(ny) < 0.5) {
      imageViewerPanMap.delete(key);
      return { x: 0, y: 0 };
    }
    const next = { x: nx, y: ny };
    imageViewerPanMap.set(key, next);
    return next;
  }

  function clampImageViewerPanForElement(imgEl, zoom, pan) {
    if (!imgEl || zoom <= IMAGE_VIEWER_ZOOM_MIN + 0.001) return { x: 0, y: 0 };
    const width = Math.max(0, Number(imgEl.clientWidth || imgEl.naturalWidth || 0));
    const height = Math.max(0, Number(imgEl.clientHeight || imgEl.naturalHeight || 0));
    const maxX = Math.max(0, (width * (zoom - 1)) / 2);
    const maxY = Math.max(0, (height * (zoom - 1)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, Number(pan?.x || 0))),
      y: Math.max(-maxY, Math.min(maxY, Number(pan?.y || 0)))
    };
  }

  function applyImageViewerZoomToElement(imgEl, index, zoom = getImageViewerZoom(index)) {
    if (!imgEl) return;
    const nextZoom = clampImageViewerZoom(zoom);
    const pan = clampImageViewerPanForElement(imgEl, nextZoom, getImageViewerPan(index));
    setImageViewerPan(index, pan.x, pan.y);
    imgEl.style.transform = nextZoom > IMAGE_VIEWER_ZOOM_MIN + 0.001
      ? `translate3d(${(pan.x / nextZoom).toFixed(2)}px, ${(pan.y / nextZoom).toFixed(2)}px, 0) scale(${nextZoom})`
      : 'translate3d(0, 0, 0) scale(1)';
    imgEl.classList.toggle('is-zoomed', nextZoom > IMAGE_VIEWER_ZOOM_MIN + 0.001);
    imgEl.dataset.zoom = String(nextZoom);
    imgEl.dataset.imageIndex = String(index);
    imgEl.dataset.panX = String(pan.x);
    imgEl.dataset.panY = String(pan.y);
  }

  function applyImageViewerZoomAt(index, zoom) {
    const nextZoom = setImageViewerZoom(index, zoom);
    const singleImg = document.getElementById('ivSingleImg');
    if (singleImg && imageViewerMode === 'single' && Number(singleImg.dataset.imageIndex) === Number(index)) {
      applyImageViewerZoomToElement(singleImg, index, nextZoom);
    }
    const scrollImg = document.querySelector(`#imageViewerItem-${index} .iv-zoomable`);
    if (scrollImg) applyImageViewerZoomToElement(scrollImg, index, nextZoom);
    return nextZoom;
  }

  function findImageViewerTarget(payload) {
    const target = payload?.target instanceof Element ? payload.target : null;
    if (target) {
      const imgEl = target.closest('.iv-zoomable');
      if (imgEl) {
        const idx = Number(imgEl.dataset.imageIndex);
        return {
          imgEl,
          index: Number.isFinite(idx) ? idx : imageViewerIndex
        };
      }
    }
    const singleImg = document.getElementById('ivSingleImg');
    if (imageViewerMode === 'single' && singleImg) {
      return { imgEl: singleImg, index: imageViewerIndex };
    }
    return null;
  }

  function adjustImageViewerZoom(index, delta, imgEl = null) {
    const current = getImageViewerZoom(index);
    const next = applyImageViewerZoomAt(index, current + delta);
    if (imgEl) applyImageViewerZoomToElement(imgEl, index, next);
    return next;
  }

  function resetImageViewerTransform(index, imgEl = null) {
    imageViewerPanMap.delete(getImageViewerItemKey(index));
    applyImageViewerZoomAt(index, IMAGE_VIEWER_ZOOM_MIN);
    if (imgEl) applyImageViewerZoomToElement(imgEl, index, IMAGE_VIEWER_ZOOM_MIN);
  }

  function getTouchDistance(touchA, touchB) {
    if (!touchA || !touchB) return 0;
    const dx = Number(touchA.clientX || 0) - Number(touchB.clientX || 0);
    const dy = Number(touchA.clientY || 0) - Number(touchB.clientY || 0);
    return Math.hypot(dx, dy);
  }

  function handleImageViewerWheelZoom(event) {
    if (!event?.ctrlKey) return;
    const targetInfo = findImageViewerTarget(event);
    if (!targetInfo) return;
    event.preventDefault();
    const direction = Number(event.deltaY || 0) < 0 ? 1 : -1;
    adjustImageViewerZoom(targetInfo.index, direction * IMAGE_VIEWER_ZOOM_STEP, targetInfo.imgEl);
  }

  function startImageViewerPinch(event) {
    if (!event || !event.touches || event.touches.length !== 2) return;
    if (imageViewerPanState?.pointerType === 'touch') endImageViewerPan();
    const targetInfo = findImageViewerTarget(event);
    if (!targetInfo) return;
    const [touchA, touchB] = event.touches;
    const distance = getTouchDistance(touchA, touchB);
    if (!distance) return;
    imageViewerPinchState = {
      index: targetInfo.index,
      imgEl: targetInfo.imgEl,
      startDistance: distance,
      startZoom: getImageViewerZoom(targetInfo.index)
    };
    imageViewerPinchSuppressUntil = Date.now() + 240;
    event.preventDefault();
  }

  function moveImageViewerPinch(event) {
    if (!imageViewerPinchState || !event?.touches || event.touches.length !== 2) return;
    const [touchA, touchB] = event.touches;
    const distance = getTouchDistance(touchA, touchB);
    if (!distance || !imageViewerPinchState.startDistance) return;
    const ratio = distance / imageViewerPinchState.startDistance;
    const nextZoom = imageViewerPinchState.startZoom * ratio;
    applyImageViewerZoomAt(imageViewerPinchState.index, nextZoom);
    if (imageViewerPinchState.imgEl) {
      applyImageViewerZoomToElement(imageViewerPinchState.imgEl, imageViewerPinchState.index, nextZoom);
    }
    imageViewerPinchSuppressUntil = Date.now() + 240;
    event.preventDefault();
  }

  function endImageViewerPinch() {
    if (!imageViewerPinchState) return;
    imageViewerPinchState = null;
    imageViewerPinchSuppressUntil = Date.now() + 240;
  }

  function beginImageViewerPan(targetInfo, clientX, clientY, pointerType = 'mouse') {
    if (!targetInfo?.imgEl) return false;
    const zoom = getImageViewerZoom(targetInfo.index);
    if (zoom <= IMAGE_VIEWER_ZOOM_MIN + 0.01) return false;
    const pan = getImageViewerPan(targetInfo.index);
    imageViewerPanState = {
      index: targetInfo.index,
      imgEl: targetInfo.imgEl,
      pointerType,
      startX: Number(clientX || 0),
      startY: Number(clientY || 0),
      originX: pan.x,
      originY: pan.y
    };
    imageViewerPanSuppressUntil = Date.now() + 220;
    targetInfo.imgEl.classList.add('is-panning');
    return true;
  }

  function canImageViewerPanTarget(targetInfo) {
    if (!targetInfo?.imgEl) return false;
    return getImageViewerZoom(targetInfo.index) > IMAGE_VIEWER_ZOOM_MIN + 0.01;
  }

  function moveImageViewerPan(clientX, clientY) {
    if (!imageViewerPanState?.imgEl) return;
    const dx = Number(clientX || 0) - imageViewerPanState.startX;
    const dy = Number(clientY || 0) - imageViewerPanState.startY;
    setImageViewerPan(
      imageViewerPanState.index,
      imageViewerPanState.originX + dx,
      imageViewerPanState.originY + dy
    );
    applyImageViewerZoomToElement(
      imageViewerPanState.imgEl,
      imageViewerPanState.index,
      getImageViewerZoom(imageViewerPanState.index)
    );
    imageViewerPanSuppressUntil = Date.now() + 220;
  }

  function endImageViewerPan() {
    if (!imageViewerPanState?.imgEl) {
      imageViewerPanState = null;
      return;
    }
    imageViewerPanState.imgEl.classList.remove('is-panning');
    imageViewerPanState = null;
    imageViewerPanSuppressUntil = Date.now() + 220;
  }

  function handleImageViewerDoubleTapReset(event) {
    const targetInfo = findImageViewerTarget(event);
    if (!targetInfo) return false;
    const key = `${targetInfo.index}:${getImageViewerItemKey(targetInfo.index)}`;
    const now = Date.now();
    const isDoubleTap = imageViewerLastTapKey === key && (now - imageViewerLastTapAt) <= IMAGE_VIEWER_DOUBLE_TAP_MS;
    imageViewerLastTapAt = now;
    imageViewerLastTapKey = key;
    if (!isDoubleTap) return false;
    resetImageViewerTransform(targetInfo.index, targetInfo.imgEl);
    imageViewerPinchSuppressUntil = now + 260;
    imageViewerPanSuppressUntil = now + 260;
    return true;
  }

  function renderImageViewerSingle() {
    if (imageViewerSingleSwipeAnimating) return;
    ensureImageViewerSingleGhostLayers();
    const img = document.getElementById('ivSingleImg');
    if (!img) return;
    const item = imageViewerItems[imageViewerIndex];
    if (!item) return;
    img.classList.add('iv-zoomable');
    img.src = String(item.url || '');
    img.alt = String(item.title || `图片 ${imageViewerIndex + 1}`);
    applyImageViewerZoomToElement(img, imageViewerIndex, getImageViewerZoom(imageViewerIndex));
    renderImageViewerSingleGhostLayers();
    resetImageViewerSingleSwipePreview();
    updateImageViewerTitle();
    // 预加载相邻图片
    if (imageViewerIndex - 1 >= 0) {
      const pre = new Image();
      pre.src = String(imageViewerItems[imageViewerIndex - 1]?.url || '');
    }
    if (imageViewerIndex + 1 < imageViewerItems.length) {
      const pre = new Image();
      pre.src = String(imageViewerItems[imageViewerIndex + 1]?.url || '');
    }
  }

  function ensureImageViewerSingleGhostLayers() {
    const wrap = document.getElementById('ivSingleWrap');
    if (!wrap) return;
    let prev = document.getElementById('ivSingleImgPrev');
    let next = document.getElementById('ivSingleImgNext');
    if (!prev) {
      prev = document.createElement('img');
      prev.id = 'ivSingleImgPrev';
      prev.className = 'iv-single-img iv-single-ghost';
      prev.alt = '';
      prev.loading = 'eager';
      wrap.insertBefore(prev, wrap.firstChild || null);
    }
    if (!next) {
      next = document.createElement('img');
      next.id = 'ivSingleImgNext';
      next.className = 'iv-single-img iv-single-ghost';
      next.alt = '';
      next.loading = 'eager';
      wrap.appendChild(next);
    }
  }

  function renderImageViewerSingleGhostLayers() {
    const prevImg = document.getElementById('ivSingleImgPrev');
    const nextImg = document.getElementById('ivSingleImgNext');
    const prevItem = imageViewerItems[imageViewerIndex - 1];
    const nextItem = imageViewerItems[imageViewerIndex + 1];

    if (prevImg) {
      if (prevItem?.url) {
        prevImg.src = String(prevItem.url || '');
        prevImg.alt = String(prevItem.title || '上一张');
        prevImg.style.visibility = 'visible';
      } else {
        prevImg.removeAttribute('src');
        prevImg.alt = '';
        prevImg.style.visibility = 'hidden';
      }
    }

    if (nextImg) {
      if (nextItem?.url) {
        nextImg.src = String(nextItem.url || '');
        nextImg.alt = String(nextItem.title || '下一张');
        nextImg.style.visibility = 'visible';
      } else {
        nextImg.removeAttribute('src');
        nextImg.alt = '';
        nextImg.style.visibility = 'hidden';
      }
    }
  }

  function setImageViewerSingleSwipeTransition(enabled) {
    const duration = enabled ? '220ms' : '0ms';
    const easing = enabled ? 'cubic-bezier(.22,.61,.36,1)' : 'linear';
    const cssValue = `transform ${duration} ${easing}`;
    ['ivSingleImgPrev', 'ivSingleImg', 'ivSingleImgNext'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.transition = cssValue;
    });
  }

  function updateImageViewerSingleSwipePreview(deltaXRaw) {
    const wrap = document.getElementById('ivSingleWrap');
    const prev = document.getElementById('ivSingleImgPrev');
    const curr = document.getElementById('ivSingleImg');
    const next = document.getElementById('ivSingleImgNext');
    if (!wrap || !curr) return;

    const width = Math.max(1, Number(wrap.clientWidth || 0));
    let deltaX = Number(deltaXRaw || 0);
    deltaX = Math.max(-width, Math.min(width, deltaX));

    // 边界阻尼：第一页向右/最后一页向左时降低位移，避免突兀抖动
    if (deltaX > 0 && imageViewerIndex <= 0) deltaX *= 0.35;
    if (deltaX < 0 && imageViewerIndex >= imageViewerItems.length - 1) deltaX *= 0.35;

    const prevX = deltaX - width;
    const currX = deltaX;
    const nextX = deltaX + width;

    if (prev) prev.style.transform = `translate3d(${prevX}px,0,0)`;
    curr.style.transform = `translate3d(${currX}px,0,0)`;
    if (next) next.style.transform = `translate3d(${nextX}px,0,0)`;
  }

  function resetImageViewerSingleSwipePreview() {
    updateImageViewerSingleSwipePreview(0);
  }

  function shiftImageViewer(step) {
    if (!imageViewerItems.length) return;
    const next = Math.max(0, Math.min(imageViewerItems.length - 1, imageViewerIndex + step));
    if (next === imageViewerIndex) return;
    if (imageViewerMode === 'scroll') {
      imageViewerIndex = next;
      const target = document.getElementById(`imageViewerItem-${next}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      updateImageViewerTitle();
    } else {
      imageViewerIndex = next;
      renderImageViewerSingle();
    }
  }

  // ── 滚动模式 ──
  function renderImageViewerScrollList() {
    const listEl = document.getElementById('imageViewerList');
    if (!listEl) return;
    if (!imageViewerItems.length) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = imageViewerItems.map((img, idx) => {
      const title = String(img?.title || `图片 ${idx + 1}`);
      const src = String(img?.url || '');
      const loading = Math.abs(idx - imageViewerIndex) <= 2 ? 'eager' : 'lazy';
      return `<figure class="image-viewer-item" data-image-index="${idx}" id="imageViewerItem-${idx}">` +
        `<img class="iv-zoomable" data-image-index="${idx}" data-zoom="${getImageViewerZoom(idx)}" src="${src}" alt="${title.replace(/"/g, '&quot;')}" loading="${loading}">` +
        `</figure>`;
    }).join('');
    listEl.querySelectorAll('.iv-zoomable').forEach((imgEl) => {
      const idx = Number(imgEl.dataset.imageIndex);
      applyImageViewerZoomToElement(imgEl, idx, getImageViewerZoom(idx));
    });
    updateImageViewerTitle();
    requestAnimationFrame(() => {
      const target = document.getElementById(`imageViewerItem-${imageViewerIndex}`);
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }

  function syncImageViewerIndexByScroll() {
    const scrollPane = document.getElementById('ivScrollPane');
    if (!scrollPane || !imageViewerItems.length) return;
    const rect = scrollPane.getBoundingClientRect();
    const anchorY = rect.top + rect.height * 0.5;
    const nodes = scrollPane.querySelectorAll('.image-viewer-item');
    let bestIndex = imageViewerIndex;
    let bestDist = Number.POSITIVE_INFINITY;
    nodes.forEach((node, idx) => {
      const r = node.getBoundingClientRect();
      const midY = r.top + r.height * 0.5;
      const dist = Math.abs(midY - anchorY);
      if (dist < bestDist) { bestDist = dist; bestIndex = idx; }
    });
    if (bestIndex !== imageViewerIndex) {
      imageViewerIndex = bestIndex;
      updateImageViewerTitle();
    }
  }

  // ── 触摸交互绑定（两个面板各绑一次） ──
  function bindImageViewerInteractions() {
    const singleWrap = document.getElementById('ivSingleWrap');
    const scrollPane = document.getElementById('ivScrollPane');

    // 单图面板：移动端左右滑动切图，桌面端左右点击切图
    if (singleWrap && !singleWrap.dataset.ivBound) {
      singleWrap.dataset.ivBound = '1';
      let tx0 = 0, ty0 = 0, tracking = false, previewingSwipe = false, lastDx = 0;
      singleWrap.addEventListener('touchstart', (e) => {
        if (e.touches?.length === 2) return;
        const targetInfo = findImageViewerTarget(e);
        if (targetInfo && beginImageViewerPan(targetInfo, e.touches?.[0]?.clientX, e.touches?.[0]?.clientY, 'touch')) {
          tracking = false;
          e.preventDefault();
          return;
        }
        const t = e.touches?.[0]; if (!t) return;
        tx0 = t.clientX; ty0 = t.clientY; tracking = true; previewingSwipe = false; lastDx = 0;
        setImageViewerSingleSwipeTransition(false);
      }, { passive: false });
      singleWrap.addEventListener('touchcancel', () => {
        tracking = false;
        previewingSwipe = false;
        lastDx = 0;
        setImageViewerSingleSwipeTransition(false);
        resetImageViewerSingleSwipePreview();
        endImageViewerPan();
      }, { passive: true });
      singleWrap.addEventListener('touchmove', (e) => {
        if (e.touches?.length !== 1) return;
        if (imageViewerPinchState) return;
        if (imageViewerPanState?.pointerType === 'touch') {
          const t = e.touches?.[0];
          if (!t) return;
          moveImageViewerPan(t.clientX, t.clientY);
          e.preventDefault();
          return;
        }

        if (!tracking) return;
        if (imageViewerMode !== 'single' || !imageViewerItems.length) return;
        if (Date.now() < imageViewerPinchSuppressUntil || Date.now() < imageViewerPanSuppressUntil) return;
        if (getImageViewerZoom(imageViewerIndex) > IMAGE_VIEWER_ZOOM_MIN + 0.01) return;

        const t = e.touches?.[0];
        if (!t) return;
        const dx = t.clientX - tx0;
        const dy = t.clientY - ty0;
        if (!previewingSwipe) {
          if (Math.abs(dx) < 6) return;
          if (Math.abs(dx) <= Math.abs(dy) * 1.05) return;
          previewingSwipe = true;
        }
        lastDx = dx;
        updateImageViewerSingleSwipePreview(dx);
        e.preventDefault();
      }, { passive: false });
      singleWrap.addEventListener('touchend', (e) => {
        const wasPanning = imageViewerPanState?.pointerType === 'touch';
        if (wasPanning) {
          endImageViewerPan();
          if (handleImageViewerDoubleTapReset(e)) return;
        }
        if (!tracking) return; tracking = false;
        if (imageViewerPinchState || Date.now() < imageViewerPinchSuppressUntil) return;
        if (Date.now() < imageViewerPanSuppressUntil) {
          handleImageViewerDoubleTapReset(e);
          return;
        }
        if (getImageViewerZoom(imageViewerIndex) > IMAGE_VIEWER_ZOOM_MIN + 0.01) return;
        const t = e.changedTouches?.[0];
        const dx = Number.isFinite(lastDx) ? lastDx : (t ? t.clientX - tx0 : 0);
        const dy = t ? t.clientY - ty0 : 0;

        if (previewingSwipe) {
          previewingSwipe = false;
          const width = Math.max(1, Number(singleWrap.clientWidth || 0));
          const threshold = Math.max(42, width * 0.2);
          const direction = dx < 0 ? 1 : -1;
          const canShift = direction === 1
            ? imageViewerIndex < imageViewerItems.length - 1
            : imageViewerIndex > 0;

          setImageViewerSingleSwipeTransition(true);
          if (Math.abs(dx) >= threshold && canShift) {
            const finalDx = direction === 1 ? -width : width;
            imageViewerSingleSwipeAnimating = true;
            updateImageViewerSingleSwipePreview(finalDx);
            window.setTimeout(() => {
              imageViewerSingleSwipeAnimating = false;
              imageViewerIndex = Math.max(0, Math.min(imageViewerItems.length - 1, imageViewerIndex + direction));
              setImageViewerSingleSwipeTransition(false);
              renderImageViewerSingle();
            }, 220);
          } else {
            updateImageViewerSingleSwipePreview(0);
            window.setTimeout(() => {
              setImageViewerSingleSwipeTransition(false);
              resetImageViewerSingleSwipePreview();
            }, 220);
          }
          lastDx = 0;
          return;
        }

        if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.1) return;
        shiftImageViewer(dx < 0 ? 1 : -1);
      }, { passive: true });
      singleWrap.addEventListener('click', (e) => {
        if (imageViewerMode !== 'single' || !imageViewerItems.length) return;
        if (window.matchMedia('(max-width:720px)').matches) return;
        if (Date.now() < imageViewerPinchSuppressUntil) return;
        if (Date.now() < imageViewerPanSuppressUntil) return;
        if (getImageViewerZoom(imageViewerIndex) > IMAGE_VIEWER_ZOOM_MIN + 0.01) return;
        const rect = singleWrap.getBoundingClientRect();
        const offsetX = Number(e.clientX) - rect.left;
        if (!Number.isFinite(offsetX)) return;
        const direction = offsetX < rect.width / 2 ? -1 : 1;
        shiftImageViewer(direction);
      });
      singleWrap.addEventListener('dblclick', (e) => {
        const targetInfo = findImageViewerTarget(e);
        if (!targetInfo) return;
        e.preventDefault();
        resetImageViewerTransform(targetInfo.index, targetInfo.imgEl);
      });
      singleWrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const targetInfo = findImageViewerTarget(e);
        if (!targetInfo) return;
        if (!beginImageViewerPan(targetInfo, e.clientX, e.clientY, 'mouse')) return;
        e.preventDefault();
      });
      singleWrap.addEventListener('keydown', (e) => {
        if (imageViewerMode !== 'single') return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          shiftImageViewer(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          shiftImageViewer(1);
        }
      });
      singleWrap.addEventListener('wheel', handleImageViewerWheelZoom, { passive: false });
      singleWrap.addEventListener('touchstart', startImageViewerPinch, { passive: false });
      singleWrap.addEventListener('touchmove', moveImageViewerPinch, { passive: false });
      singleWrap.addEventListener('touchend', endImageViewerPinch, { passive: true });
      singleWrap.addEventListener('touchcancel', endImageViewerPinch, { passive: true });
    }

    // 滚动面板：滚动时同步标题计数
    if (scrollPane && !scrollPane.dataset.ivBound) {
      scrollPane.dataset.ivBound = '1';
      scrollPane.addEventListener('click', (e) => {
        const itemEl = e.target?.closest?.('.image-viewer-item');
        if (!itemEl) return;
        const idx = Number(itemEl.dataset.imageIndex);
        if (!Number.isFinite(idx) || idx < 0 || idx >= imageViewerItems.length) return;
        if (idx === imageViewerIndex) return;
        imageViewerIndex = idx;
        updateImageViewerTitle();
      });
      scrollPane.addEventListener('scroll', () => {
        if (imageViewerScrollRaf) cancelAnimationFrame(imageViewerScrollRaf);
        imageViewerScrollRaf = requestAnimationFrame(() => {
          imageViewerScrollRaf = null;
          syncImageViewerIndexByScroll();
        });
      }, { passive: true });
      scrollPane.addEventListener('touchstart', (e) => {
        if (e.touches?.length !== 1) return;
        const t = e.touches?.[0];
        const targetInfo = findImageViewerTarget(e);
        if (!t || !targetInfo) return;
        if (!canImageViewerPanTarget(targetInfo)) return;
        if (beginImageViewerPan(targetInfo, t.clientX, t.clientY, 'touch')) {
          e.preventDefault();
        }
      }, { passive: false });
      scrollPane.addEventListener('touchmove', (e) => {
        if (e.touches?.length !== 1) return;
        if (imageViewerPinchState) return;
        if (imageViewerPanState?.pointerType !== 'touch') return;
        const t = e.touches?.[0];
        if (!t) return;
        moveImageViewerPan(t.clientX, t.clientY);
        e.preventDefault();
      }, { passive: false });
      scrollPane.addEventListener('touchend', (e) => {
        const itemEl = e.target?.closest?.('.image-viewer-item');
        if (itemEl) {
          const idx = Number(itemEl.dataset.imageIndex);
          if (Number.isFinite(idx) && idx >= 0 && idx < imageViewerItems.length) {
            imageViewerIndex = idx;
            updateImageViewerTitle();
          }
        }
        if (imageViewerPanState?.pointerType === 'touch') {
          endImageViewerPan();
        }
        handleImageViewerDoubleTapReset(e);
      }, { passive: true });
      scrollPane.addEventListener('dblclick', (e) => {
        const targetInfo = findImageViewerTarget(e);
        if (!targetInfo) return;
        e.preventDefault();
        resetImageViewerTransform(targetInfo.index, targetInfo.imgEl);
      });
      scrollPane.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const targetInfo = findImageViewerTarget(e);
        if (!targetInfo) return;
        if (!canImageViewerPanTarget(targetInfo)) return;
        if (!beginImageViewerPan(targetInfo, e.clientX, e.clientY, 'mouse')) return;
        e.preventDefault();
      });
      scrollPane.addEventListener('wheel', handleImageViewerWheelZoom, { passive: false });
      scrollPane.addEventListener('touchstart', startImageViewerPinch, { passive: false });
      scrollPane.addEventListener('touchmove', moveImageViewerPinch, { passive: false });
      scrollPane.addEventListener('touchend', endImageViewerPinch, { passive: true });
      scrollPane.addEventListener('touchcancel', endImageViewerPinch, { passive: true });
    }

    if (!document.body.dataset.ivMousePanBound) {
      document.body.dataset.ivMousePanBound = '1';
      window.addEventListener('mousemove', (e) => {
        if (imageViewerPanState?.pointerType !== 'mouse') return;
        moveImageViewerPan(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', () => {
        if (imageViewerPanState?.pointerType === 'mouse') endImageViewerPan();
      });
      window.addEventListener('blur', () => {
        endImageViewerPan();
      });
    }
  }

  function updateVideoViewerNavButtons() {
    const prevBtn = document.getElementById('videoViewerPrevBtn');
    const nextBtn = document.getElementById('videoViewerNextBtn');
    const countEl = document.getElementById('videoViewerPlaylistCount');
    const hasPlaylist = videoViewerPlaylist.length > 1;
    const hasPrev = hasPlaylist && videoViewerPlaylistIndex > 0;
    const hasNext = hasPlaylist && videoViewerPlaylistIndex >= 0 && videoViewerPlaylistIndex < videoViewerPlaylist.length - 1;
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
    if (countEl) countEl.textContent = `共 ${videoViewerPlaylist.length} 集`;
  }

  function escapeVideoHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderVideoViewerPlaylistPanel() {
    const listEl = document.getElementById('videoViewerPlaylist');
    if (!listEl) return;
    if (!videoViewerPlaylist.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🎬</div><p>暂无可播放选集</p></div>';
      return;
    }
    listEl.innerHTML = videoViewerPlaylist.map((episode, idx) => {
      const episodeNoRaw = Number(episode?.episodeNo);
      const episodeNo = Number.isFinite(episodeNoRaw) && episodeNoRaw > 0 ? Math.floor(episodeNoRaw) : 0;
      const noText = episodeNo > 0 ? `第 ${episodeNo} 集` : `第 ${idx + 1} 集`;
      const title = escapeVideoHtml(episode?.title || `视频 ${idx + 1}`);
      const activeClass = idx === videoViewerPlaylistIndex ? ' is-active' : '';
      return `
        <button class="video-episode-item${activeClass}" type="button" data-video-index="${idx}" title="${title}">
          <span class="video-episode-left">
            <span class="video-episode-no">${noText}</span>
            <span class="video-episode-name">${title}</span>
          </span>
          <span class="video-episode-status">${idx === videoViewerPlaylistIndex ? '播放中' : '播放'}</span>
        </button>`;
    }).join('');
  }

  function bindVideoViewerPlaylistInteractions() {
    const listEl = document.getElementById('videoViewerPlaylist');
    if (!listEl || listEl.dataset.bound === '1') return;
    listEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.video-episode-item');
      if (!btn) return;
      const idx = Number(btn.dataset.videoIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= videoViewerPlaylist.length) return;
      if (idx === videoViewerPlaylistIndex) return;
      const videoEl = document.getElementById('videoViewerEl');
      if (videoEl) saveLastPlayedVideoThumbnail(activeVideoViewerItemId, videoEl);
      playVideoViewerAtIndex(idx, true);
    });
    listEl.dataset.bound = '1';
  }

  function isVideoElementFullscreen(videoEl) {
    if (!videoEl) return false;
    const doc = document;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || null;
    if (fsEl && (fsEl === videoEl || fsEl.contains(videoEl))) return true;
    if (typeof videoEl.webkitDisplayingFullscreen === 'boolean' && videoEl.webkitDisplayingFullscreen) return true;
    return false;
  }

  function getNormalizedVideoListForViewer(currentItem) {
    const source = Array.isArray(getFilteredVideoList()) ? getFilteredVideoList() : [];
    const sorted = [...source].sort((a, b) => {
      const ta = new Date(a?.uploadedAt || 0).getTime();
      const tb = new Date(b?.uploadedAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(a?.title || '').localeCompare(String(b?.title || ''));
    });
    const map = new Map();
    sorted.forEach((item) => {
      const id = String(item?.id || '').trim();
      if (!id || map.has(id)) return;
      map.set(id, item);
    });
    const current = currentItem && typeof currentItem === 'object' ? currentItem : null;
    const currentId = String(current?.id || '').trim();
    if (currentId && !map.has(currentId)) map.set(currentId, current);
    return [...map.values()];
  }

  function shiftVideoViewerFromGlobalList(step) {
    const current = getCurrentVideoViewerItem();
    if (!current) return;
    const list = getNormalizedVideoListForViewer(current);
    if (!list.length) return;
    const currentId = String(current?.id || '').trim();
    const idx = list.findIndex(item => String(item?.id || '').trim() === currentId);
    if (idx < 0) return;
    const nextIdx = idx + Number(step || 0);
    if (nextIdx < 0 || nextIdx >= list.length) return;
    const videoEl = document.getElementById('videoViewerEl');
    if (videoEl) saveLastPlayedVideoThumbnail(activeVideoViewerItemId, videoEl);
    openVideoViewer(list[nextIdx]);
  }

  function clearVideoGestureLongPressTimer() {
    if (videoGestureLongPressTimer) {
      clearTimeout(videoGestureLongPressTimer);
      videoGestureLongPressTimer = null;
    }
  }

  function releaseVideoGestureLongPressRate(videoEl) {
    if (!videoEl || !videoGestureLongPressActive) return;
    videoGestureLongPressActive = false;
    const safeRate = Number.isFinite(videoGestureBasePlaybackRate) && videoGestureBasePlaybackRate > 0
      ? videoGestureBasePlaybackRate
      : 1;
    videoEl.playbackRate = safeRate;
  }

  function applyVideoBrightness(videoEl, value) {
    if (!videoEl) return;
    const next = Math.max(0.3, Math.min(1.25, Number(value) || 1));
    videoGestureBrightness = next;
    videoEl.style.filter = `brightness(${next.toFixed(3)})`;
  }

  function handleVideoViewerDoubleTap(videoEl) {
    if (!videoEl) return;
    if (videoEl.paused) {
      tryPlayVideoElement(videoEl, getCurrentVideoViewerItem());
      return;
    }
    videoEl.pause();
  }

  function isVideoGestureTarget(target, videoEl) {
    if (!videoEl || !target) return false;
    const doc = document;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || null;
    if (isVideoElementFullscreen(videoEl)) {
      if (fsEl && typeof fsEl.contains === 'function' && fsEl.contains(target)) return true;
      if (target === videoEl) return true;
      return false;
    }
    return target === videoEl;
  }

  function pickTrackingTouch(touchList, touchId) {
    if (!touchList || !touchList.length) return null;
    if (touchId === null || touchId === undefined) return touchList[0] || null;
    for (let i = 0; i < touchList.length; i += 1) {
      const touch = touchList[i];
      if (touch && touch.identifier === touchId) return touch;
    }
    return null;
  }

  function bindVideoViewerGestureInteractions() {
    const videoEl = document.getElementById('videoViewerEl');
    if (!videoEl || videoEl.dataset.gestureBound === '1') return;
    videoEl.style.webkitTouchCallout = 'none';
    videoEl.style.userSelect = 'none';
    videoEl.style.touchAction = 'none';

    videoEl.addEventListener('contextmenu', (event) => {
      if (!isVideoViewerOpen()) return;
      event.preventDefault();
    });

    document.addEventListener('touchstart', (event) => {
      if (!isVideoViewerOpen()) return;
      if (!isVideoGestureTarget(event.target, videoEl)) return;
      const touch = pickTrackingTouch(event.touches, null);
      if (!touch) return;
      videoGestureTouchIdentifier = touch.identifier;
      videoGestureTouchStartX = touch.clientX;
      videoGestureTouchStartY = touch.clientY;
      videoGestureTouchStartTime = Date.now();
      videoGestureTracking = true;
      videoGestureMoved = false;
      clearVideoGestureLongPressTimer();
      releaseVideoGestureLongPressRate(videoEl);

      if (event.touches.length !== 1 || !isVideoElementFullscreen(videoEl)) return;
      clearVideoGestureLongPressTimer();
      videoGestureLongPressTimer = setTimeout(() => {
        if (!videoGestureTracking || videoGestureMoved || !isVideoElementFullscreen(videoEl)) return;
        videoGestureLongPressActive = true;
        videoGestureBasePlaybackRate = Number(videoEl.playbackRate) > 0 ? Number(videoEl.playbackRate) : 1;
        videoEl.playbackRate = Math.max(2, videoGestureBasePlaybackRate);
      }, VIDEO_GESTURE_LONG_PRESS_MS);
    }, { passive: true, capture: true });

    document.addEventListener('touchmove', (event) => {
      if (!videoGestureTracking) return;
      const touch = pickTrackingTouch(event.touches, videoGestureTouchIdentifier);
      if (!touch) return;
      const dx = touch.clientX - videoGestureTouchStartX;
      const dy = touch.clientY - videoGestureTouchStartY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (ax > VIDEO_GESTURE_TAP_MOVE_THRESHOLD || ay > VIDEO_GESTURE_TAP_MOVE_THRESHOLD) {
        videoGestureMoved = true;
        clearVideoGestureLongPressTimer();
      }

      if (!isVideoElementFullscreen(videoEl)) return;
      if (ay < VIDEO_GESTURE_VERTICAL_THRESHOLD || ay <= ax * VIDEO_GESTURE_AXIS_LOCK_RATIO) return;

      event.preventDefault();
      releaseVideoGestureLongPressRate(videoEl);
      const height = Math.max(videoEl.clientHeight || 0, 120);
      const ratio = Math.min(1, ay / height);
      const direction = dy < 0 ? 1 : -1;
      const onLeft = videoGestureTouchStartX <= (videoEl.clientWidth || 0) / 2;

      if (onLeft) {
        applyVideoBrightness(videoEl, videoGestureBrightness + direction * ratio * (VIDEO_GESTURE_BRIGHTNESS_STEP * height));
      } else {
        const nextVolume = Math.max(0, Math.min(1, Number(videoEl.volume || 0) + direction * ratio * (VIDEO_GESTURE_VOLUME_STEP * height)));
        videoEl.volume = nextVolume;
      }

      videoGestureTouchStartX = touch.clientX;
      videoGestureTouchStartY = touch.clientY;
      videoGestureTouchStartTime = Date.now();
    }, { passive: false, capture: true });

    document.addEventListener('touchend', (event) => {
      const touch = pickTrackingTouch(event.changedTouches, videoGestureTouchIdentifier);
      const wasTracking = videoGestureTracking;
      videoGestureTracking = false;
      videoGestureTouchIdentifier = null;
      clearVideoGestureLongPressTimer();
      if (!touch || !wasTracking) {
        releaseVideoGestureLongPressRate(videoEl);
        return;
      }

      const now = Date.now();
      const dx = touch.clientX - videoGestureTouchStartX;
      const dy = touch.clientY - videoGestureTouchStartY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const isFullscreen = isVideoElementFullscreen(videoEl);

      if (videoGestureLongPressActive) {
        releaseVideoGestureLongPressRate(videoEl);
        return;
      }

      if (!isFullscreen) {
        if (ay >= VIDEO_GESTURE_VERTICAL_THRESHOLD && ay > ax * VIDEO_GESTURE_AXIS_LOCK_RATIO) {
          if (dy < 0) shiftVideoViewerFromGlobalList(1);
          else shiftVideoViewerFromGlobalList(-1);
        }
        return;
      }

      const tapDuration = now - videoGestureTouchStartTime;
      const isTap = !videoGestureMoved && ax <= VIDEO_GESTURE_TAP_MOVE_THRESHOLD && ay <= VIDEO_GESTURE_TAP_MOVE_THRESHOLD && tapDuration <= 260;
      if (!isTap) return;
      if (now - videoGestureLastTapAt <= VIDEO_GESTURE_DOUBLE_TAP_MS) {
        videoGestureLastTapAt = 0;
        event.preventDefault();
        handleVideoViewerDoubleTap(videoEl);
        return;
      }
      videoGestureLastTapAt = now;
    }, { passive: false, capture: true });

    document.addEventListener('touchcancel', () => {
      videoGestureTracking = false;
      videoGestureTouchIdentifier = null;
      videoGestureMoved = false;
      clearVideoGestureLongPressTimer();
      releaseVideoGestureLongPressRate(videoEl);
    }, { passive: true, capture: true });

    videoEl.addEventListener('dblclick', (event) => {
      if (!isVideoViewerOpen()) return;
      if (!isVideoElementFullscreen(videoEl)) return;
      event.preventDefault();
      handleVideoViewerDoubleTap(videoEl);
    });

    videoEl.addEventListener('fullscreenchange', () => {
      videoGestureTracking = false;
      videoGestureTouchIdentifier = null;
      releaseVideoGestureLongPressRate(videoEl);
    });
    videoEl.addEventListener('webkitfullscreenchange', () => {
      videoGestureTracking = false;
      videoGestureTouchIdentifier = null;
      releaseVideoGestureLongPressRate(videoEl);
    });

    videoEl.dataset.gestureBound = '1';
  }

  function syncVideoViewerSize(videoEl = null) {
    const el = videoEl || document.getElementById('videoViewerEl');
    const stage = document.querySelector('#videoViewerModal .video-stage-wrap');
    if (!el || !stage) return;

    const vw = Math.max(1, Number(el.videoWidth || 0));
    const vh = Math.max(1, Number(el.videoHeight || 0));
    if (!vw || !vh) {
      stage.style.removeProperty('--vvw');
      stage.style.removeProperty('--vvh');
      return;
    }

    const ratio = vw / vh;
    const stageWidth = Math.max(1, Number(stage.clientWidth || 0));
    const stageRect = stage.getBoundingClientRect();
    const viewportH = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720);
    const reservedH = Math.max(120, viewportH - Number(stageRect.height || 0));
    const maxVideoH = Math.min(760, Math.max(220, viewportH - reservedH - 28));
    const fitByHeightW = maxVideoH * ratio;

    let finalW = stageWidth;
    let finalH = stageWidth / ratio;
    if (finalH > maxVideoH) {
      finalH = maxVideoH;
      finalW = fitByHeightW;
    }

    stage.style.setProperty('--vvw', `${Math.max(120, Math.round(finalW))}px`);
    stage.style.setProperty('--vvh', `${Math.max(90, Math.round(finalH))}px`);
  }

  function playVideoViewerAtIndex(index, autoPlay = true) {
    const modal = document.getElementById('videoViewerModal');
    const videoEl = document.getElementById('videoViewerEl');
    const titleEl = document.getElementById('videoViewerTitle');
    const mainTitleEl = document.getElementById('videoViewerMainTitle');
    const subMetaEl = document.getElementById('videoViewerSubMeta');
    const badgeEl = document.getElementById('videoViewerEpisodeBadge');
    if (!modal || !videoEl || !titleEl || !videoViewerPlaylist.length) return;
    const safeIndex = Math.max(0, Math.min(videoViewerPlaylist.length - 1, Number(index) || 0));
    const currentItem = videoViewerPlaylist[safeIndex];
    if (!currentItem) return;
    videoViewerPlaylistIndex = safeIndex;
    activeVideoViewerItemId = String(currentItem?.id || '').trim();
    const epNo = Number(currentItem?.episodeNo);
    const hasEpNo = Number.isFinite(epNo) && epNo > 0;
    const episodeText = hasEpNo ? ` 第${Math.floor(epNo)}集` : '';
    const totalText = `${safeIndex + 1}/${videoViewerPlaylist.length}`;
    const seriesName = String(currentItem?.seriesName || '').trim();
    const headerTitle = seriesName || '视频播放';
    titleEl.textContent = headerTitle;
    if (mainTitleEl) mainTitleEl.textContent = `${currentItem.title || '视频'}${episodeText}`;
    const uploadTimeRaw = new Date(currentItem?.uploadedAt || 0).getTime();
    const uploadTimeText = Number.isFinite(uploadTimeRaw) && uploadTimeRaw > 0
      ? new Date(uploadTimeRaw).toLocaleString()
      : '未知时间';
    if (subMetaEl) subMetaEl.textContent = `${seriesName || '单集视频'} · 第 ${safeIndex + 1} 条 · 上传于 ${uploadTimeText}`;
    if (badgeEl) badgeEl.textContent = totalText;
    videoEl.preload = 'metadata';
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.poster = String(currentItem?.poster || currentItem?.cover || '').trim();
    const mimeType = getVideoMimeTypeByUrl(currentItem?.url || '');
    if (mimeType && typeof videoEl.canPlayType === 'function' && videoEl.canPlayType(mimeType) === '') {
      showVideoPlaybackErrorTip(currentItem, 'NotSupportedError');
    }
    if (videoEl.src !== currentItem.url) {
      videoEl.src = currentItem.url;
      videoEl.load();
    }
    syncVideoViewerSize(videoEl);
    persistVideoViewHistory(currentItem, videoEl);
    updateVideoViewerNavButtons();
    renderVideoViewerPlaylistPanel();
    if (autoPlay) {
      tryPlayVideoElement(videoEl, currentItem);
    }
  }

  function shiftVideoViewer(step) {
    if (!videoViewerPlaylist.length) return;
    const next = videoViewerPlaylistIndex + Number(step || 0);
    if (next < 0 || next >= videoViewerPlaylist.length) return;
    const videoEl = document.getElementById('videoViewerEl');
    if (videoEl) saveLastPlayedVideoThumbnail(activeVideoViewerItemId, videoEl);
    playVideoViewerAtIndex(next, true);
  }

  function openVideoViewer(item) {
    const modal = document.getElementById('videoViewerModal');
    const videoEl = document.getElementById('videoViewerEl');
    const titleEl = document.getElementById('videoViewerTitle');
    if (!modal || !videoEl || !titleEl) return;
    const sourceList = getFilteredVideoList();
    const targetSeries = normalizeVideoSeriesKey(getVideoSeriesValue(item));
    if (targetSeries) {
      videoViewerPlaylist = sortVideoSeriesEpisodes(sourceList.filter(v => normalizeVideoSeriesKey(getVideoSeriesValue(v)) === targetSeries));
    } else {
      const unarchivedList = sourceList.filter((video) => !normalizeVideoSeriesKey(getVideoSeriesValue(video)));
      const sortedUnarchived = [...unarchivedList].sort((a, b) => {
        const ta = new Date(a?.uploadedAt || 0).getTime();
        const tb = new Date(b?.uploadedAt || 0).getTime();
        if (ta !== tb) return tb - ta;
        return String(a?.title || '').localeCompare(String(b?.title || ''));
      });
      videoViewerPlaylist = sortedUnarchived.length ? sortedUnarchived : [item];
    }
    if (!videoViewerPlaylist.length) videoViewerPlaylist = [item];
    const currentIndex = videoViewerPlaylist.findIndex(v => String(v?.id || '') === String(item?.id || ''));
    videoViewerPlaylistIndex = currentIndex >= 0 ? currentIndex : 0;
    bindVideoViewerGestureInteractions();
    bindVideoViewerPlaylistInteractions();
    renderVideoViewerPlaylistPanel();
    videoHistoryLastPersistAt = 0;
    videoEl.ontimeupdate = () => {
      const now = Date.now();
      if (now - videoHistoryLastPersistAt < 2400) return;
      videoHistoryLastPersistAt = now;
      const currentItem = getCurrentVideoViewerItem();
      if (!currentItem) return;
      persistVideoViewHistory(currentItem, videoEl);
    };
    videoEl.onpause = () => {
      const currentItem = getCurrentVideoViewerItem();
      if (!currentItem) return;
      persistVideoViewHistory(currentItem, videoEl);
    };
    videoEl.onended = () => {
      saveLastPlayedVideoThumbnail(activeVideoViewerItemId, videoEl);
      const currentItem = getCurrentVideoViewerItem();
      if (currentItem) persistVideoViewHistory(currentItem, videoEl);
      if (videoViewerPlaylistIndex >= 0 && videoViewerPlaylistIndex < videoViewerPlaylist.length - 1) {
        playVideoViewerAtIndex(videoViewerPlaylistIndex + 1, true);
        return;
      }
      if (currentView === 'videos') renderVideosFromCache();
    };
    videoEl.onerror = () => {
      const currentItem = getCurrentVideoViewerItem();
      showVideoPlaybackErrorTip(currentItem, 'NotSupportedError');
      tryOpenVideoExternally(currentItem);
    };
    videoEl.onloadedmetadata = () => {
      syncVideoViewerSize(videoEl);
    };
    if (!window.__videoViewerResizeBound) {
      window.__videoViewerResizeBound = true;
      window.addEventListener('resize', () => {
        if (!isVideoViewerOpen()) return;
        syncVideoViewerSize();
      });
    }
    modal.style.display = 'flex';
    playVideoViewerAtIndex(videoViewerPlaylistIndex, true);
    document.body.style.overflow = 'hidden';
    if (!videoViewerOpenedByHistory) {
      history.pushState({ videoViewer: true }, '', '');
      videoViewerOpenedByHistory = true;
    }
  }

  function closeVideoViewer(fromPopState = false) {
    const modal = document.getElementById('videoViewerModal');
    const videoEl = document.getElementById('videoViewerEl');
    const playlistEl = document.getElementById('videoViewerPlaylist');
    const countEl = document.getElementById('videoViewerPlaylistCount');
    const titleEl = document.getElementById('videoViewerTitle');
    const mainTitleEl = document.getElementById('videoViewerMainTitle');
    const subMetaEl = document.getElementById('videoViewerSubMeta');
    const badgeEl = document.getElementById('videoViewerEpisodeBadge');
    if (videoEl) {
      saveLastPlayedVideoThumbnail(activeVideoViewerItemId, videoEl);
      const currentItem = getCurrentVideoViewerItem();
      if (currentItem) persistVideoViewHistory(currentItem, videoEl);
      clearVideoGestureLongPressTimer();
      releaseVideoGestureLongPressRate(videoEl);
      videoEl.onended = null;
      videoEl.ontimeupdate = null;
      videoEl.onpause = null;
      videoEl.onerror = null;
      videoEl.onloadedmetadata = null;
      videoEl.pause();
      videoEl.src = '';
    }
    if (playlistEl) playlistEl.innerHTML = '';
    if (countEl) countEl.textContent = '0';
    if (titleEl) titleEl.textContent = '视频播放';
    if (mainTitleEl) mainTitleEl.textContent = '视频';
    if (subMetaEl) subMetaEl.textContent = '准备播放…';
    if (badgeEl) badgeEl.textContent = '--/--';
    activeVideoViewerItemId = '';
    videoViewerPlaylist = [];
    videoViewerPlaylistIndex = -1;
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    const shouldBack = videoViewerOpenedByHistory && !fromPopState;
    videoViewerOpenedByHistory = false;
    if (currentView === 'videos') renderVideosFromCache();
    if (shouldBack) history.back();
  }

  function isImageViewerOpen() {
    const modal = document.getElementById('imageViewerModal');
    return !!modal && modal.style.display !== 'none';
  }

  function isVideoViewerOpen() {
    const modal = document.getElementById('videoViewerModal');
    return !!modal && modal.style.display !== 'none';
  }

  async function deleteMediaItem(ctx) {
    const { e, kind, id, showToast, reloadImages, reloadVideos } = ctx || {};
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm('确定删除该文件吗？')) return;
    try {
      const base = kind === 'image' ? '/api/images/' : '/api/videos/';
      const resp = await fetch(base + encodeURIComponent(id), { method: 'DELETE' });
      if (!resp.ok) throw new Error('删除失败');
      if (kind === 'image' && typeof reloadImages === 'function') await reloadImages();
      if (kind === 'video' && typeof reloadVideos === 'function') await reloadVideos();
      if (typeof showToast === 'function') showToast('删除成功', 'success');
    } catch {
      if (typeof showToast === 'function') showToast('删除失败', 'error');
    }
  }

  function getImageBatchToast() {
    return typeof lastImageLoadCtx?.showToast === 'function' ? lastImageLoadCtx.showToast : null;
  }

  function showImageBatchToast(msg, type) {
    const fn = getImageBatchToast();
    if (fn) fn(msg, type);
  }

  function escText(value) {
    const raw = String(value ?? '');
    const esc = typeof lastImageLoadCtx?.esc === 'function' ? lastImageLoadCtx.esc : null;
    if (esc) return esc(raw);
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateImageDuplicateButton() {
    const btn = document.getElementById('imageDuplicateBtn');
    if (!btn) return;
    const groupCount = buildImageDuplicateGroups().length;
    btn.textContent = groupCount > 0 ? `🔍 图片查重（${groupCount}组）` : '🔍 图片查重';
  }

  function buildImageDuplicateGroups() {
    const exactGroups = Array.isArray(imageDuplicateResult.exactGroups) ? imageDuplicateResult.exactGroups : [];
    const groups = exactGroups
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
    return groups;
  }

  function getImageDuplicateSelectableIds() {
    if (imageDuplicateIgnoredView) {
      return (imageDuplicateResult.ignoredItems || []).map(item => String(item.id || '')).filter(Boolean);
    }
    return buildImageDuplicateGroups().flatMap(group => group.ids);
  }

  function syncImageDuplicateSelected() {
    const valid = new Set(getImageDuplicateSelectableIds());
    [...imageDuplicateSelected].forEach(id => {
      if (!valid.has(id)) imageDuplicateSelected.delete(id);
    });
  }

  function updateImageDuplicateControls() {
    const ignoredBtn = document.getElementById('imageDuplicateIgnoredBtn');
    const restoreBtn = document.getElementById('imageDuplicateRestoreBtn');
    const keepLatestBtn = document.getElementById('imageDuplicateKeepLatestBtn');
    const deleteBtn = document.getElementById('imageDuplicateDeleteBtn');
    const cancelBtn = document.getElementById('imageDuplicateCancelBtn');
    if (ignoredBtn) {
      ignoredBtn.textContent = imageDuplicateIgnoredView ? '🧾 返回查重结果' : '📦 查看已忽略列表';
    }

    const selectedCount = imageDuplicateSelected.size;
    const restoreVisible = imageDuplicateIgnoredView;
    if (restoreBtn) {
      restoreBtn.style.display = restoreVisible ? '' : 'none';
      restoreBtn.textContent = imageDuplicateSelectMode === 'restore'
        ? `↩ 恢复已选（${selectedCount}）`
        : '↩ 恢复忽略';
    }

    if (keepLatestBtn) {
      keepLatestBtn.style.display = imageDuplicateIgnoredView ? 'none' : '';
      keepLatestBtn.disabled = imageDuplicateLoading;
    }

    if (deleteBtn) {
      deleteBtn.textContent = imageDuplicateSelectMode === 'delete'
        ? `🗑 删除已选（${selectedCount}）`
        : '🗑 批量删除';
    }

    if (cancelBtn) {
      cancelBtn.style.display = imageDuplicateSelectMode ? '' : 'none';
    }
  }

  function renderImageDuplicatePanel() {
    const panel = document.getElementById('imageDuplicatePanel');
    const listEl = document.getElementById('imageDuplicateList');
    const titleEl = document.getElementById('imageDuplicatePanelTitle');
    if (!panel || !listEl || !titleEl) return;
    panel.style.display = imageDuplicatePanelVisible ? '' : 'none';
    if (!imageDuplicatePanelVisible) return;
    updateImageDuplicateControls();

    if (imageDuplicateLoading) {
      titleEl.textContent = '图片查重 · 分析中…';
      listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>正在分析完全一致的重复图片，请稍候…</p></div>';
      return;
    }

    const exactGroups = Array.isArray(imageDuplicateResult.exactGroups) ? imageDuplicateResult.exactGroups : [];
    const duplicateGroups = buildImageDuplicateGroups();
    const ignoredItems = Array.isArray(imageDuplicateResult.ignoredItems) ? imageDuplicateResult.ignoredItems : [];
    const ignoredCount = Number(imageDuplicateResult.ignoredCount || 0);
    if (imageDuplicateIgnoredView) titleEl.textContent = `已忽略列表 · ${ignoredItems.length} 张`;
    else titleEl.textContent = `图片查重 · 重复分组 ${duplicateGroups.length} 组 · 已忽略 ${ignoredCount}`;

    if (imageDuplicateIgnoredView) {
      if (!ignoredItems.length) {
        listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前没有已忽略图片</p></div>';
        return;
      }
      const rows = ignoredItems.map((item, idx) => {
        const id = escText(item?.id || '');
        const cover = escText(item?.cover || item?.url || '');
        const title = escText(item?.title || item?.originalName || '未命名图片');
        const selected = imageDuplicateSelected.has(String(item?.id || ''));
        return `
          <div class="duplicate-row image-dup-row">
            <img class="image-dup-cover" src="${cover}" alt="${title}">
            <div class="duplicate-titles">
              <div><strong>已忽略 #${idx + 1}</strong></div>
              <div>${title}</div>
              <div class="image-dup-meta">上传时间 ${escText(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
            </div>
            <div class="image-dup-actions">
              ${imageDuplicateSelectMode === 'restore' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="MediaFeature.toggleImageDuplicateSelection('${id}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.openImageDuplicateItem('${id}')">查看</button>
              <button class="clear-btn" onclick="MediaFeature.restoreImageDuplicateIds('${encodeURIComponent(String(item?.id || ''))}')">恢复</button>
            </div>
          </div>`;
      }).join('');
      listEl.innerHTML = rows;
      return;
    }

    if (!duplicateGroups.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前未发现重复图片</p></div>';
      return;
    }

    const groupHtml = duplicateGroups.map((group, idx) => {
      const ids = group.ids || [];
      const encodedIds = encodeURIComponent(ids.join('|'));
      const selectedCount = ids.filter(id => imageDuplicateSelected.has(String(id))).length;
      const groupItems = (group.items || []).map((item, itemIndex) => {
        const id = String(item?.id || '').trim();
        const selected = imageDuplicateSelected.has(id);
        const title = escText(item?.title || item?.originalName || `图片 ${itemIndex + 1}`);
        const cover = escText(item?.cover || item?.url || '');
        return `
          <div class="duplicate-row image-dup-row image-dup-row-item">
            <img class="image-dup-cover" src="${cover}" alt="${title}">
            <div class="duplicate-titles">
              <div><strong>${title}</strong></div>
              <div class="image-dup-meta">${escText(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
            </div>
            <div class="image-dup-actions">
              ${imageDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="MediaFeature.toggleImageDuplicateSelection('${escText(id)}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.openImageDuplicateItem('${escText(id)}')">查看</button>
            </div>
          </div>`;
      }).join('');

      return `
        <section class="image-dup-group">
          <div class="image-dup-group-head">
            <div class="duplicate-score">重复组 #${idx + 1}</div>
            <div class="image-dup-meta">共 ${ids.length} 张</div>
            <div class="image-dup-actions">
              ${imageDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selectedCount === ids.length && ids.length ? ' active' : ''}" onclick="MediaFeature.toggleImageDuplicateSelection('${escText(encodedIds)}', true)">${selectedCount === ids.length && ids.length ? '☑ 组已选' : '☐ 选中整组'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.ignoreImageDuplicateGroup('${encodedIds}')">忽略本组</button>
            </div>
          </div>
          <div class="image-dup-group-list">${groupItems}</div>
        </section>`;
    }).join('');

    listEl.innerHTML = groupHtml;
  }

  async function runImageDuplicateCheck() {
    imageDuplicateLoading = true;
    imageDuplicatePanelVisible = true;
    renderImageDuplicatePanel();
    try {
      const resp = await fetch('/api/images/duplicates');
      if (!resp.ok) throw new Error('查重失败');
      const data = await resp.json();
      imageDuplicateResult = {
        exactGroups: Array.isArray(data.exactGroups) ? data.exactGroups : [],
        similarPairs: Array.isArray(data.similarPairs) ? data.similarPairs : [],
        ignoredItems: Array.isArray(data.ignoredItems) ? data.ignoredItems : [],
        ignoredCount: Number(data.ignoredCount || 0),
        total: Number(data.total || 0)
      };
      syncImageDuplicateSelected();
      updateImageDuplicateButton();
    } catch {
      showImageBatchToast('图片查重失败', 'error');
    } finally {
      imageDuplicateLoading = false;
      renderImageDuplicatePanel();
    }
  }

  async function openImageDuplicateItem(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return;
    let item = imageListCache.find(x => String(x.id || '') === targetId);
    if (!item) {
      try {
        const resp = await fetch('/api/images/' + encodeURIComponent(targetId));
        if (resp.ok) item = await resp.json();
      } catch {}
    }
    if (!item) {
      showImageBatchToast('未找到对应图片', 'error');
      return;
    }
    openImageViewer(item);
  }

  async function ignoreImageDuplicateGroup(encodedIds) {
    const ids = decodeURIComponent(String(encodedIds || ''))
      .split('|')
      .map(x => String(x || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    try {
      const resp = await fetch('/api/images/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ignored: true })
      });
      if (!resp.ok) throw new Error('忽略失败');
      await loadImages(lastImageLoadCtx || {});
      await runImageDuplicateCheck();
      showImageBatchToast(`已忽略 ${ids.length} 张`, 'success');
    } catch {
      showImageBatchToast('忽略失败', 'error');
    }
  }

  async function restoreImageDuplicateIds(encodedIds) {
    const ids = decodeURIComponent(String(encodedIds || ''))
      .split('|')
      .map(x => String(x || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    try {
      const resp = await fetch('/api/images/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ignored: false })
      });
      if (!resp.ok) throw new Error('恢复失败');
      await loadImages(lastImageLoadCtx || {});
      await runImageDuplicateCheck();
      showImageBatchToast(`已恢复 ${ids.length} 张`, 'success');
    } catch {
      showImageBatchToast('恢复失败', 'error');
    }
  }

  function toggleImageDuplicateIgnoredView() {
    imageDuplicateIgnoredView = !imageDuplicateIgnoredView;
    imageDuplicateSelectMode = '';
    imageDuplicateSelected.clear();
    renderImageDuplicatePanel();
  }

  function toggleImageDuplicateSelection(idOrEncoded, encodedGroup = false) {
    const ids = encodedGroup
      ? decodeURIComponent(String(idOrEncoded || '')).split('|').map(x => String(x || '').trim()).filter(Boolean)
      : [String(idOrEncoded || '').trim()].filter(Boolean);
    if (!ids.length) return;
    const allSelected = ids.every(id => imageDuplicateSelected.has(id));
    if (allSelected) ids.forEach(id => imageDuplicateSelected.delete(id));
    else ids.forEach(id => imageDuplicateSelected.add(id));
    renderImageDuplicatePanel();
  }

  function exitImageDuplicateSelectMode() {
    imageDuplicateSelectMode = '';
    imageDuplicateSelected.clear();
    renderImageDuplicatePanel();
  }

  async function batchDeleteImageDuplicateSelected() {
    const ids = [...imageDuplicateSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要删除的图片', 'error');
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 张图片吗？`)) return;
    const tasks = ids.map(id => fetch('/api/images/' + encodeURIComponent(id), { method: 'DELETE' }));
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;
    imageDuplicateSelected.clear();
    imageDuplicateSelectMode = '';
    await loadImages(lastImageLoadCtx || {});
    await runImageDuplicateCheck();
    if (failedCount > 0) showImageBatchToast(`已删除 ${successCount} 张，${failedCount} 张失败`, 'error');
    else showImageBatchToast(`已批量删除 ${successCount} 张`, 'success');
  }

  async function handleImageDuplicateDeleteAction() {
    if (imageDuplicateSelectMode !== 'delete') {
      imageDuplicateSelectMode = 'delete';
      imageDuplicateSelected.clear();
      renderImageDuplicatePanel();
      showImageBatchToast('已进入查重删除模式，请选择后再次点击“批量删除”', '');
      return;
    }
    await batchDeleteImageDuplicateSelected();
  }

  async function handleImageDuplicateRestoreAction() {
    if (!imageDuplicateIgnoredView) {
      imageDuplicateIgnoredView = true;
      imageDuplicateSelectMode = '';
      imageDuplicateSelected.clear();
      renderImageDuplicatePanel();
      return;
    }
    if (imageDuplicateSelectMode !== 'restore') {
      imageDuplicateSelectMode = 'restore';
      imageDuplicateSelected.clear();
      renderImageDuplicatePanel();
      showImageBatchToast('已进入恢复模式，请选择后再次点击“恢复忽略”', '');
      return;
    }
    const ids = [...imageDuplicateSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要恢复的图片', 'error');
      return;
    }
    await restoreImageDuplicateIds(encodeURIComponent(ids.join('|')));
    imageDuplicateSelectMode = '';
    imageDuplicateSelected.clear();
    renderImageDuplicatePanel();
  }

  async function handleImageDuplicateKeepLatestAction() {
    if (imageDuplicateIgnoredView) {
      showImageBatchToast('请先返回查重结果页', 'error');
      return;
    }
    const groups = buildImageDuplicateGroups();
    if (!groups.length) {
      showImageBatchToast('当前没有可处理的重复分组', 'error');
      return;
    }

    const deleteIds = [];
    groups.forEach(group => {
      const items = Array.isArray(group.items) ? group.items : [];
      if (items.length <= 1) return;
      const sorted = [...items].sort((a, b) => {
        const ta = new Date(a?.uploadedAt || 0).getTime();
        const tb = new Date(b?.uploadedAt || 0).getTime();
        if (tb !== ta) return tb - ta;
        return String(b?.id || '').localeCompare(String(a?.id || ''));
      });
      sorted.slice(1).forEach(item => {
        const id = String(item?.id || '').trim();
        if (id) deleteIds.push(id);
      });
    });

    const uniqueDeleteIds = [...new Set(deleteIds)];
    if (!uniqueDeleteIds.length) {
      showImageBatchToast('没有需要删除的旧图片', '');
      return;
    }

    if (!confirm(`将按分组保留最新一张，并删除其余 ${uniqueDeleteIds.length} 张图片，是否继续？`)) return;

    const tasks = uniqueDeleteIds.map(id => fetch('/api/images/' + encodeURIComponent(id), { method: 'DELETE' }));
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = uniqueDeleteIds.length - successCount;

    await loadImages(lastImageLoadCtx || {});
    await runImageDuplicateCheck();
    if (failedCount > 0) showImageBatchToast(`已删除 ${successCount} 张，${failedCount} 张失败`, 'error');
    else showImageBatchToast(`处理完成，已删除 ${successCount} 张旧图片`, 'success');
  }

  function handleImageDuplicateThresholdInput(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    imageDuplicateThreshold = Math.max(1, Math.min(24, Math.floor(next)));
    updateImageDuplicateControls();
    clearTimeout(imageDuplicateThresholdTimer);
    imageDuplicateThresholdTimer = setTimeout(() => {
      if (imageDuplicatePanelVisible) runImageDuplicateCheck();
    }, 220);
  }

  function applyImageDuplicateThreshold(value) {
    handleImageDuplicateThresholdInput(value);
    clearTimeout(imageDuplicateThresholdTimer);
    if (imageDuplicatePanelVisible) runImageDuplicateCheck();
  }

  function toggleImageDuplicatePanel() {
    if (imageDuplicatePanelVisible) {
      imageDuplicatePanelVisible = false;
      renderImageDuplicatePanel();
      return;
    }
    runImageDuplicateCheck();
  }

  function openImageDuplicatePage() {
    imageDuplicatePanelVisible = true;
    renderImageDuplicatePanel();
    runImageDuplicateCheck();
  }

  function hideImageDuplicatePanel() {
    imageDuplicatePanelVisible = false;
    imageDuplicateIgnoredView = false;
    imageDuplicateSelectMode = '';
    imageDuplicateSelected.clear();
    renderImageDuplicatePanel();
  }

  function buildVideoDuplicateGroups() {
    const exactGroups = Array.isArray(videoDuplicateResult.exactGroups) ? videoDuplicateResult.exactGroups : [];
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

  function getVideoDuplicateSelectableIds() {
    if (videoDuplicateIgnoredView) {
      return (videoDuplicateResult.ignoredItems || []).map(item => String(item.id || '')).filter(Boolean);
    }
    return buildVideoDuplicateGroups().flatMap(group => group.ids);
  }

  function syncVideoDuplicateSelected() {
    const valid = new Set(getVideoDuplicateSelectableIds());
    [...videoDuplicateSelected].forEach(id => {
      if (!valid.has(id)) videoDuplicateSelected.delete(id);
    });
  }

  function updateVideoDuplicateControls() {
    const ignoredBtn = document.getElementById('videoDuplicateIgnoredBtn');
    const restoreBtn = document.getElementById('videoDuplicateRestoreBtn');
    const deleteBtn = document.getElementById('videoDuplicateDeleteBtn');
    const cancelBtn = document.getElementById('videoDuplicateCancelBtn');
    if (ignoredBtn) {
      ignoredBtn.textContent = videoDuplicateIgnoredView ? '🧾 返回查重结果' : '📦 查看已忽略列表';
    }
    const selectedCount = videoDuplicateSelected.size;
    if (restoreBtn) {
      restoreBtn.style.display = videoDuplicateIgnoredView ? '' : 'none';
      restoreBtn.textContent = videoDuplicateSelectMode === 'restore'
        ? `↩ 恢复已选（${selectedCount}）`
        : '↩ 恢复忽略';
    }
    if (deleteBtn) {
      deleteBtn.textContent = videoDuplicateSelectMode === 'delete'
        ? `🗑 删除已选（${selectedCount}）`
        : '🗑 批量删除';
    }
    if (cancelBtn) {
      cancelBtn.style.display = videoDuplicateSelectMode ? '' : 'none';
    }
  }

  function renderVideoDuplicatePanel() {
    const panel = document.getElementById('videoDuplicatePanel');
    const listEl = document.getElementById('videoDuplicateList');
    const titleEl = document.getElementById('videoDuplicatePanelTitle');
    if (!panel || !listEl || !titleEl) return;
    panel.style.display = videoDuplicatePanelVisible ? '' : 'none';
    if (!videoDuplicatePanelVisible) return;

    updateVideoDuplicateControls();
    if (videoDuplicateLoading) {
      titleEl.textContent = '视频查重 · 分析中…';
      listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>正在分析重复视频，请稍候…</p></div>';
      return;
    }

    const duplicateGroups = buildVideoDuplicateGroups();
    const ignoredItems = Array.isArray(videoDuplicateResult.ignoredItems) ? videoDuplicateResult.ignoredItems : [];
    const ignoredCount = Number(videoDuplicateResult.ignoredCount || 0);
    if (videoDuplicateIgnoredView) titleEl.textContent = `已忽略列表 · ${ignoredItems.length} 个视频`;
    else titleEl.textContent = `视频查重 · 重复分组 ${duplicateGroups.length} 组 · 已忽略 ${ignoredCount}`;

    if (videoDuplicateIgnoredView) {
      if (!ignoredItems.length) {
        listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前没有已忽略视频</p></div>';
        return;
      }
      const rows = ignoredItems.map((item, idx) => {
        const id = escText(item?.id || '');
        const title = escText(item?.title || item?.originalName || '未命名视频');
        const cover = escText(item?.cover || VIDEO_FALLBACK_POSTER);
        const selected = videoDuplicateSelected.has(String(item?.id || ''));
        return `
          <div class="duplicate-row image-dup-row">
            <img class="image-dup-cover" src="${cover}" alt="${title}" onerror="this.onerror=null;this.src='${VIDEO_FALLBACK_POSTER}'">
            <div class="duplicate-titles">
              <div><strong>已忽略 #${idx + 1}</strong></div>
              <div>${title}</div>
              <div class="image-dup-meta">上传时间 ${escText(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
            </div>
            <div class="image-dup-actions">
              ${videoDuplicateSelectMode === 'restore' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="MediaFeature.toggleVideoDuplicateSelection('${id}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.openVideoDuplicateItem('${id}')">播放</button>
              <button class="clear-btn" onclick="MediaFeature.restoreVideoDuplicateIds('${encodeURIComponent(String(item?.id || ''))}')">恢复</button>
            </div>
          </div>`;
      }).join('');
      listEl.innerHTML = rows;
      return;
    }

    if (!duplicateGroups.length) {
      listEl.innerHTML = '<div class="empty-state" style="padding:1.1rem .8rem"><p>当前未发现重复视频</p></div>';
      return;
    }

    const groupHtml = duplicateGroups.map((group, idx) => {
      const ids = group.ids || [];
      const encodedIds = encodeURIComponent(ids.join('|'));
      const selectedCount = ids.filter(id => videoDuplicateSelected.has(String(id))).length;
      const groupItems = (group.items || []).map((item, itemIndex) => {
        const id = String(item?.id || '').trim();
        const selected = videoDuplicateSelected.has(id);
        const title = escText(item?.title || item?.originalName || `视频 ${itemIndex + 1}`);
        const cover = escText(item?.cover || VIDEO_FALLBACK_POSTER);
        return `
          <div class="duplicate-row image-dup-row image-dup-row-item">
            <img class="image-dup-cover" src="${cover}" alt="${title}" onerror="this.onerror=null;this.src='${VIDEO_FALLBACK_POSTER}'">
            <div class="duplicate-titles">
              <div><strong>${title}</strong></div>
              <div class="image-dup-meta">${escText(item?.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : '-')}</div>
            </div>
            <div class="image-dup-actions">
              ${videoDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selected ? ' active' : ''}" onclick="MediaFeature.toggleVideoDuplicateSelection('${escText(id)}')">${selected ? '☑ 已选' : '☐ 选择'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.openVideoDuplicateItem('${escText(id)}')">播放</button>
            </div>
          </div>`;
      }).join('');

      return `
        <section class="image-dup-group">
          <div class="image-dup-group-head">
            <div class="duplicate-score">重复组 #${idx + 1}</div>
            <div class="image-dup-meta">共 ${ids.length} 个视频</div>
            <div class="image-dup-actions">
              ${videoDuplicateSelectMode === 'delete' ? `<button class="clear-btn image-dup-select-btn${selectedCount === ids.length && ids.length ? ' active' : ''}" onclick="MediaFeature.toggleVideoDuplicateSelection('${escText(encodedIds)}', true)">${selectedCount === ids.length && ids.length ? '☑ 组已选' : '☐ 选中整组'}</button>` : ''}
              <button class="clear-btn" onclick="MediaFeature.ignoreVideoDuplicateGroup('${encodedIds}')">忽略本组</button>
            </div>
          </div>
          <div class="image-dup-group-list">${groupItems}</div>
        </section>`;
    }).join('');

    listEl.innerHTML = groupHtml;
  }

  async function runVideoDuplicateCheck() {
    videoDuplicateLoading = true;
    videoDuplicatePanelVisible = true;
    renderVideoDuplicatePanel();
    try {
      const resp = await fetch('/api/videos/duplicates');
      if (!resp.ok) throw new Error('查重失败');
      const data = await resp.json();
      videoDuplicateResult = {
        exactGroups: Array.isArray(data.exactGroups) ? data.exactGroups : [],
        similarPairs: Array.isArray(data.similarPairs) ? data.similarPairs : [],
        ignoredItems: Array.isArray(data.ignoredItems) ? data.ignoredItems : [],
        ignoredCount: Number(data.ignoredCount || 0),
        total: Number(data.total || 0)
      };
      syncVideoDuplicateSelected();
    } catch {
      showImageBatchToast('视频查重失败', 'error');
    } finally {
      videoDuplicateLoading = false;
      renderVideoDuplicatePanel();
    }
  }

  async function openVideoDuplicateItem(id) {
    const targetId = String(id || '').trim();
    if (!targetId) return;
    let item = videoListCache.find(x => String(x.id || '') === targetId);
    if (!item) {
      try {
        const resp = await fetch('/api/videos/' + encodeURIComponent(targetId));
        if (resp.ok) item = await resp.json();
      } catch {}
    }
    if (!item) {
      showImageBatchToast('未找到对应视频', 'error');
      return;
    }
    openVideoViewer(item);
  }

  async function ignoreVideoDuplicateGroup(encodedIds) {
    const ids = decodeURIComponent(String(encodedIds || ''))
      .split('|')
      .map(x => String(x || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    try {
      const resp = await fetch('/api/videos/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ignored: true })
      });
      if (!resp.ok) throw new Error('忽略失败');
      await loadVideos(lastVideoLoadCtx || {});
      await runVideoDuplicateCheck();
      showImageBatchToast(`已忽略 ${ids.length} 个视频`, 'success');
    } catch {
      showImageBatchToast('忽略失败', 'error');
    }
  }

  async function restoreVideoDuplicateIds(encodedIds) {
    const ids = decodeURIComponent(String(encodedIds || ''))
      .split('|')
      .map(x => String(x || '').trim())
      .filter(Boolean);
    if (!ids.length) return;
    try {
      const resp = await fetch('/api/videos/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ignored: false })
      });
      if (!resp.ok) throw new Error('恢复失败');
      await loadVideos(lastVideoLoadCtx || {});
      await runVideoDuplicateCheck();
      showImageBatchToast(`已恢复 ${ids.length} 个视频`, 'success');
    } catch {
      showImageBatchToast('恢复失败', 'error');
    }
  }

  function toggleVideoDuplicateIgnoredView() {
    videoDuplicateIgnoredView = !videoDuplicateIgnoredView;
    videoDuplicateSelectMode = '';
    videoDuplicateSelected.clear();
    renderVideoDuplicatePanel();
  }

  function toggleVideoDuplicateSelection(idOrEncoded, encodedGroup = false) {
    const ids = encodedGroup
      ? decodeURIComponent(String(idOrEncoded || '')).split('|').map(x => String(x || '').trim()).filter(Boolean)
      : [String(idOrEncoded || '').trim()].filter(Boolean);
    if (!ids.length) return;
    const allSelected = ids.every(id => videoDuplicateSelected.has(id));
    if (allSelected) ids.forEach(id => videoDuplicateSelected.delete(id));
    else ids.forEach(id => videoDuplicateSelected.add(id));
    renderVideoDuplicatePanel();
  }

  function exitVideoDuplicateSelectMode() {
    videoDuplicateSelectMode = '';
    videoDuplicateSelected.clear();
    renderVideoDuplicatePanel();
  }

  async function handleVideoDuplicateDeleteAction() {
    if (videoDuplicateSelectMode !== 'delete') {
      videoDuplicateSelectMode = 'delete';
      videoDuplicateSelected.clear();
      renderVideoDuplicatePanel();
      showImageBatchToast('已进入删除模式，请选择后再次点击“批量删除”', '');
      return;
    }
    const ids = [...videoDuplicateSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要删除的视频', 'error');
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 个视频吗？`)) return;
    const tasks = ids.map(id => fetch('/api/videos/' + encodeURIComponent(id), { method: 'DELETE' }));
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;
    videoDuplicateSelected.clear();
    videoDuplicateSelectMode = '';
    await loadVideos(lastVideoLoadCtx || {});
    await runVideoDuplicateCheck();
    if (failedCount > 0) showImageBatchToast(`已删除 ${successCount} 个，${failedCount} 个失败`, 'error');
    else showImageBatchToast(`已批量删除 ${successCount} 个视频`, 'success');
  }

  async function handleVideoDuplicateRestoreAction() {
    if (!videoDuplicateIgnoredView) {
      videoDuplicateIgnoredView = true;
      videoDuplicateSelectMode = '';
      videoDuplicateSelected.clear();
      renderVideoDuplicatePanel();
      return;
    }
    if (videoDuplicateSelectMode !== 'restore') {
      videoDuplicateSelectMode = 'restore';
      videoDuplicateSelected.clear();
      renderVideoDuplicatePanel();
      showImageBatchToast('已进入恢复模式，请选择后再次点击“恢复忽略”', '');
      return;
    }
    const ids = [...videoDuplicateSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要恢复的视频', 'error');
      return;
    }
    await restoreVideoDuplicateIds(encodeURIComponent(ids.join('|')));
    videoDuplicateSelectMode = '';
    videoDuplicateSelected.clear();
    renderVideoDuplicatePanel();
  }

  function openVideoDuplicatePage() {
    videoDuplicatePanelVisible = true;
    renderVideoDuplicatePanel();
    runVideoDuplicateCheck();
  }

  function hideVideoDuplicatePanel() {
    videoDuplicatePanelVisible = false;
    videoDuplicateIgnoredView = false;
    videoDuplicateSelectMode = '';
    videoDuplicateSelected.clear();
    renderVideoDuplicatePanel();
  }

  function updateImageBatchToolbar() {
    const favoriteBtn = document.getElementById('imageBatchFavoriteBtn');
    const exportBtn = document.getElementById('imageBatchExportBtn');
    const deleteBtn = document.getElementById('imageBatchDeleteBtn');
    const cancelBtn = document.getElementById('imageBatchCancelBtn');
    const toolbar = document.querySelector('#view-images .toolbar');
    if (!favoriteBtn || !exportBtn || !deleteBtn || !cancelBtn) return;
    const selectedCount = imageBatchSelected.size;
    favoriteBtn.textContent = imageBatchMode ? `⭐ 收藏已选（${selectedCount}）` : '⭐ 批量收藏';
    exportBtn.textContent = imageBatchMode ? `⬇ 导出已选（${selectedCount}）` : '⬇ 批量导出';
    deleteBtn.textContent = imageBatchMode ? `🗑 删除已选（${selectedCount}）` : '🗑 批量删除';
    cancelBtn.style.display = imageBatchMode ? '' : 'none';
    if (toolbar) toolbar.classList.toggle('image-batch-mode', imageBatchMode);
    updateImageDuplicateButton();
  }

  function reloadImagesFromBatchAction() {
    renderImagesFromCache();
  }

  function enterImageBatchMode(hintText = '已进入图片批量模式，请点击卡片选择') {
    imageBatchMode = true;
    imageBatchSelected.clear();
    updateImageBatchToolbar();
    reloadImagesFromBatchAction();
    showImageBatchToast(hintText, '');
  }

  function exitImageBatchMode() {
    imageBatchMode = false;
    imageBatchSelected.clear();
    updateImageBatchToolbar();
    reloadImagesFromBatchAction();
  }

  function toggleImageBatchSelection(payload, idArg, silentArg = false) {
    let event;
    let id;
    let silent;
    if (payload && typeof payload === 'object' && ('event' in payload || 'id' in payload || 'silent' in payload)) {
      event = payload.event;
      id = payload.id;
      silent = !!payload.silent;
    } else {
      event = payload;
      id = idArg;
      silent = !!silentArg;
    }
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!imageBatchMode || !id) return;
    if (imageBatchSelected.has(id)) imageBatchSelected.delete(id);
    else imageBatchSelected.add(id);
    updateImageBatchToolbar();
    reloadImagesFromBatchAction();
    if (!silent) showImageBatchToast(`已选择 ${imageBatchSelected.size} 张`, '');
  }

  async function exportSelectedImages() {
    const ids = [...imageBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要导出的图片', 'error');
      return;
    }
    const selectedItems = imageListCache.filter(item => ids.includes(item.id));
    if (!selectedItems.length) {
      showImageBatchToast('未找到可导出的图片', 'error');
      return;
    }

    selectedItems.forEach((item) => {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = item.originalName || `${item.title || item.id}${item.ext || ''}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    showImageBatchToast(`已触发 ${selectedItems.length} 张图片下载`, 'success');
    exitImageBatchMode();
  }

  async function favoriteSelectedImages() {
    const ids = [...imageBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要收藏的图片', 'error');
      return;
    }
    const input = prompt('输入收藏分类（留空则设为“默认”）', '');
    if (input === null) return;
    const favoriteCategory = String(input || '').trim() || '默认';
    try {
      const tasks = ids.map(id =>
        fetch('/api/images/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favoriteCategory })
        })
      );
      const results = await Promise.allSettled(tasks);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
      const failedCount = ids.length - successCount;
      if (failedCount > 0) showImageBatchToast(`已收藏 ${successCount} 张，${failedCount} 张失败`, 'error');
      else showImageBatchToast(`已批量收藏 ${successCount} 张图片`, 'success');
      imageBatchMode = false;
      imageBatchSelected.clear();
      updateImageBatchToolbar();
      await loadImages(lastImageLoadCtx || {});
    } catch {
      showImageBatchToast('批量收藏失败', 'error');
    }
  }

  async function deleteSelectedImages() {
    const ids = [...imageBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要删除的图片', 'error');
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 张图片吗？`)) return;

    const tasks = ids.map(id => fetch('/api/images/' + encodeURIComponent(id), { method: 'DELETE' }));
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;
    if (failedCount > 0) showImageBatchToast(`已删除 ${successCount} 张，${failedCount} 张失败`, 'error');
    else showImageBatchToast(`已批量删除 ${successCount} 张图片`, 'success');
    imageBatchMode = false;
    imageBatchSelected.clear();
    updateImageBatchToolbar();
    await loadImages(lastImageLoadCtx || {});
  }

  function changeImagePage(page) {
    const next = Number(page);
    if (!Number.isFinite(next)) return;
    imagePage = Math.max(1, Math.floor(next));
    saveImagePagingState();
    renderImagesFromCache();
  }

  function changeImagePerPage(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    imagePerPage = Math.floor(next);
    imagePage = 1;
    saveImagePagingState();
    renderImagesFromCache();
  }

  function handleImagePageJumpInput(event, value, totalPages) {
    if (!event || event.key !== 'Enter') return;
    event.preventDefault();
    const inputPage = Number(value);
    if (!Number.isFinite(inputPage)) return;
    const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
    const nextPage = Math.max(1, Math.min(safeTotal, Math.floor(inputPage)));
    changeImagePage(nextPage);
  }

  async function handleImageBatchFavoriteAction() {
    if (!imageBatchMode) {
      enterImageBatchMode('已进入批量收藏模式，请选择图片后再次点击“批量收藏”');
      return;
    }
    await favoriteSelectedImages();
  }

  async function handleImageBatchExportAction() {
    if (!imageBatchMode) {
      enterImageBatchMode('已进入批量导出模式，请选择图片后再次点击“批量导出”');
      return;
    }
    await exportSelectedImages();
  }

  async function handleImageBatchDeleteAction() {
    if (!imageBatchMode) {
      enterImageBatchMode('已进入批量删除模式，请选择图片后再次点击“批量删除”');
      return;
    }
    await deleteSelectedImages();
  }

  function updateVideoBatchToolbar() {
    const favoriteBtn = document.getElementById('videoBatchFavoriteBtn');
    const seriesAssignBtn = document.getElementById('videoSeriesAssignBtn');
    const exportBtn = document.getElementById('videoBatchExportBtn');
    const deleteBtn = document.getElementById('videoBatchDeleteBtn');
    const cancelBtn = document.getElementById('videoBatchCancelBtn');
    const seriesClearBtn = document.getElementById('videoSeriesClearBtn');
    const seriesRemoveBtn = document.getElementById('videoSeriesRemoveBtn');
    const sortWrap = document.getElementById('videoSortWrap');
    const perPageWrap = document.getElementById('videoPerPageWrap');
    const searchWrap = document.getElementById('videoSearchWrap');
    const actionToggle = document.querySelector('#view-videos .toolbar .action-toggle');
    const toolbar = document.querySelector('#view-videos .toolbar');
    if (!favoriteBtn || !exportBtn || !deleteBtn || !cancelBtn) return;
    const inSeriesFilterMode = !!String(videoSeriesFilter || '').trim();
    const selectedCount = videoBatchSelected.size;
    favoriteBtn.textContent = videoBatchMode ? `⭐ 收藏（${selectedCount}）` : '⭐ 收藏';
    if (seriesAssignBtn) {
      seriesAssignBtn.textContent = videoBatchMode ? `🎬 归档（${selectedCount}）` : '🎬 归档';
    }
    exportBtn.textContent = videoBatchMode ? `⬇ 导出（${selectedCount}）` : '⬇ 导出';
    deleteBtn.textContent = videoBatchMode ? `🗑 删除（${selectedCount}）` : '🗑 删除';
    if (seriesRemoveBtn) {
      seriesRemoveBtn.textContent = videoBatchMode ? `↩ 移出（${selectedCount}）` : '↩ 移出连续剧';
    }

    if (inSeriesFilterMode) {
      favoriteBtn.style.display = 'none';
      if (seriesAssignBtn) seriesAssignBtn.style.display = 'none';
      exportBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      cancelBtn.textContent = '✕ 取消移出';
      cancelBtn.style.display = videoBatchMode ? '' : 'none';
      if (sortWrap) sortWrap.style.display = 'none';
      if (perPageWrap) perPageWrap.style.display = 'none';
      if (searchWrap) searchWrap.style.display = '';
      if (seriesClearBtn) seriesClearBtn.style.display = '';
      if (seriesRemoveBtn) seriesRemoveBtn.style.display = '';
      if (actionToggle) actionToggle.style.display = '';
    } else {
      favoriteBtn.style.display = '';
      if (seriesAssignBtn) seriesAssignBtn.style.display = '';
      exportBtn.style.display = '';
      deleteBtn.style.display = '';
      cancelBtn.style.display = videoBatchMode ? '' : 'none';
      if (sortWrap) sortWrap.style.display = '';
      if (perPageWrap) perPageWrap.style.display = '';
      if (searchWrap) searchWrap.style.display = '';
      if (seriesClearBtn) seriesClearBtn.style.display = 'none';
      if (seriesRemoveBtn) seriesRemoveBtn.style.display = 'none';
      if (actionToggle) actionToggle.style.display = '';
    }

    if (toolbar) {
      toolbar.classList.toggle('video-batch-mode', videoBatchMode);
      toolbar.classList.toggle('video-series-filter-mode', inSeriesFilterMode);
    }
  }

  function handleVideoSearchInput(value) {
    const next = String(value || '');
    const desktop = document.getElementById('searchInput');
    const mobile = document.getElementById('mobileSearchInput');
    const local = document.getElementById('videoSearchInput');
    if (desktop && desktop.value !== next) desktop.value = next;
    if (mobile && mobile.value !== next) mobile.value = next;
    if (local && local.value !== next) local.value = next;

    if (typeof window.debounceSearch === 'function') {
      window.debounceSearch();
      return;
    }
    loadVideos({ ...(lastVideoLoadCtx || {}), searchQuery: next.trim() });
  }

  function enterVideoBatchMode(hintText = '已进入视频批量模式，请点击卡片选择') {
    videoBatchMode = true;
    videoBatchSelected.clear();
    updateVideoBatchToolbar();
    renderVideosFromCache();
    showImageBatchToast(hintText, '');
  }

  function exitVideoBatchMode() {
    videoBatchMode = false;
    videoBatchSelected.clear();
    updateVideoBatchToolbar();
    renderVideosFromCache();
  }

  function toggleVideoBatchSelection(payload, idArg, silentArg = false) {
    let event;
    let id;
    let silent;
    if (payload && typeof payload === 'object' && ('event' in payload || 'id' in payload || 'silent' in payload)) {
      event = payload.event;
      id = payload.id;
      silent = !!payload.silent;
    } else {
      event = payload;
      id = idArg;
      silent = !!silentArg;
    }
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!videoBatchMode || !id) return;
    if (videoBatchSelected.has(id)) videoBatchSelected.delete(id);
    else videoBatchSelected.add(id);
    updateVideoBatchToolbar();
    renderVideosFromCache();
    if (!silent) showImageBatchToast(`已选择 ${videoBatchSelected.size} 个`, '');
  }

  async function exportSelectedVideos() {
    const ids = [...videoBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要导出的视频', 'error');
      return;
    }
    const selectedItems = videoListCache.filter(item => ids.includes(item.id));
    if (!selectedItems.length) {
      showImageBatchToast('未找到可导出的视频', 'error');
      return;
    }

    selectedItems.forEach((item) => {
      const a = document.createElement('a');
      a.href = item.url;
      a.download = item.originalName || `${item.title || item.id}${item.ext || ''}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    showImageBatchToast(`已触发 ${selectedItems.length} 个视频下载`, 'success');
    exitVideoBatchMode();
  }

  async function favoriteSelectedVideos() {
    const ids = [...videoBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要收藏的视频', 'error');
      return;
    }
    const input = prompt('输入收藏分类（留空则设为“默认”）', '');
    if (input === null) return;
    const favoriteCategory = String(input || '').trim() || '默认';
    try {
      const tasks = ids.map(id =>
        fetch('/api/videos/' + encodeURIComponent(id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favoriteCategory })
        })
      );
      const results = await Promise.allSettled(tasks);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
      const failedCount = ids.length - successCount;
      if (failedCount > 0) showImageBatchToast(`已收藏 ${successCount} 个，${failedCount} 个失败`, 'error');
      else showImageBatchToast(`已批量收藏 ${successCount} 个视频`, 'success');
      videoBatchMode = false;
      videoBatchSelected.clear();
      updateVideoBatchToolbar();
      await loadVideos(lastVideoLoadCtx || {});
    } catch {
      showImageBatchToast('批量收藏失败', 'error');
    }
  }

  async function deleteSelectedVideos() {
    const ids = [...videoBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要删除的视频', 'error');
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 个视频吗？`)) return;

    const tasks = ids.map(id => fetch('/api/videos/' + encodeURIComponent(id), { method: 'DELETE' }));
    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;
    if (failedCount > 0) showImageBatchToast(`已删除 ${successCount} 个，${failedCount} 个失败`, 'error');
    else showImageBatchToast(`已批量删除 ${successCount} 个视频`, 'success');
    videoBatchMode = false;
    videoBatchSelected.clear();
    updateVideoBatchToolbar();
    await loadVideos(lastVideoLoadCtx || {});
  }

  async function assignSelectedVideosToSeries() {
    const ids = [...videoBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要归档到连续剧的视频', 'error');
      return;
    }

    const selectedItems = videoListCache
      .filter(item => ids.includes(item.id))
      .sort((a, b) => new Date(a?.uploadedAt || 0) - new Date(b?.uploadedAt || 0));
    if (!selectedItems.length) {
      showImageBatchToast('未找到可归档的视频', 'error');
      return;
    }

    const suggestedName = (() => {
      const titles = selectedItems
        .map(item => String(item?.title || '').trim())
        .filter(Boolean);
      if (!titles.length) return '我的连续剧';
      let prefix = titles[0];
      for (let i = 1; i < titles.length; i += 1) {
        while (prefix && !titles[i].startsWith(prefix)) {
          prefix = prefix.slice(0, -1);
        }
      }
      const normalized = String(prefix || '').replace(/[\s\-_:：·\.]+$/g, '').trim();
      return normalized || '我的连续剧';
    })();

    let seriesList = [];
    try {
      const listResp = await fetch('/api/videos/series?sort=updated_desc');
      const listJson = await listResp.json().catch(() => []);
      if (listResp.ok && Array.isArray(listJson)) seriesList = listJson;
    } catch {
      seriesList = [];
    }

    const picker = typeof window.openSeriesArchivePicker === 'function'
      ? window.openSeriesArchivePicker
      : null;
    let target = null;
    if (picker) {
      target = await picker({
        mode: 'video',
        list: seriesList,
        suggestedName
      });
    } else {
      const fallback = prompt('请输入连续剧名称：', suggestedName);
      const trimmed = String(fallback || '').trim();
      if (!trimmed) return;
      target = { isNew: true, seriesId: '', seriesName: trimmed };
    }
    if (!target) return;
    try {
      const resp = await fetch('/api/videos/series/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groups: [{
            seriesId: String(target.seriesId || '').trim(),
            seriesName: String(target.seriesName || '').trim(),
            videoIds: selectedItems.map(item => item.id)
          }]
        })
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = String(result?.error || '连续剧归档失败').trim();
        showImageBatchToast(message, 'error');
        return;
      }
      const affected = Number(result?.affected || 0);
      const targetName = String(target.seriesName || '').trim() || '目标连续剧';
      showImageBatchToast(`已归档 ${affected} 个视频到连续剧「${targetName}」`, 'success');
      videoBatchMode = false;
      videoBatchSelected.clear();
      updateVideoBatchToolbar();
      await loadVideos(lastVideoLoadCtx || {});
      if (typeof window.showView === 'function') window.showView('video-series');
    } catch {
      showImageBatchToast('连续剧归档失败', 'error');
    }
  }

  async function removeSelectedVideosFromSeries() {
    const ids = [...videoBatchSelected];
    if (!ids.length) {
      showImageBatchToast('请先选择要移出连续剧的视频', 'error');
      return;
    }

    const tasks = ids.map(id =>
      fetch('/api/videos/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: '', seriesName: '', episodeNo: null })
      })
    );

    const results = await Promise.allSettled(tasks);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
    const failedCount = ids.length - successCount;
    if (successCount <= 0) {
      showImageBatchToast('批量移出连续剧失败', 'error');
      return;
    }
    if (failedCount > 0) showImageBatchToast(`已移出 ${successCount} 个，${failedCount} 个失败`, 'error');
    else showImageBatchToast(`已移出 ${successCount} 个视频`, 'success');

    videoBatchMode = false;
    videoBatchSelected.clear();
    updateVideoBatchToolbar();
    await loadVideos(lastVideoLoadCtx || {});
  }

  function changeVideoPage(page) {
    const next = Number(page);
    if (!Number.isFinite(next)) return;
    videoPage = Math.max(1, Math.floor(next));
    saveVideoPagingState();
    renderVideosFromCache();
  }

  function changeVideoPerPage(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    videoPerPage = Math.floor(next);
    videoPage = 1;
    saveVideoPagingState();
    renderVideosFromCache();
  }

  function changeVideoSort(value) {
    const next = String(value || '').trim();
    if (!['latest', 'oldest', 'title_asc', 'title_desc', 'author_asc', 'author_desc', 'rating_desc', 'rating_asc'].includes(next)) return;
    if (next === videoSortBy) return;
    videoSortBy = next;
    videoPage = 1;
    saveVideoPagingState();
    loadVideos(lastVideoLoadCtx || {});
  }

  function handleVideoPageJumpInput(event, value, totalPages) {
    if (!event || event.key !== 'Enter') return;
    event.preventDefault();
    const inputPage = Number(value);
    if (!Number.isFinite(inputPage)) return;
    const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
    const nextPage = Math.max(1, Math.min(safeTotal, Math.floor(inputPage)));
    changeVideoPage(nextPage);
  }

  async function handleVideoBatchFavoriteAction() {
    if (!videoBatchMode) {
      enterVideoBatchMode('已进入批量收藏模式，请选择视频后再次点击“批量收藏”');
      return;
    }
    await favoriteSelectedVideos();
  }

  async function handleVideoBatchExportAction() {
    if (!videoBatchMode) {
      enterVideoBatchMode('已进入批量导出模式，请选择视频后再次点击“批量导出”');
      return;
    }
    await exportSelectedVideos();
  }

  async function handleVideoBatchDeleteAction() {
    if (!videoBatchMode) {
      enterVideoBatchMode('已进入批量删除模式，请选择视频后再次点击“批量删除”');
      return;
    }
    await deleteSelectedVideos();
  }

  async function handleVideoSeriesAssignAction() {
    if (!videoBatchMode) {
      enterVideoBatchMode('已进入连续剧归档模式，请选择视频后再次点击“连续剧归档”');
      return;
    }
    await assignSelectedVideosToSeries();
  }

  async function handleVideoSeriesRemoveAction() {
    if (!videoBatchMode) {
      enterVideoBatchMode('已进入移出连续剧模式，请选择视频后再次点击“移出连续剧”');
      return;
    }
    await removeSelectedVideosFromSeries();
  }

  function getUploadPreset(type) {
    if (type === 'image') {
      return {
        selectedFiles: 'selectedFileImage',
        titleId: 'imageTitleInput',
        authorId: '',
        progArea: 'imageProgressArea',
        progText: 'imageProgressText',
        progPct: 'imageProgressPercent',
        progFill: 'imageProgressFill',
        btnId: 'imageUploadBtn',
        tags: [],
        url: '/api/images/upload',
        itemKey: 'image',
        typeLabel: '图片'
      };
    }
    if (type === 'video') {
      return {
        selectedFiles: 'selectedFileVideo',
        titleId: 'videoTitleInput',
        authorId: '',
        progArea: 'videoProgressArea',
        progText: 'videoProgressText',
        progPct: 'videoProgressPercent',
        progFill: 'videoProgressFill',
        btnId: 'videoUploadBtn',
        tags: [],
        url: '/api/videos/upload',
        itemKey: 'video',
        typeLabel: '视频'
      };
    }
    return null;
  }

  window.MediaFeature = {
    loadImages,
    loadVideos,
    openImageViewer,
    closeImageViewer,
    openVideoViewer,
    closeVideoViewer,
    isImageViewerOpen,
    isVideoViewerOpen,
    deleteMediaItem,
    toggleImageDuplicatePanel,
    openImageDuplicatePage,
    hideImageDuplicatePanel,
    openVideoDuplicatePage,
    hideVideoDuplicatePanel,
    runImageDuplicateCheck,
    runVideoDuplicateCheck,
    toggleImageDuplicateIgnoredView,
    toggleVideoDuplicateIgnoredView,
    handleImageDuplicateRestoreAction,
    handleVideoDuplicateRestoreAction,
    handleImageDuplicateKeepLatestAction,
    handleImageDuplicateDeleteAction,
    handleVideoDuplicateDeleteAction,
    exitImageDuplicateSelectMode,
    exitVideoDuplicateSelectMode,
    toggleImageDuplicateSelection,
    toggleVideoDuplicateSelection,
    restoreImageDuplicateIds,
    restoreVideoDuplicateIds,
    handleImageDuplicateThresholdInput,
    applyImageDuplicateThreshold,
    openImageDuplicateItem,
    openVideoDuplicateItem,
    ignoreImageDuplicateGroup,
    ignoreVideoDuplicateGroup,
    changeImagePage,
    changeImagePerPage,
    handleImagePageJumpInput,
    changeVideoPage,
    changeVideoPerPage,
    changeVideoSeriesFilter,
    clearVideoSeriesFilter,
    changeVideoSort,
    shiftVideoViewer,
    handleVideoPageJumpInput,
    handleImageBatchFavoriteAction,
    handleImageBatchExportAction,
    handleImageBatchDeleteAction,
    handleVideoBatchFavoriteAction,
    handleVideoSearchInput,
    handleVideoSeriesAssignAction,
    handleVideoSeriesRemoveAction,
    handleVideoBatchExportAction,
    handleVideoBatchDeleteAction,
    exitImageBatchMode,
    exitVideoBatchMode,
    toggleImageBatchSelection,
    toggleVideoBatchSelection,
    getUploadPreset,
    setImageViewerMode,
    shiftImageViewer
  };
  window.setImageViewerMode = setImageViewerMode;
  window.shiftImageViewer = shiftImageViewer;
})();
