// ============================================================
// 我们的日志本 —— 前端逻辑（原生 JavaScript）
// 功能：静默匿名登录、昵称、发布日志、列表、搜索/标签筛选、
//       Realtime 实时同步、删除自己的日志、深色模式
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

const PAGE_LIMIT = 100; // 只加载最近 100 条，3 人小团队足够用

// ---------- 2. 全局状态 ----------
let allLogs = []; // 最近 100 条日志
let myUserId = null; // 当前匿名用户的 id
let searchTerm = ''; // 搜索关键词
let selectedTag = ''; // 选中的标签（空字符串 = 全部）

// ---------- 3. DOM 引用 ----------
const el = (id) => document.getElementById(id);
const nicknameModal = el('nickname-modal');
const nicknameInput = el('nickname-input');
const nicknameError = el('nickname-error');
const currentNickname = el('current-nickname');
const contentInput = el('content-input');
const tagsInput = el('tags-input');
const publishStatus = el('publish-status');
const searchInput = el('search-input');
const tagSelect = el('tag-select');
const logList = el('log-list');
const status = el('status');
const themeBtn = el('toggle-theme');

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
    .slice(0, 10); // 最多 10 个标签
}

// 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / 日期
function formatRelativeTime(iso) {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return '刚刚';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return date.toLocaleDateString('zh-CN');
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

// 重建“标签筛选”下拉框的选项
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

  // 头部：昵称 + 相对时间
  const head = document.createElement('div');
  head.className = 'log-head';
  const name = document.createElement('span');
  name.className = 'log-nickname';
  name.textContent = log.nickname;
  const time = document.createElement('time');
  time.className = 'log-time';
  time.textContent = formatRelativeTime(log.created_at);
  time.title = new Date(log.created_at).toLocaleString('zh-CN');
  head.appendChild(name);
  head.appendChild(time);

  // 内容（textContent 渲染，天然防 XSS，且保留换行）
  const content = document.createElement('div');
  content.className = 'log-content';
  content.textContent = log.content;

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
      term || selectedTag ? '没有匹配的日志' : '还没有日志，写下第一条吧';
    logList.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const log of logs) frag.appendChild(createLogCard(log));
  logList.appendChild(frag);
}

// ---------- 9. 发布日志 ----------
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
  const { error } = await supabase.from('logs').insert({
    user_id: myUserId, // RLS 会校验它必须等于 auth.uid()
    nickname,
    content,
    tags: parseTags(tagsInput.value),
  });

  if (error) {
    publishStatus.textContent = '发布失败：' + error.message;
    return;
  }

  contentInput.value = '';
  tagsInput.value = '';
  publishStatus.textContent = '';
  await loadLogs(); // 立即刷新；Realtime 也会再触发一次，幂等无副作用
}
el('publish-btn').addEventListener('click', publishLog);
// Ctrl/Cmd + Enter 快捷发布
contentInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') publishLog();
});

// ---------- 10. 删除日志（仅自己） ----------
async function deleteLog(id) {
  if (!window.confirm('确定删除这条日志吗？删除后无法恢复。')) return;
  const { error } = await supabase.from('logs').delete().eq('id', id);
  if (error) {
    window.alert('删除失败：' + error.message);
    return;
  }
  await loadLogs();
}

// ---------- 11. 搜索与标签筛选 ----------
searchInput.addEventListener('input', () => {
  searchTerm = searchInput.value;
  render();
});
tagSelect.addEventListener('change', () => {
  selectedTag = tagSelect.value;
  render();
});

// ---------- 12. Realtime 实时同步 ----------
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

// ---------- 13. 深色模式（可选，跟随系统 + 手动切换） ----------
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

// ---------- 14. 启动 ----------
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
