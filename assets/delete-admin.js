const REPOSITORY = 'sdwurg180507280211/image-gallery';
const BRANCH = 'main';
const PENDING_KEY = 'image-gallery:pending-deletions';
const SITE_ROOT = new URL('./', window.location.href).pathname;

const admin = {
  token: '',
  enabled: false,
  busy: false,
  images: [],
  byId: new Map(),
  byPath: new Map(),
  pending: new Set(JSON.parse(sessionStorage.getItem(PENDING_KEY) || '[]')),
};

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

function encodeRepositoryPath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(endpoint, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${admin.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API 请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function repositoryPathExists(repositoryPath) {
  try {
    await githubRequest(`/repos/${REPOSITORY}/contents/${encodeRepositoryPath(repositoryPath)}?ref=${encodeURIComponent(BRANCH)}`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function createJsonBlobEntry(repositoryPath, transform) {
  const file = await githubRequest(`/repos/${REPOSITORY}/contents/${encodeRepositoryPath(repositoryPath)}?ref=${encodeURIComponent(BRANCH)}`);
  const document = JSON.parse(decodeBase64Utf8(file.content));
  const updated = transform(document);
  const blob = await githubRequest(`/repos/${REPOSITORY}/git/blobs`, {
    method: 'POST',
    body: { content: `${JSON.stringify(updated, null, 2)}\n`, encoding: 'utf-8' },
  });
  return { path: repositoryPath, mode: '100644', type: 'blob', sha: blob.sha };
}

function savePending() {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify([...admin.pending]));
}

function setStatus(message, error = false) {
  const element = document.querySelector('#deleteAdminStatus');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
}

function setBusy(busy) {
  admin.busy = busy;
  document.querySelectorAll('.owner-delete-button, #deleteAdminUnlock, #deleteAdminLock, #lightboxOwnerDelete')
    .forEach((button) => { button.disabled = busy; });
}

function itemForAsset(value) {
  const path = normalizeAssetPath(value);
  return admin.byPath.get(path) || null;
}

function itemForCard(card) {
  const image = card.querySelector('.image-button img');
  return image ? itemForAsset(image.getAttribute('src') || image.currentSrc || image.src) : null;
}

function removeDeletedCards() {
  document.querySelectorAll('.gallery-card').forEach((card) => {
    const item = itemForCard(card);
    if (item && admin.pending.has(item.id)) card.remove();
  });
}

function ensureCardDeleteButtons() {
  document.querySelectorAll('.gallery-card').forEach((card) => {
    const item = itemForCard(card);
    if (!item || admin.pending.has(item.id)) {
      if (item) card.remove();
      return;
    }

    const body = card.querySelector('.card-body');
    const favorite = body?.querySelector('.favorite-button');
    if (!body || !favorite) return;

    let actions = body.querySelector('.owner-card-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'owner-card-actions';
      favorite.replaceWith(actions);
      actions.append(favorite);
    }

    let button = actions.querySelector('.owner-delete-button');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'owner-delete-button';
      button.textContent = '删除';
      actions.prepend(button);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentItem = itemForCard(card);
        if (currentItem) deleteImage(currentItem, button);
      });
    }
    button.hidden = !admin.enabled;
  });
}

function syncLightboxDeleteButton() {
  const button = document.querySelector('#lightboxOwnerDelete');
  if (!button) return;
  const image = document.querySelector('#lightboxImage');
  const item = image ? itemForAsset(image.getAttribute('src') || image.currentSrc || image.src) : null;
  button.hidden = !admin.enabled || !item || admin.pending.has(item.id);
}

function syncDeleteButtons() {
  removeDeletedCards();
  ensureCardDeleteButtons();
  syncLightboxDeleteButton();
}

function updateVisibleCounts() {
  const total = admin.images.filter((item) => !admin.pending.has(item.id)).length;
  const imageCount = document.querySelector('#imageCount');
  if (imageCount) imageCount.textContent = String(total);
  const resultText = document.querySelector('#resultText');
  if (resultText) {
    const visible = document.querySelectorAll('.gallery-card').length;
    resultText.textContent = `显示 ${visible} / ${total} 张作品`;
  }
}

async function deleteImage(item, sourceButton) {
  if (!admin.enabled || !admin.token || admin.busy || admin.pending.has(item.id)) return;

  setBusy(true);
  const originalLabel = sourceButton.textContent;
  sourceButton.textContent = '删除中…';
  setStatus(`正在删除「${item.title}」…`);

  try {
    const head = await githubRequest(`/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`);
    const headSha = head.object.sha;
    const commit = await githubRequest(`/repos/${REPOSITORY}/git/commits/${headSha}`);
    const metadataPath = item.path.replace(/\.[^.]+$/, '.json');

    if (!await repositoryPathExists(item.path)) throw new Error('仓库中的原图已经不存在。');
    const metadataExists = await repositoryPathExists(metadataPath);
    const now = new Date().toISOString();
    let remainingCount = Math.max(0, admin.images.length - admin.pending.size - 1);

    const galleryEntry = await createJsonBlobEntry('data/gallery.json', (gallery) => {
      gallery.images = (gallery.images || []).filter((image) => image.id !== item.id && image.path !== item.path);
      gallery.count = gallery.images.length;
      gallery.generatedAt = now;
      remainingCount = gallery.count;
      return gallery;
    });

    const validationEntry = await createJsonBlobEntry('data/validation-report.json', (report) => {
      report.generatedAt = now;
      report.issues = (report.issues || []).filter((issue) => issue.path !== item.path);
      report.summary = report.summary || {};
      report.summary.images = remainingCount;
      report.summary.errors = report.issues.filter((issue) => issue.severity === 'error').length;
      report.summary.warnings = report.issues.filter((issue) => issue.severity === 'warning').length;
      report.summary.info = report.issues.filter((issue) => issue.severity === 'info').length;
      return report;
    });

    const treeEntries = [
      { path: item.path, mode: '100644', type: 'blob', sha: null },
      ...(metadataExists ? [{ path: metadataPath, mode: '100644', type: 'blob', sha: null }] : []),
      galleryEntry,
      validationEntry,
    ];

    const tree = await githubRequest(`/repos/${REPOSITORY}/git/trees`, {
      method: 'POST',
      body: { base_tree: commit.tree.sha, tree: treeEntries },
    });
    const deletionCommit = await githubRequest(`/repos/${REPOSITORY}/git/commits`, {
      method: 'POST',
      body: {
        message: `chore(gallery): delete ${item.title}`,
        tree: tree.sha,
        parents: [headSha],
      },
    });
    await githubRequest(`/repos/${REPOSITORY}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: { sha: deletionCommit.sha, force: false },
    });

    admin.pending.add(item.id);
    savePending();
    document.querySelector('#lightbox')?.close();
    document.body.style.overflow = '';
    syncDeleteButtons();
    updateVisibleCounts();
    setStatus(`已删除「${item.title}」。原图、同名 JSON 和当前索引已从 main 分支移除，Pages 正在自动重新部署。`);
  } catch (error) {
    console.error('删除失败：', error);
    sourceButton.textContent = originalLabel;
    setStatus(`删除失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function unlockDeleteMode() {
  const input = document.querySelector('#deleteAdminToken');
  const token = input?.value.trim() || '';
  if (!token) {
    setStatus('请输入 GitHub fine-grained token。', true);
    return;
  }

  setBusy(true);
  setStatus('正在验证仓库访问权限…');
  try {
    admin.token = token;
    await githubRequest(`/repos/${REPOSITORY}`);
    admin.enabled = true;
    input.value = '';
    input.hidden = true;
    document.querySelector('#deleteAdminUnlock').hidden = true;
    document.querySelector('#deleteAdminLock').hidden = false;
    document.querySelector('#deleteAdminToggle').setAttribute('aria-pressed', 'true');
    setStatus('删除模式已开启。点击红色删除按钮会立即执行，不弹确认框。');
    syncDeleteButtons();
  } catch (error) {
    admin.token = '';
    setStatus(`令牌验证失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function lockDeleteMode() {
  admin.enabled = false;
  admin.token = '';
  const input = document.querySelector('#deleteAdminToken');
  if (input) input.hidden = false;
  document.querySelector('#deleteAdminUnlock').hidden = false;
  document.querySelector('#deleteAdminLock').hidden = true;
  document.querySelector('#deleteAdminToggle').setAttribute('aria-pressed', 'false');
  setStatus('删除模式已关闭，令牌已从页面内存清除。');
  syncDeleteButtons();
}

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .delete-admin-toggle[aria-pressed="true"]{border-color:rgba(255,91,113,.58);background:rgba(173,34,57,.18);color:#ffb2be}
    .delete-admin-panel{display:grid;grid-template-columns:minmax(260px,1fr) minmax(430px,auto);gap:18px 30px;align-items:center;margin:16px 0 8px;padding:18px;border:1px solid rgba(255,91,113,.28);border-radius:16px;background:linear-gradient(135deg,rgba(105,23,38,.2),rgba(18,20,27,.94))}
    .delete-admin-panel[hidden]{display:none}.delete-admin-copy strong{color:#ffd4db}.delete-admin-copy p,.delete-admin-status{margin:5px 0 0;color:var(--muted);font-size:12px}.delete-admin-controls{display:flex;gap:10px;align-items:center;justify-content:flex-end}.delete-admin-controls input{width:300px;height:42px;padding:0 12px;border:1px solid var(--line);border-radius:12px;outline:0;background:var(--surface-solid);color:var(--text)}.delete-admin-controls input:focus{border-color:rgba(255,91,113,.62);box-shadow:0 0 0 3px rgba(255,91,113,.12)}.delete-admin-status{grid-column:1/-1}.delete-admin-status.error{color:#ff9bad}
    .owner-danger-button,.owner-delete-button{border:1px solid rgba(255,91,113,.46);border-radius:12px;background:rgba(153,25,48,.18);color:#ffb8c3;cursor:pointer}.owner-danger-button{min-height:42px;padding:0 14px}.owner-danger-button:hover,.owner-delete-button:hover{background:rgba(188,35,61,.3);border-color:rgba(255,111,132,.78)}.owner-danger-button:disabled,.owner-delete-button:disabled{opacity:.5;cursor:wait}.owner-card-actions{display:flex;gap:7px;align-items:center}.owner-delete-button{height:34px;padding:0 10px;font-size:12px}.owner-delete-button[hidden],#lightboxOwnerDelete[hidden]{display:none}
  `;
  document.head.append(style);
}

function injectAdminInterface() {
  const toolbarActions = document.querySelector('.toolbar-actions');
  const toolbar = document.querySelector('.toolbar');
  if (!toolbarActions || !toolbar) return;

  const toggle = document.createElement('button');
  toggle.id = 'deleteAdminToggle';
  toggle.type = 'button';
  toggle.className = 'text-button delete-admin-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.textContent = '删除管理';
  toolbarActions.prepend(toggle);

  const panel = document.createElement('section');
  panel.id = 'deleteAdminPanel';
  panel.className = 'delete-admin-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="delete-admin-copy">
      <strong>管理员删除模式</strong>
      <p>使用只授予本仓库 Contents: Read and write 的 GitHub fine-grained token。令牌仅保存在当前页面内存，刷新即清除。</p>
    </div>
    <div class="delete-admin-controls">
      <input id="deleteAdminToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…" aria-label="GitHub 删除令牌" />
      <button class="owner-danger-button" id="deleteAdminUnlock" type="button">开启删除模式</button>
      <button class="secondary-button" id="deleteAdminLock" type="button" hidden>关闭删除模式</button>
    </div>
    <p class="delete-admin-status" id="deleteAdminStatus">删除会立即从 main 分支移除原图、同名 JSON 和当前索引；不创建应用备份，不弹二次确认。Git 历史不会自动重写。</p>
  `;
  toolbar.after(panel);

  const lightboxActions = document.querySelector('.lightbox-actions');
  if (lightboxActions) {
    const button = document.createElement('button');
    button.id = 'lightboxOwnerDelete';
    button.type = 'button';
    button.className = 'owner-danger-button';
    button.textContent = '删除此图';
    button.hidden = true;
    lightboxActions.prepend(button);
    button.addEventListener('click', () => {
      const image = document.querySelector('#lightboxImage');
      const item = image ? itemForAsset(image.getAttribute('src') || image.currentSrc || image.src) : null;
      if (item) deleteImage(item, button);
    });
  }

  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; });
  panel.querySelector('#deleteAdminUnlock').addEventListener('click', unlockDeleteMode);
  panel.querySelector('#deleteAdminLock').addEventListener('click', lockDeleteMode);
  panel.querySelector('#deleteAdminToken').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlockDeleteMode();
  });
}

async function loadAdminGallery() {
  const response = await fetch('./data/gallery.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法读取图库索引：${response.status}`);
  const payload = await response.json();
  admin.images = Array.isArray(payload) ? payload : payload.images || [];
  admin.byId = new Map(admin.images.map((item) => [item.id, item]));
  admin.byPath.clear();
  for (const item of admin.images) {
    admin.byPath.set(normalizeAssetPath(item.path), item);
    admin.byPath.set(normalizeAssetPath(item.thumbnail), item);
  }

  for (const id of [...admin.pending]) {
    if (!admin.byId.has(id)) admin.pending.delete(id);
  }
  savePending();
}

async function initializeDeleteAdmin() {
  injectStyles();
  injectAdminInterface();
  try {
    await loadAdminGallery();
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  const grid = document.querySelector('#galleryGrid');
  if (grid) {
    new MutationObserver(syncDeleteButtons).observe(grid, { childList: true, subtree: true });
  }
  const lightboxImage = document.querySelector('#lightboxImage');
  if (lightboxImage) {
    new MutationObserver(syncLightboxDeleteButton).observe(lightboxImage, { attributes: true, attributeFilter: ['src'] });
  }
  syncDeleteButtons();
  updateVisibleCounts();
}

initializeDeleteAdmin();
