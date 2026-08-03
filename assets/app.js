const ALL = '全部';
const filterDimensions = ['theme', 'scene', 'palette', 'composition', 'assetType'];
const advancedDimensions = ['composition', 'assetType'];
const state = {
  images: [],
  visibleImages: [],
  taxonomy: {},
  validation: null,
  activeCharacter: ALL,
  filters: Object.fromEntries(filterDimensions.map((key) => [key, ALL])),
  query: '',
  sort: 'newest',
  favoritesOnly: false,
  advancedOpen: false,
  activeIndex: -1,
  favorites: new Set(JSON.parse(localStorage.getItem('image-gallery:favorites') || '[]')),
};

const elements = {
  grid: document.querySelector('#galleryGrid'),
  template: document.querySelector('#cardTemplate'),
  search: document.querySelector('#searchInput'),
  sort: document.querySelector('#sortSelect'),
  categoryFilters: document.querySelector('#categoryFilters'),
  facetFilters: Object.fromEntries(filterDimensions.map((key) => [key, document.querySelector(`#${key}Filter`)])),
  favoritesOnly: document.querySelector('#favoritesOnly'),
  advancedToggle: document.querySelector('#advancedToggle'),
  advancedCount: document.querySelector('#advancedCount'),
  advancedFilters: document.querySelector('#advancedFilters'),
  activeFilters: document.querySelector('#activeFilters'),
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

function normalizeList(value) {
  const source = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return [...new Set(source.map(String).map((item) => item.trim()).filter(Boolean))];
}

function normalizeImage(item, index) {
  const imagePath = String(item.path || '').replace(/^\.\//, '');
  const thumbnail = String(item.thumbnail || '').replace(/^\.\//, '');
  const title = item.title || imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || `图片 ${index + 1}`;
  const character = String(item.character || item.category || '未分类');
  return {
    id: item.id || imagePath || String(index),
    path: imagePath,
    thumbnail: thumbnail || imagePath,
    title,
    character,
    category: character,
    theme: normalizeList(item.theme ?? item.themes),
    scene: normalizeList(item.scene ?? item.scenes),
    palette: normalizeList(item.palette ?? item.palettes),
    composition: normalizeList(item.composition),
    assetType: String(item.assetType || 'artwork'),
    actions: normalizeList(item.actions),
    expressions: normalizeList(item.expressions),
    confirmedTraits: normalizeList(item.confirmedTraits),
    description: item.description || '',
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).map(String) : [],
    createdAt: item.createdAt || item.generatedAt || item.date || '',
    featured: Boolean(item.featured),
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
  };
}

function labelFor(dimension, value) {
  const entry = (state.taxonomy[dimension] || []).find((item) => item.value === value);
  return entry?.label || value;
}

function dimensionValues(item, dimension) {
  return dimension === 'assetType' ? [item.assetType].filter(Boolean) : item[dimension] || [];
}

function describeImage(item) {
  const parts = [item.character];
  if (item.theme[0]) parts.push(labelFor('theme', item.theme[0]));
  if (item.scene[0]) parts.push(labelFor('scene', item.scene[0]));
  if (item.palette[0]) parts.push(labelFor('palette', item.palette[0]));
  return parts.join(' · ');
}

async function loadGallery() {
  try {
    const response = await fetch('./data/gallery.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.images;
    state.taxonomy = Array.isArray(payload) ? {} : payload.taxonomy || {};
    state.validation = Array.isArray(payload) ? null : payload.validation || null;
    state.images = (records || []).map(normalizeImage).filter((item) => item.path);
  } catch (error) {
    console.error('无法读取画廊索引：', error);
    state.images = [];
  }

  updateStats();
  renderCharacters();
  renderFacetFilters();
  applyFilters();
}

function updateStats() {
  elements.imageCount.textContent = String(state.images.length);
  elements.categoryCount.textContent = String(new Set(state.images.map((item) => item.character)).size);
  elements.favoriteCount.textContent = String(state.favorites.size);
}

function renderCharacters() {
  const counts = state.images.reduce((map, item) => {
    map.set(item.character, (map.get(item.character) || 0) + 1);
    return map;
  }, new Map());
  const characters = [ALL, ...[...counts.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))];
  elements.categoryFilters.replaceChildren();

  characters.forEach((character) => {
    const button = document.createElement('button');
    const count = character === ALL ? state.images.length : counts.get(character);
    button.type = 'button';
    button.className = `category-chip${character === state.activeCharacter ? ' active' : ''}`;
    button.dataset.category = character;
    button.append(document.createTextNode(character));
    const countElement = document.createElement('span');
    countElement.textContent = String(count);
    button.append(countElement);
    button.addEventListener('click', () => {
      state.activeCharacter = character;
      renderCharacters();
      applyFilters();
    });
    elements.categoryFilters.append(button);
  });
}

function renderFacetFilters() {
  for (const dimension of filterDimensions) {
    const select = elements.facetFilters[dimension];
    if (!select) continue;
    const current = state.filters[dimension];
    const counts = new Map();
    for (const item of state.images) {
      for (const value of dimensionValues(item, dimension)) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const values = [...counts.keys()].sort((a, b) => labelFor(dimension, a).localeCompare(labelFor(dimension, b), 'zh-CN'));
    select.replaceChildren(new Option(`全部${select.dataset.label || ''}`, ALL));
    values.forEach((value) => select.add(new Option(`${labelFor(dimension, value)} (${counts.get(value)})`, value)));
    select.value = values.includes(current) ? current : ALL;
    state.filters[dimension] = select.value;
  }
}

function matchesFacet(item, dimension) {
  const selected = state.filters[dimension];
  return selected === ALL || dimensionValues(item, dimension).includes(selected);
}

function clearFacet(dimension) {
  state.filters[dimension] = ALL;
  const select = elements.facetFilters[dimension];
  if (select) select.value = ALL;
  applyFilters();
}

function addFilterChip(label, onRemove) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'active-filter-chip';
  const text = document.createElement('span');
  text.textContent = label;
  const remove = document.createElement('b');
  remove.setAttribute('aria-hidden', 'true');
  remove.textContent = '×';
  chip.append(text, remove);
  chip.setAttribute('aria-label', `移除筛选：${label}`);
  chip.addEventListener('click', onRemove);
  elements.activeFilters.append(chip);
}

function syncFilterInterface() {
  const advancedCount = advancedDimensions.filter((dimension) => state.filters[dimension] !== ALL).length;
  if (advancedCount > 0) state.advancedOpen = true;

  elements.advancedFilters.hidden = !state.advancedOpen;
  elements.advancedToggle.setAttribute('aria-expanded', String(state.advancedOpen));
  elements.advancedToggle.classList.toggle('active', state.advancedOpen || advancedCount > 0);
  elements.advancedCount.hidden = advancedCount === 0;
  elements.advancedCount.textContent = String(advancedCount);

  for (const dimension of filterDimensions) {
    const select = elements.facetFilters[dimension];
    select?.closest('.facet-control')?.classList.toggle('has-value', state.filters[dimension] !== ALL);
  }

  elements.activeFilters.replaceChildren();
  if (state.activeCharacter !== ALL) {
    addFilterChip(`人物：${state.activeCharacter}`, () => {
      state.activeCharacter = ALL;
      renderCharacters();
      applyFilters();
    });
  }
  for (const dimension of filterDimensions) {
    const value = state.filters[dimension];
    if (value === ALL) continue;
    const label = elements.facetFilters[dimension]?.dataset.label || dimension;
    addFilterChip(`${label}：${labelFor(dimension, value)}`, () => clearFacet(dimension));
  }
  if (state.favoritesOnly) {
    addFilterChip('只看收藏', () => {
      state.favoritesOnly = false;
      elements.favoritesOnly.setAttribute('aria-pressed', 'false');
      applyFilters();
    });
  }
  elements.activeFilters.hidden = elements.activeFilters.childElementCount === 0;
}

function applyFilters() {
  syncFilterInterface();
  const normalizedQuery = state.query.trim().toLocaleLowerCase('zh-CN');
  state.visibleImages = state.images
    .filter((item) => {
      const characterMatches = state.activeCharacter === ALL || item.character === state.activeCharacter;
      const favoriteMatches = !state.favoritesOnly || state.favorites.has(item.id);
      const facetsMatch = filterDimensions.every((dimension) => matchesFacet(item, dimension));
      const searchable = [
        item.title, item.character, item.description, ...item.theme, ...item.scene, ...item.palette,
        ...item.composition, item.assetType, ...item.actions, ...item.expressions, ...item.confirmedTraits, ...item.tags,
      ].join(' ').toLocaleLowerCase('zh-CN');
      return characterMatches && favoriteMatches && facetsMatch && (!normalizedQuery || searchable.includes(normalizedQuery));
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

function displayTags(item) {
  const structured = [
    ...item.theme.map((value) => labelFor('theme', value)),
    ...item.scene.map((value) => labelFor('scene', value)),
    ...item.palette.map((value) => labelFor('palette', value)),
    ...item.composition.map((value) => labelFor('composition', value)),
  ];
  return [...new Set([...structured, ...item.tags].filter((tag) => tag && tag !== item.character))];
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
    category.textContent = describeImage(item);
    imageButton.setAttribute('aria-label', `查看 ${item.title}`);
    imageButton.addEventListener('click', () => openLightbox(index));
    syncFavoriteButton(favorite, item);
    favorite.addEventListener('click', () => toggleFavorite(item.id));

    displayTags(item).slice(0, 4).forEach((tag) => {
      const tagElement = document.createElement('span');
      tagElement.className = 'tag';
      tagElement.textContent = `#${tag}`;
      tagList.append(tagElement);
    });
    elements.grid.append(fragment);
  });

  const hasFacetFilters = filterDimensions.some((dimension) => state.filters[dimension] !== ALL);
  const hasFilters = state.activeCharacter !== ALL || hasFacetFilters || state.query || state.favoritesOnly;
  elements.clearFilters.hidden = !hasFilters;
  elements.resultText.textContent = state.images.length ? `显示 ${state.visibleImages.length} / ${state.images.length} 张作品` : '尚未添加图片';
  const isEmpty = state.visibleImages.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.grid.hidden = isEmpty;

  if (isEmpty && state.images.length) {
    elements.emptyTitle.textContent = '没有找到匹配的作品';
    elements.emptyDescription.textContent = '尝试更换关键词、人物、主题或其他筛选条件。';
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
  const meta = [
    describeImage(item),
    labelFor('assetType', item.assetType),
    ...item.composition.map((value) => labelFor('composition', value)),
  ];
  elements.lightboxCategory.textContent = [...new Set(meta.filter(Boolean))].join(' · ');
  elements.lightboxDescription.textContent = item.description || displayTags(item).map((tag) => `#${tag}`).join(' ');
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
  state.activeCharacter = ALL;
  state.query = '';
  state.favoritesOnly = false;
  state.advancedOpen = false;
  filterDimensions.forEach((dimension) => { state.filters[dimension] = ALL; });
  elements.search.value = '';
  elements.favoritesOnly.setAttribute('aria-pressed', 'false');
  renderCharacters();
  renderFacetFilters();
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
filterDimensions.forEach((dimension) => {
  elements.facetFilters[dimension]?.addEventListener('change', (event) => {
    state.filters[dimension] = event.target.value;
    applyFilters();
  });
});
elements.favoritesOnly.addEventListener('click', () => {
  state.favoritesOnly = !state.favoritesOnly;
  elements.favoritesOnly.setAttribute('aria-pressed', String(state.favoritesOnly));
  applyFilters();
});
elements.advancedToggle.addEventListener('click', () => {
  state.advancedOpen = !state.advancedOpen;
  syncFilterInterface();
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
