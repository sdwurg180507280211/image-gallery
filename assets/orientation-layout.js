const ORIENTATION_CLASSES = ['is-portrait', 'is-square', 'is-landscape', 'is-panorama'];
const STYLE_ID = 'orientation-layout-styles';
const GALLERY_URL = './data/gallery.json?v=20260804-1405';
const SITE_ROOT = new URL('./', window.location.href).pathname;

const recordsByAsset = new Map();

function normalizeAssetPath(value) {
  if (!value) return '';
  try {
    let pathname = decodeURIComponent(new URL(value, window.location.href).pathname);
    if (pathname.startsWith(SITE_ROOT)) pathname = pathname.slice(SITE_ROOT.length);
    return pathname.replace(/^\/+/, '').replace(/^\.\//, '');
  } catch {
    return String(value).replace(/^\.\//, '');
  }
}

function installStyles() {
  if (document.querySelector(`#${STYLE_ID}`)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @media (min-width: 1121px) {
      .gallery-grid {
        grid-auto-flow: dense;
        align-items: start;
      }

      .gallery-card {
        align-self: start;
      }

      .gallery-card.is-landscape {
        grid-column: span 2;
      }

      .gallery-card.is-panorama {
        grid-column: 1 / -1;
      }

      .gallery-card.is-landscape .image-button,
      .gallery-card.is-panorama .image-button {
        aspect-ratio: var(--image-ratio);
      }

      .gallery-card.is-landscape .image-button img,
      .gallery-card.is-panorama .image-button img {
        object-position: center;
      }

      .gallery-card.is-landscape .card-body,
      .gallery-card.is-panorama .card-body {
        padding-top: 16px;
      }

      .gallery-card.is-panorama .card-title {
        font-size: 17px;
      }
    }
  `;
  document.head.append(style);
}

function orientationForRatio(ratio) {
  if (ratio >= 2.15) return 'panorama';
  if (ratio >= 1.15) return 'landscape';
  if (ratio >= 0.92) return 'square';
  return 'portrait';
}

function recordForImage(image) {
  const source = normalizeAssetPath(image.getAttribute('src') || image.currentSrc || image.src);
  return recordsByAsset.get(source) || null;
}

function applyResponsiveSource(image, record, orientation) {
  if (!record || !['landscape', 'panorama'].includes(orientation)) return;

  const thumbnail = normalizeAssetPath(record.thumbnail);
  const original = normalizeAssetPath(record.path);
  const originalWidth = Number(record.width) || Number(image.getAttribute('width')) || image.naturalWidth;
  if (!thumbnail || !original || !(originalWidth > 640)) return;

  image.srcset = `${encodeURI(thumbnail)} 640w, ${encodeURI(original)} ${originalWidth}w`;
  image.sizes = orientation === 'panorama'
    ? '(min-width: 1121px) calc(100vw - 96px), 100vw'
    : '(min-width: 1121px) 50vw, 100vw';
  image.dataset.responsivePreview = 'true';
}

function classifyCard(card) {
  if (!(card instanceof HTMLElement) || !card.classList.contains('gallery-card')) return;

  const image = card.querySelector('.image-button img');
  if (!(image instanceof HTMLImageElement)) return;

  const width = Number(image.getAttribute('width')) || image.naturalWidth;
  const height = Number(image.getAttribute('height')) || image.naturalHeight;

  if (!(width > 0 && height > 0)) {
    image.addEventListener('load', () => classifyCard(card), { once: true });
    return;
  }

  const ratio = width / height;
  const orientation = orientationForRatio(ratio);

  card.classList.remove(...ORIENTATION_CLASSES);
  card.classList.add(`is-${orientation}`);
  card.dataset.orientation = orientation;
  card.style.setProperty('--image-ratio', String(Math.min(3.2, Math.max(0.68, ratio))));

  applyResponsiveSource(image, recordForImage(image), orientation);
}

function classifyCards(root = document) {
  if (root instanceof HTMLElement && root.classList.contains('gallery-card')) classifyCard(root);
  root.querySelectorAll?.('.gallery-card').forEach(classifyCard);
}

async function loadGalleryRecords() {
  try {
    const response = await fetch(GALLERY_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.images || [];

    recordsByAsset.clear();
    for (const record of records) {
      recordsByAsset.set(normalizeAssetPath(record.thumbnail), record);
      recordsByAsset.set(normalizeAssetPath(record.path), record);
    }
  } catch (error) {
    console.warn('无法加载横图高清候选，继续使用普通缩略图：', error);
  }
}

async function initializeOrientationLayout() {
  installStyles();
  await loadGalleryRecords();

  const grid = document.querySelector('#galleryGrid');
  if (!grid) return;

  classifyCards(grid);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) classifyCards(node);
      });
    }
  });

  observer.observe(grid, { childList: true, subtree: true });
}

initializeOrientationLayout();
