const state = {
  images: [],
  visibleImages: [],
  activeCategory: '全部',
  query: '',
  sort: 'newest',
  favoritesOnly: false,
  activeIndex: -1,
  favorites: new Set(JSON.parse(localStorage.getItem('image-gallery:favorites') || '[]')),
};

const elements = {
  grid: document.querySelector('#galleryGrid'),
  template: document.querySelector('#cardTemplate'),
  search: document.querySelector('#searchInput'),
  sort: document.querySelector('#sortSelect'),
  categoryFilters: document.querySelector('#categoryFilters'),
  favoritesOnly: document.querySelector('#favoritesOnly'),
  clearFilters: document.querySelector('#clearFilters'),
  resultText: document.querySelector('#resultText'),
  emptyState: document.querySelector('#emptyState'),
  emptyTitle: document.querySelector('#emptyTitle'),
  emptyDescription: document.querySelector('#emptyDescription'),
  imageCount: document.querySelector('#imageCount'),
  categoryCount: document.querySelector('#categoryCount'),
  favoriteCount: document.querySelector('#favoriteCount'),
  themeToggle: document.querySelector('#themeToggle'),
  lightbox: document.querySelector('#lightbox'),
  lightboxClose: document.querySelector('#lightboxClose'),
  lightboxImage: document.querySelector('#lightboxImage'),
  lightboxTitle: document.querySelector('#lightboxTitle'),
  lightboxCategory: document.querySelector('#lightboxCategory'),
  lightboxDescription: document.querySelector('#lightboxDescription'),
  lightboxFavorite: document.querySelector('#lightboxFavorite'),
  downloadImage: document.querySelector('#downloadImage'),
  previousImage: document.querySelector('#previousImage'),
  nextImage: document.querySelector('#nextImage'),
};

function normalizeImage(item, index) {
  const imagePath = String(item.path || '').replace(/^\.\//, '');
  const thumbnail = String(item.thumbnail || '').replace(/^\.\//, '');
  const title = item.title || imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || `图片 ${index + 1}`;
  return {
    id: item.id || imagePath || String(index),
    path: imagePath,
    thumbnail: thumbnail || imagePath,
    title,
    category: item.category || '未分类',
    description: item.description || '',
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
    createdAt: item.createdAt || item.date || '',
    featured: Boolean(item.featured),
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
  };
}

async function loadGallery() {
  try {
    const response = await fetch('./data/gallery.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.images;
    state.images = (records || []).map(normalizeImage).filter((item) => item.path);
  } catch (error) {
    console.error('无法读取画廊索引：', error);
    state.images = [];
  }

  updateStats();
  renderCategories();
  applyFilters();
}

function updateStats() {
  elements.imageCount.textContent = String(state.images.length);
  elements.categoryCount.textContent = String(new Set(state.images.map((item) => item.category)).size);
  elements.favoriteCount.textContent = String(state.favorites.size);
}

function renderCategories() {
  const counts = state.images.reduce((map, item) => {
    map.set(item.category, (map.get(item.category) || 0) + 1);
    return map;
  }, new Map());
  const categories = ['全部', ...[...counts.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))];
  elements.categoryFilters.replaceChildren();

  categories.forEach((category) => {
    const button = document.createElement('button');
    const count = category === '全部' ? state.images.length : counts.get(category);
    button.type = 'button';
    button.className = `category-chip${category === state.activeCategory ? ' active' : ''}`;
    button.dataset.category = category;
    button.append(document.createTextNode(category));
    const countElement = document.createElement('span');
    countElement.textContent = String(count);
    button.append(countElement);
    button.addEventListener('click', () => {
      state.activeCategory = category;
      renderCategories();
      applyFilters();
    });
    elements.categoryFilters.append(button);
  });
}

function applyFilters() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase('zh-CN');
  state.visibleImages = state.images
    .filter((item) => {
      const categoryMatches = state.activeCategory === '全部' || item.category === state.activeCategory;
      const favoriteMatches = !state.favoritesOnly || state.favorites.has(item.id);
      const searchable = [item.title, item.category, item.description, ...item.tags].join(' ').toLocaleLowerCase('zh-CN');
      return categoryMatches && favoriteMatches && (!normalizedQuery || searchable.includes(normalizedQuery));
    })
    .sort((a, b) => {
      if (state.sort === 'title') return a.title.localeCompare(b.title, 'zh-CN', { numeric: true });
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aTime === bTime) return a.title.localeCompare(b.title, 'zh-CN', { numeric: true });
      return state.sort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  renderGallery();
}

function renderGallery() {
  elements.grid.replaceChildren();

  state.visibleImages.forEach((item, index) => {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector('.gallery-card');
    const imageButton = fragment.querySelector('.image-button');
    const image = fragment.querySelector('img');
    const title = fragment.querySelector('.card-title');
    const category = fragment.querySelector('.card-category');
    const favorite = fragment.querySelector('.favorite-button');
    const tagList = fragment.querySelector('.tag-list');

    if (item.width > 0 && item.height > 0) {
      card.style.setProperty('--image-ratio', String(Math.min(1.45, Math.max(0.68, item.width / item.height))));
      image.width = item.width;
      image.height = item.height;
    }

    image.src = encodeURI(item.thumbnail);
    image.alt = item.title;
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.fetchPriority = index < 3 ? 'high' : 'low';
    image.addEventListener('error', () => {
      if (image.dataset.fallback !== 'original' && item.thumbnail !== item.path) {
        image.dataset.fallback = 'original';
        image.src = encodeURI(item.path);
        return;
      }
      card.hidden = true;
      console.warn(`图片加载失败：${item.path}`);
    });

    title.textContent = item.title;
    category.textContent = item.category;
    imageButton.setAttribute('aria-label', `查看 ${item.title}`);
    imageButton.addEventListener('click', () => openLightbox(index));
    syncFavoriteButton(favorite, item);
    favorite.addEventListener('click', () => toggleFavorite(item.id));

    item.tags.slice(0, 3).forEach((tag) => {
      const tagElement = document.createElement('span');
      tagElement.className = 'tag';
      tagElement.textContent = `#${tag}`;
      tagList.append(tagElement);
    });
    elements.grid.append(fragment);
  });

  const hasFilters = state.activeCategory !== '全部' || state.query || state.favoritesOnly;
  elements.clearFilters.hidden = !hasFilters;
  elements.resultText.textContent = state.images.length
    ? `显示 ${state.visibleImages.length} / ${state.images.length} 张作品`
    : '尚未添加图片';
  const isEmpty = state.visibleImages.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.grid.hidden = isEmpty;

  if (isEmpty && state.images.length) {
    elements.emptyTitle.textContent = '没有找到匹配的作品';
    elements.emptyDescription.textContent = '尝试更换关键词、分类或关闭“只看收藏”。';
  } else if (isEmpty) {
    elements.emptyTitle.textContent = '画廊还是空的';
    elements.emptyDescription.innerHTML = '把图片放入 <code>images/</code> 文件夹并推送，网站会自动生成索引。';
  }
}

function syncFavoriteButton(button, item) {
  const active = state.favorites.has(item.id);
  button.textContent = active ? '♥' : '♡';
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? `取消收藏 ${item.title}` : `收藏 ${item.title}`);
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('image-gallery:favorites', JSON.stringify([...state.favorites]));
  updateStats();
  applyFilters();
  if (elements.lightbox.open && state.activeIndex >= 0) syncLightboxFavorite();
}

function openLightbox(index) {
  state.activeIndex = index;
  renderLightbox();
  elements.lightbox.showModal();
  document.body.style.overflow = 'hidden';
}

function renderLightbox() {
  const item = state.visibleImages[state.activeIndex];
  if (!item) return;
  elements.lightboxImage.src = encodeURI(item.path);
  elements.lightboxImage.alt = item.title;
  elements.lightboxTitle.textContent = item.title;
  elements.lightboxCategory.textContent = item.category;
  elements.lightboxDescription.textContent = item.description || item.tags.map((tag) => `#${tag}`).join(' ');
  elements.downloadImage.href = encodeURI(item.path);
  elements.downloadImage.download = item.path.split('/').pop() || item.title;
  elements.previousImage.hidden = state.visibleImages.length < 2;
  elements.nextImage.hidden = state.visibleImages.length < 2;
  syncLightboxFavorite();
}

function syncLightboxFavorite() {
  const item = state.visibleImages[state.activeIndex];
  if (!item) return;
  const active = state.favorites.has(item.id);
  elements.lightboxFavorite.textContent = active ? '♥ 已收藏' : '♡ 收藏';
  elements.lightboxFavorite.setAttribute('aria-pressed', String(active));
}

function moveLightbox(offset) {
  if (!state.visibleImages.length) return;
  state.activeIndex = (state.activeIndex + offset + state.visibleImages.length) % state.visibleImages.length;
  renderLightbox();
}

function closeLightbox() {
  elements.lightbox.close();
  document.body.style.overflow = '';
}

function clearFilters() {
  state.activeCategory = '全部';
  state.query = '';
  state.favoritesOnly = false;
  elements.search.value = '';
  elements.favoritesOnly.setAttribute('aria-pressed', 'false');
  renderCategories();
  applyFilters();
}

function initializeTheme() {
  const saved = localStorage.getItem('image-gallery:theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved || preferred;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('image-gallery:theme', next);
}

elements.search.addEventListener('input', (event) => { state.query = event.target.value; applyFilters(); });
elements.sort.addEventListener('change', (event) => { state.sort = event.target.value; applyFilters(); });
elements.favoritesOnly.addEventListener('click', () => {
  state.favoritesOnly = !state.favoritesOnly;
  elements.favoritesOnly.setAttribute('aria-pressed', String(state.favoritesOnly));
  applyFilters();
});
elements.clearFilters.addEventListener('click', clearFilters);
elements.themeToggle.addEventListener('click', toggleTheme);
elements.lightboxClose.addEventListener('click', closeLightbox);
elements.previousImage.addEventListener('click', () => moveLightbox(-1));
elements.nextImage.addEventListener('click', () => moveLightbox(1));
elements.lightboxFavorite.addEventListener('click', () => {
  const item = state.visibleImages[state.activeIndex];
  if (item) toggleFavorite(item.id);
});
elements.lightbox.addEventListener('click', (event) => { if (event.target === elements.lightbox) closeLightbox(); });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== elements.search) {
    event.preventDefault();
    elements.search.focus();
  }
  if (!elements.lightbox.open) return;
  if (event.key === 'ArrowLeft') moveLightbox(-1);
  if (event.key === 'ArrowRight') moveLightbox(1);
});

initializeTheme();
loadGallery();
