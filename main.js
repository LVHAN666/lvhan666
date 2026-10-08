// ============================================================
// 我们的日志本 —— 前端逻辑（原生 JavaScript）
// 功能：静默匿名登录、昵称、发布日志（可选图片）、绝对时间显示、
//       列表、搜索/标签筛选、Realtime 实时同步、删除自己的日志、
//       本周/本月归档统计、深色模式
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ---------- 1. 读取环境变量 ----------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 没配置就直接给出醒目提示，避免白屏
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  document.body.innerHTML =
    '<div style="padding:24px;font-family:sans-serif;color:#b91c1c;line-height:1.8">' +
    '缺少配置：请把 <code>.env.example</code> 复制为 <code>.env</code>，' +
    '并填入 Supabase 的 <code>VITE_SUPABASE_URL</code> 和 <code>VITE_SUPABASE_ANON_KEY</code>。</div>';
  throw new Error('缺少 Supabase 环境变量');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PAGE_LIMIT = 100;                  // 列表只加载最近 100 条
const IMAGE_BUCKET = 'log-images';       // 图片存储桶名（与 SQL 脚本一致）
const MAX_IMAGES = 4;                    // 每条日志最多图片数
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 单张最大 2MB

// ---------- 2. 全局状态 ----------
let allLogs = [];       // 最近 100 条日志
let myUserId = null;    // 当前匿名用户 id
let searchTerm = '';    // 搜索关键词
let selectedTag = '';   // 选中的标签（空字符串 = 全部）
let selectedFiles = []; // 待上传的图片文件

// ---------- 3. DOM 引用 ----------
const el = (id) => document.getElementById(id);
const nicknameModal = el('nickname-modal');
const nicknameInput = el('nickname-input');
const nicknameError = el('nickname-error');
const currentNickname = el('current-nickname');
const contentInput = el('content-input');
const tagsInput = el('tags-input');
const publishStatus = el('publish-status');
const imageInput = el('image-input');
const addImageBtn = el('add-image-btn');
const imagePreviews = el('image-previews');
const searchInput = el('search-input');
const tagSelect = el('tag-select');
const logList = el('log-list');
const status = el('status');
const themeBtn = el('toggle-theme');
const statsWeekBtn = el('stats-week');
const statsMonthBtn = el('stats-month');
const statsPanel = el('stats-panel');

// ---------- 4. 昵称（存 localStorage） ----------
const getNickname = () => localStorage.getItem('nickname') || '';
const setNickname = (name) => {
  localStorage.setItem('nickname', name);
  currentNickname.textContent = name;
};

function showNicknameModal() {
  nicknameInput.value = getNickname();
  nicknameModal.classList.remove('hidden');
  nicknameInput.focus();
}
function hideNicknameModal() {
  nicknameModal.classList.add('hidden');
}
function saveNickname() {
  const name = nicknameInput.value.trim();
  if (!name) {
    nicknameError.classList.remove('hidden');
    return;
  }
  nicknameError.classList.add('hidden');
  setNickname(name);
  hideNicknameModal();
}
el('nickname-save').addEventListener('click', saveNickname);
nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveNickname();
});
el('change-nickname').addEventListener('click', showNicknameModal);

// ---------- 5. 静默匿名登录 ----------
async function ensureAuth() {
  // 刷新页面后会话会自动恢复（supabase-js 存在 localStorage）
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    myUserId = sessionData.session.user.id;
    return;
  }
  // 没有会话就静默匿名登录，用户无感知
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  myUserId = data.user.id;
}

// ---------- 6. 工具函数 ----------
// 把 "工作, 生活，学习" 解析成 ["工作","生活","学习"]
function parseTags(raw) {
  return raw
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
}

// 绝对日期时间，如 2025/06/15 14:30
function formatDateTime(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function genId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(36).slice(2);
}

// 从 MIME 类型推断图片扩展名（png/jpg/gif/webp）
function extOf(file) {
  const m = (file.type || '').split('/')[1];
  if (m && /^[a-z0-9]+$/i.test(m)) return m === 'jpeg' ? 'jpg' : m;
  return 'jpg';
}

function setStatus(msg) {
  status.textContent = msg;
}

// ---------- 7. 加载日志（最近 100 条，倒序） ----------
async function loadLogs() {
  setStatus('加载中…');
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    setStatus('加载失败：' + error.message);
    return;
  }
  allLogs = data || [];
  setStatus('');
  render();
}

// ---------- 8. 渲染 ----------
function collectAllTags() {
  const set = new Set();
  for (const log of allLogs) {
    for (const t of log.tags || []) set.add(t);
  }
  return [...set].sort();
}

function rebuildTagOptions() {
  const tags = collectAllTags();
  tagSelect.innerHTML = '<option value="">全部标签</option>';
  for (const t of tags) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    tagSelect.appendChild(opt);
  }
  tagSelect.value = selectedTag;
}

function createLogCard(log) {
  const card = document.createElement('article');
  card.className = 'log-card';
  card.dataset.id = log.id;

  // 头部：昵称 + 绝对日期时间
  const head = document.createElement('div');
  head.className = 'log-head';
  const name = document.createElement('span');
  name.className = 'log-nickname';
  name.textContent = log.nickname;
  const time = document.createElement('time');
  time.className = 'log-time';
  time.textContent = formatDateTime(log.created_at);
  time.title = new Date(log.created_at).toLocaleString('zh-CN');
  head.appendChild(name);
  head.appendChild(time);

  // 内容（textContent 渲染，天然防 XSS，且保留换行）
  const content = document.createElement('div');
  content.className = 'log-content';
  content.textContent = log.content;

  // 图片（缩略图，点击新标签页看大图）
  const images = log.images || [];
  let imgWrap = null;
  if (images.length > 0) {
    imgWrap = document.createElement('div');
    imgWrap.className = 'log-images';
    for (const url of images) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      img.alt = '日志图片';
      img.onerror = () => a.remove(); // 图片失效则隐藏
      a.appendChild(img);
      imgWrap.appendChild(a);
    }
  }

  // 底部：标签 + 删除按钮
  const foot = document.createElement('div');
  foot.className = 'log-foot';

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'log-tags';
  for (const t of log.tags || []) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag';
    chip.textContent = t;
    // 点击标签 = 按该标签筛选
    chip.addEventListener('click', () => {
      selectedTag = t;
      tagSelect.value = t;
      render();
    });
    tagsWrap.appendChild(chip);
  }
  foot.appendChild(tagsWrap);

  // 只有自己的日志才显示删除按钮
  if (log.user_id === myUserId) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger small';
    del.textContent = '删除';
    del.addEventListener('click', () => deleteLog(log.id));
    foot.appendChild(del);
  }

  card.appendChild(head);
  card.appendChild(content);
  if (imgWrap) card.appendChild(imgWrap);
  card.appendChild(foot);
  return card;
}

function render() {
  const term = searchTerm.trim().toLowerCase();
  let logs = allLogs;

  // 前端过滤：按内容模糊搜索（100 条以内最简单可靠）
  if (term) {
    logs = logs.filter((l) => (l.content || '').toLowerCase().includes(term));
  }
  // 按标签过滤
  if (selectedTag) {
    logs = logs.filter((l) => (l.tags || []).includes(selectedTag));
  }

  rebuildTagOptions();
  logList.innerHTML = '';

  if (logs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent =
      term || selectedTag ? '没有匹配的日志' : '📭 还没有日志，写下第一条吧';
    logList.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const log of logs) frag.appendChild(createLogCard(log));
  logList.appendChild(frag);
}

// ---------- 9. 图片选择与预览 ----------
function renderImagePreviews() {
  imagePreviews.innerHTML = '';
  for (let i = 0; i < selectedFiles.length; i++) {
    const f = selectedFiles[i];
    const item = document.createElement('div');
    item.className = 'image-preview-item';

    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.alt = '待上传图片';

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'image-preview-remove';
    rm.textContent = '×';
    rm.title = '移除这张图片';
    rm.addEventListener('click', () => {
      selectedFiles.splice(i, 1);
      renderImagePreviews();
    });

    item.appendChild(img);
    item.appendChild(rm);
    imagePreviews.appendChild(item);
  }
  imagePreviews.style.display = selectedFiles.length ? 'flex' : 'none';
}

function clearImageSelection() {
  selectedFiles = [];
  imageInput.value = '';
  renderImagePreviews();
}

addImageBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  for (const file of imageInput.files) {
    if (selectedFiles.length >= MAX_IMAGES) {
      publishStatus.textContent = `最多只能添加 ${MAX_IMAGES} 张图片`;
      break;
    }
    if (!file.type.startsWith('image/')) {
      publishStatus.textContent = '只能上传图片文件';
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      publishStatus.textContent = `图片「${file.name}」超过 2MB，请压缩后再上传`;
      continue;
    }
    selectedFiles.push(file);
  }
  imageInput.value = ''; // 清空以便再次选择同一文件
  renderImagePreviews();
});

// ---------- 10. 发布日志（含图片上传） ----------
async function uploadImages(files) {
  const urls = [];
  const paths = [];
  for (const file of files) {
    const path = `${myUserId}/${genId()}.${extOf(file)}`;
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { cacheControl: '3600' });
    if (error) throw new Error('图片上传失败：' + error.message);
    paths.push(path);
    urls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return { urls, paths };
}

async function publishLog() {
  const content = contentInput.value.trim();
  if (!content) {
    publishStatus.textContent = '内容不能为空';
    return;
  }
  const nickname = getNickname();
  if (!nickname) {
    showNicknameModal();
    return;
  }

  publishStatus.textContent = '发布中…';

  // 1. 先上传图片（失败则中止发布）
  let imageUrls = [];
  let uploadedPaths = [];
  if (selectedFiles.length > 0) {
    try {
      const res = await uploadImages(selectedFiles);
      imageUrls = res.urls;
      uploadedPaths = res.paths;
    } catch (e) {
      publishStatus.textContent = e.message;
      return;
    }
  }

  // 2. 插入日志
  const { error } = await supabase.from('logs').insert({
    user_id: myUserId, // RLS 校验它必须等于 auth.uid()
    nickname,
    content,
    tags: parseTags(tagsInput.value),
    images: imageUrls,
  });

  if (error) {
    // 插入失败：清掉刚上传的图片，避免留下孤儿图片
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths).catch(() => {});
    }
    publishStatus.textContent = '发布失败：' + error.message;
    return;
  }

  contentInput.value = '';
  tagsInput.value = '';
  clearImageSelection();
  publishStatus.textContent = '';
  await loadLogs(); // 立即刷新；Realtime 也会再触发一次，幂等无副作用
}
el('publish-btn').addEventListener('click', publishLog);
// Ctrl/Cmd + Enter 快捷发布
contentInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') publishLog();
});

// ---------- 11. 删除日志（仅自己，连带清理图片） ----------
// 从公开图片 URL 取出存储路径：
// https://xxx.supabase.co/storage/v1/object/public/log-images/a/b.jpg → a/b.jpg
function urlToPath(url) {
  const idx = url.indexOf('/log-images/');
  return idx === -1 ? '' : url.slice(idx + '/log-images/'.length);
}

async function deleteLog(id) {
  if (!window.confirm('确定删除这条日志吗？删除后无法恢复。')) return;

  const target = allLogs.find((l) => l.id === id);

  const { error } = await supabase.from('logs').delete().eq('id', id);
  if (error) {
    window.alert('删除失败：' + error.message);
    return;
  }

  // 尽力删除日志附带的图片（失败也不影响，只是图片留在存储桶里）
  const paths = ((target && target.images) || [])
    .map(urlToPath)
    .filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(IMAGE_BUCKET).remove(paths).catch(() => {});
  }

  await loadLogs();
}

// ---------- 12. 搜索与标签筛选 ----------
searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value;
  render();
});
tagSelect.addEventListener('change', () => {
  selectedTag = tagSelect.value;
  render();
});

// ---------- 13. 归档统计（本周 / 本月） ----------
// 本周：周一 00:00 到现在
function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=周日
  const toMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - toMonday, 0, 0, 0, 0);
  return { start, end: now, label: '本周' };
}
// 本月：1 号 00:00 到现在
function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { start, end: now, label: '本月' };
}

async function showStats(kind) {
  // 再点一次同一个按钮 = 收起
  if (statsPanel.dataset.kind === kind && !statsPanel.classList.contains('hidden')) {
    statsPanel.classList.add('hidden');
    return;
  }
  statsPanel.dataset.kind = kind;
  statsPanel.classList.remove('hidden');
  statsPanel.innerHTML = '<div class="stats-loading">统计中…</div>';

  const range = kind === 'week' ? getWeekRange() : getMonthRange();
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .gte('created_at', range.start.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    statsPanel.innerHTML =
      '<div class="stats-loading">统计失败：' + error.message + '</div>';
    return;
  }

  renderStats(statsPanel, range, data || []);
}

function renderStats(panel, range, logs) {
  panel.innerHTML = '';

  // 汇总计算
  const byUser = {};
  const tagCount = {};
  let totalChars = 0;
  const daySet = new Set();
  for (const log of logs) {
    byUser[log.nickname] = (byUser[log.nickname] || 0) + 1;
    totalChars += (log.content || '').length;
    daySet.add(new Date(log.created_at).toDateString());
    for (const t of log.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const days = daySet.size || 1;
  const users = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const fmtDay = (d) =>
    d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

  // 标题：本周（06/09 – 06/15）
  const title = document.createElement('div');
  title.className = 'stats-title';
  title.textContent = `${range.label}（${fmtDay(range.start)} – ${fmtDay(range.end)}）`;
  panel.appendChild(title);

  // 数字卡片
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  const cells = [
    ['日志总数', logs.length],
    ['参与昵称', users.length],
    ['总字数', totalChars],
    ['日均条数', (logs.length / days).toFixed(1)],
  ];
  for (const [label, value] of cells) {
    const cell = document.createElement('div');
    cell.className = 'stats-cell';
    const v = document.createElement('div');
    v.className = 'stats-value';
    v.textContent = String(value);
    const l = document.createElement('div');
    l.className = 'stats-label';
    l.textContent = label;
    cell.appendChild(v);
    cell.appendChild(l);
    grid.appendChild(cell);
  }
  panel.appendChild(grid);

  if (logs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stats-empty';
    empty.textContent = '这段时间还没有日志';
    panel.appendChild(empty);
    return;
  }

  // 每人发布（带比例条）
  const secUsers = document.createElement('div');
  secUsers.className = 'stats-section';
  const h1 = document.createElement('h3');
  h1.textContent = '每人发布';
  secUsers.appendChild(h1);
  for (const [name, count] of users) {
    const row = document.createElement('div');
    row.className = 'stats-user-row';

    const nm = document.createElement('span');
    nm.textContent = name;

    const bar = document.createElement('div');
    bar.className = 'stats-bar-track';
    const fill = document.createElement('div');
    fill.className = 'stats-bar-fill';
    fill.style.width = Math.max(4, Math.round((count / logs.length) * 100)) + '%';
    bar.appendChild(fill);

    const cnt = document.createElement('span');
    cnt.className = 'stats-user-count';
    cnt.textContent = count + ' 条';

    row.appendChild(nm);
    row.appendChild(bar);
    row.appendChild(cnt);
    secUsers.appendChild(row);
  }
  panel.appendChild(secUsers);

  // 热门标签
  if (topTags.length > 0) {
    const secTags = document.createElement('div');
    secTags.className = 'stats-section';
    const h2 = document.createElement('h3');
    h2.textContent = '热门标签';
    secTags.appendChild(h2);
    const wrap = document.createElement('div');
    wrap.className = 'stats-tags';
    for (const [t, count] of topTags) {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.textContent = `${t} ×${count}`;
      wrap.appendChild(chip);
    }
    secTags.appendChild(wrap);
    panel.appendChild(secTags);
  }
}

statsWeekBtn.addEventListener('click', () => showStats('week'));
statsMonthBtn.addEventListener('click', () => showStats('month'));

// ---------- 14. Realtime 实时同步 ----------
function subscribeRealtime() {
  supabase
    .channel('logs-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'logs' }, // 监听 INSERT/UPDATE/DELETE
      () => loadLogs() // 简单可靠：任何变化都重新拉取最近 100 条
    )
    .subscribe();
}

// ---------- 15. 深色模式（可选，跟随系统 + 手动切换） ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  applyTheme(savedTheme);
} else {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ---------- 16. 启动 ----------
async function init() {
  try {
    await ensureAuth();
  } catch (e) {
    setStatus('登录失败：' + e.message);
    return;
  }

  if (getNickname()) {
    currentNickname.textContent = getNickname();
  } else {
    showNicknameModal();
  }

  await loadLogs();
  subscribeRealtime();
}
init();
