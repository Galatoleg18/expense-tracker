// ========================================
// ExpenseFlow — Premium Fintech App
// Vanilla JS | No frameworks | v2.0
// ========================================

// --- Categories (harmonious, modern palette) ---
const CATEGORIES = [
  { id: 'food',          name: 'Food',      icon: '🍜', color: '#f97316' },
  { id: 'transport',     name: 'Transport', icon: '🚌', color: '#3b82f6' },
  { id: 'shopping',      name: 'Shopping',  icon: '🛍️', color: '#8b5cf6' },
  { id: 'bills',         name: 'Bills',     icon: '🔌', color: '#64748b' },
  { id: 'entertainment', name: 'Fun',       icon: '🎮', color: '#ec4899' },
  { id: 'health',        name: 'Health',    icon: '💊', color: '#10b981' },
  { id: 'education',     name: 'Learn',     icon: '📚', color: '#0ea5e9' },
  { id: 'other',         name: 'Other',     icon: '📦', color: '#94a3b8' },
];

// --- State ---
let expenses        = [];
let currentPeriod   = 'day';
let periodOffset    = 0;
let selectedCategory = null;
let editingId       = null;
let deleteTargetId  = null;
let currency        = '$';
let currentType     = 'expense'; // 'expense' | 'income'
let filterCategory  = 'all';
let searchQuery     = '';
let theme           = 'auto'; // 'light' | 'dark' | 'auto'
let toastTimer      = null;

// --- Storage Keys ---
const STORAGE_KEY  = 'expenseflow_data';
const SETTINGS_KEY = 'expenseflow_settings';

// ========================================
// DATA LAYER
// ========================================

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    expenses = raw ? JSON.parse(raw) : [];
  } catch { expenses = []; }

  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.currency) currency = s.currency;
    if (s.theme)    theme    = s.theme;
  } catch {}
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ currency, theme }));
}

// ========================================
// DATE HELPERS
// ========================================

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1)  return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMoney(n, showSign = false) {
  const abs = Math.abs(Number(n));
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = showSign && Number(n) > 0 ? '+' : '';
  return `${sign}${currency}${formatted}`;
}

function getWeekRange(offset) {
  const now  = new Date();
  const day  = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + (offset * 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: fmtISO(start), end: fmtISO(end) };
}

function getMonthRange(offset) {
  const now  = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtISO(start), end: fmtISO(end) };
}

function getDayDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return fmtISO(d);
}

function getPeriodLabel() {
  if (currentPeriod === 'day') {
    if (periodOffset === 0)  return 'Today';
    if (periodOffset === -1) return 'Yesterday';
    return formatDate(getDayDate(periodOffset));
  }
  if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    if (periodOffset === 0)  return 'This Week';
    if (periodOffset === -1) return 'Last Week';
    const s = new Date(r.start + 'T00:00:00');
    const e = new Date(r.end   + 'T00:00:00');
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (currentPeriod === 'month') {
    const r = getMonthRange(periodOffset);
    return new Date(r.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return '';
}

function getFilteredExpenses() {
  let filtered;
  if (currentPeriod === 'day') {
    const d = getDayDate(periodOffset);
    filtered = expenses.filter(e => e.date === d);
  } else if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    filtered = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  } else if (currentPeriod === 'month') {
    const r = getMonthRange(periodOffset);
    filtered = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  } else {
    filtered = [...expenses];
  }

  // Category filter
  if (filterCategory !== 'all') {
    filtered = filtered.filter(e => e.category === filterCategory);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(e => {
      const cat = CATEGORIES.find(c => c.id === e.category);
      return (
        (cat && cat.name.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        String(e.amount).includes(q)
      );
    });
  }

  return filtered;
}

// ========================================
// THEME
// ========================================

function applyTheme(val) {
  theme = val;
  const root = document.documentElement;
  if (val === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', val);
  }
  // Update top-bar icons
  const isDark = root.getAttribute('data-theme') === 'dark';
  const lightIcon = document.getElementById('theme-icon-light');
  const darkIcon  = document.getElementById('theme-icon-dark');
  if (lightIcon && darkIcon) {
    lightIcon.style.display = isDark ? 'none'  : '';
    darkIcon.style.display  = isDark ? ''      : 'none';
  }
  // Sync settings buttons
  document.querySelectorAll('.theme-switch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === val);
  });
  saveSettings();
}

// ========================================
// TOAST
// ========================================

function showToast(msg, duration = 2200) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

// ========================================
// RENDERING
// ========================================

function render() {
  renderSummary();
  renderFilterPills();
  renderCategories();
  renderExpenseList();
}

// Animated number counter
function animateValue(el, newText) {
  if (!el) return;
  el.classList.remove('animating');
  void el.offsetWidth; // reflow
  el.textContent = newText;
  el.classList.add('animating');
}

function renderSummary() {
  const all      = getFilteredExpenses();
  const expense  = all.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0);
  const income   = all.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const balance  = income - expense;
  const count    = all.length;

  document.getElementById('period-label').textContent = getPeriodLabel();

  animateValue(document.getElementById('summary-amount'),  formatMoney(expense));
  animateValue(document.getElementById('summary-income'),  formatMoney(income));

  const balEl = document.getElementById('summary-balance');
  if (balEl) {
    balEl.textContent = formatMoney(Math.abs(balance));
    balEl.className = 'summary-balance-val ' + (balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero');
  }

  document.getElementById('summary-meta').textContent =
    `${count} transaction${count !== 1 ? 's' : ''}`;

  // Update currency displays
  document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = currency);
}

function renderFilterPills() {
  const container = document.getElementById('filter-row');
  if (!container) return;

  // Which categories exist in current period (ignoring cat/search filters)
  let periodExp;
  if (currentPeriod === 'day') {
    const d = getDayDate(periodOffset);
    periodExp = expenses.filter(e => e.date === d);
  } else if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    periodExp = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  } else {
    const r = getMonthRange(periodOffset);
    periodExp = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  }

  const usedCats = [...new Set(periodExp.map(e => e.category))];
  let html = `<button class="filter-pill ${filterCategory === 'all' ? 'active' : ''}" data-cat="all">All</button>`;
  usedCats.forEach(catId => {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return;
    html += `<button class="filter-pill ${filterCategory === catId ? 'active' : ''}" data-cat="${catId}">${cat.icon} ${cat.name}</button>`;
  });
  container.innerHTML = html;
}

function renderCategories() {
  // Use period-only expenses (not search/cat filtered) for breakdown
  let periodExp;
  if (currentPeriod === 'day') {
    const d = getDayDate(periodOffset);
    periodExp = expenses.filter(e => e.date === d);
  } else if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    periodExp = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  } else {
    const r = getMonthRange(periodOffset);
    periodExp = expenses.filter(e => e.date >= r.start && e.date <= r.end);
  }

  // Only expenses (not income) for breakdown
  const expensesOnly = periodExp.filter(e => e.type !== 'income');
  const total = expensesOnly.reduce((s, e) => s + e.amount, 0);
  const section = document.getElementById('category-section');

  if (expensesOnly.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const byCat = {};
  expensesOnly.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  });

  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  // Draw donut chart
  drawDonut(sorted, total);

  // Render bars
  const container = document.getElementById('category-bars');
  container.innerHTML = sorted.map(([catId, amount]) => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
    const pct = total > 0 ? (amount / total) * 100 : 0;
    return `
      <div class="cat-bar-row" data-cat="${catId}">
        <span class="cat-bar-icon">${cat.icon}</span>
        <div class="cat-bar-info">
          <div class="cat-bar-top">
            <span class="cat-bar-name">${cat.name}</span>
            <span class="cat-bar-amount">${formatMoney(amount)} · ${Math.round(pct)}%</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width:0%;background:${cat.color}" data-width="${pct}"></div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Animate bars after paint
  requestAnimationFrame(() => {
    container.querySelectorAll('.cat-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  });
}

function drawDonut(sorted, total) {
  const canvas = document.getElementById('donut-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.offsetWidth || 80;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const inner = outer * 0.58;
  const gap   = 0.025; // radians gap between segments

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#f3f3f7';
    ctx.fill();
    return;
  }

  let startAngle = -Math.PI / 2;

  sorted.forEach(([catId, amount]) => {
    const cat  = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
    const sweep = (amount / total) * (Math.PI * 2) - gap;
    if (sweep <= 0) return;

    ctx.beginPath();
    ctx.moveTo(cx + outer * Math.cos(startAngle + gap / 2), cy + outer * Math.sin(startAngle + gap / 2));
    ctx.arc(cx, cy, outer, startAngle + gap / 2, startAngle + sweep + gap / 2);
    ctx.arc(cx, cy, inner, startAngle + sweep + gap / 2, startAngle + gap / 2, true);
    ctx.closePath();
    ctx.fillStyle = cat.color;
    ctx.fill();

    startAngle += sweep + gap;
  });
}

function renderExpenseList() {
  const filtered = getFilteredExpenses();
  const container = document.getElementById('expense-list');
  const emptyState = document.getElementById('empty-state');
  document.getElementById('expense-count').textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  const sorted = [...filtered].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const showDateHeaders = currentPeriod !== 'day';
  let lastDate = null;
  let html = '';
  let delay = 0;

  sorted.forEach(e => {
    const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
    const isIncome = e.type === 'income';
    const sign = isIncome ? '+' : '-';
    const amountClass = isIncome ? 'is-income' : 'is-expense';

    if (showDateHeaders && e.date !== lastDate) {
      lastDate = e.date;
      html += `<div class="date-header">${formatDate(e.date)}</div>`;
    }

    html += `
      <div class="expense-item" data-id="${e.id}" style="animation-delay:${delay}ms">
        <div class="expense-icon" style="background:${cat.color}18;color:${cat.color}">
          ${cat.icon}
        </div>
        <div class="expense-info">
          <div class="expense-category">${cat.name}${isIncome ? ' <span style="font-size:0.65rem;background:var(--income-soft);color:var(--income);padding:1px 5px;border-radius:4px;font-weight:600;vertical-align:middle">Income</span>' : ''}</div>
          ${e.description ? `<div class="expense-desc">${escapeHtml(e.description)}</div>` : ''}
        </div>
        <div class="expense-right">
          <div class="expense-amount ${amountClass}">${sign}${formatMoney(e.amount)}</div>
          ${showDateHeaders ? '' : `<div class="expense-date-tag">${new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>`}
        </div>
        <div class="expense-actions">
          <button class="expense-action-btn edit-btn" data-id="${e.id}" aria-label="Edit" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="expense-action-btn delete-btn" data-id="${e.id}" aria-label="Delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
    delay = Math.min(delay + 30, 150);
  });

  container.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========================================
// CATEGORY GRID IN FORM
// ========================================

function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <button type="button" class="cat-btn ${selectedCategory === cat.id ? 'selected' : ''}" data-cat="${cat.id}" style="${selectedCategory === cat.id ? `border-color:${cat.color};background:${cat.color}18` : ''}">
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-label">${cat.name}</span>
    </button>
  `).join('');
}

// ========================================
// MODAL CONTROLS
// ========================================

function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  // Trap focus
  const firstFocusable = overlay.querySelector('button, input, select, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 350);
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openAddModal() {
  editingId        = null;
  selectedCategory = null;
  currentType      = 'expense';

  document.getElementById('modal-title').textContent = 'Add Transaction';
  document.getElementById('expense-form').reset();
  document.getElementById('expense-id').value  = '';
  document.getElementById('expense-date').value = periodOffset === 0 ? today() : getDayDate(periodOffset);
  document.getElementById('btn-save').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    Save`;

  syncTypeToggle();
  renderCategoryGrid();
  openModal(document.getElementById('modal-overlay'));
  setTimeout(() => document.getElementById('expense-amount').focus(), 350);
}

function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editingId        = id;
  selectedCategory = expense.category;
  currentType      = expense.type || 'expense';

  document.getElementById('modal-title').textContent = 'Edit Transaction';
  document.getElementById('expense-id').value          = id;
  document.getElementById('expense-amount').value      = expense.amount;
  document.getElementById('expense-date').value        = expense.date;
  document.getElementById('expense-desc').value        = expense.description || '';
  document.getElementById('btn-save').innerHTML        = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    Update`;

  syncTypeToggle();
  renderCategoryGrid();
  openModal(document.getElementById('modal-overlay'));
}

function syncTypeToggle() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === currentType);
  });
  const wrap = document.getElementById('amount-wrap');
  if (wrap) {
    wrap.classList.toggle('is-income', currentType === 'income');
  }
}

// ========================================
// CRUD
// ========================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function handleSave(e) {
  e.preventDefault();
  const amount      = parseFloat(document.getElementById('expense-amount').value);
  const date        = document.getElementById('expense-date').value;
  const description = document.getElementById('expense-desc').value.trim();

  if (!amount || amount <= 0) {
    document.getElementById('expense-amount').focus();
    shakeElement(document.getElementById('amount-wrap'));
    return;
  }
  if (!selectedCategory) {
    shakeElement(document.getElementById('category-grid'));
    showToast('Please pick a category');
    return;
  }
  if (!date) {
    document.getElementById('expense-date').focus();
    return;
  }

  const isEditing = !!editingId;

  if (isEditing) {
    const idx = expenses.findIndex(ex => ex.id === editingId);
    if (idx !== -1) {
      expenses[idx] = { ...expenses[idx], amount, category: selectedCategory, date, description, type: currentType };
    }
  } else {
    expenses.push({
      id: generateId(),
      amount,
      category:    selectedCategory,
      date,
      description,
      type:        currentType,
      createdAt:   Date.now(),
    });
  }

  saveData();
  closeModal(document.getElementById('modal-overlay'));
  render();

  const cat = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[7];
  showToast(isEditing
    ? `${cat.icon} Transaction updated`
    : `${cat.icon} ${currentType === 'income' ? 'Income' : 'Expense'} added · ${formatMoney(amount)}`
  );
}

function shakeElement(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => (el.style.animation = ''), 450);
}

function promptDelete(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;
  deleteTargetId = id;
  const cat = CATEGORIES.find(c => c.id === expense.category) || CATEGORIES[7];
  document.getElementById('delete-msg').textContent =
    `Delete ${cat.name} ${expense.type === 'income' ? 'income' : 'expense'} of ${formatMoney(expense.amount)}? This cannot be undone.`;
  openModal(document.getElementById('delete-overlay'));
}

function confirmDelete() {
  if (!deleteTargetId) return;
  expenses = expenses.filter(e => e.id !== deleteTargetId);
  const id = deleteTargetId;
  deleteTargetId = null;
  saveData();
  closeModal(document.getElementById('delete-overlay'));

  // Animate out the item
  const item = document.querySelector(`.expense-item[data-id="${id}"]`);
  if (item) {
    item.style.transition = 'transform 0.2s ease, opacity 0.2s ease, max-height 0.3s ease';
    item.style.maxHeight  = item.offsetHeight + 'px';
    requestAnimationFrame(() => {
      item.style.transform = 'translateX(100%)';
      item.style.opacity   = '0';
      item.style.maxHeight = '0';
      item.style.overflow  = 'hidden';
    });
    setTimeout(() => render(), 300);
  } else {
    render();
  }
  showToast('Transaction deleted');
}

// ========================================
// CSV EXPORT
// ========================================

function exportCSV() {
  if (expenses.length === 0) {
    showToast('No data to export');
    return;
  }
  const header = 'Date,Type,Category,Amount,Description\n';
  const rows = expenses
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
      return `${e.date},${e.type || 'expense'},${cat.name},${e.amount},"${(e.description || '').replace(/"/g, '""')}"`;
    })
    .join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenseflow-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported ✓');
}

// ========================================
// DONUT — redraw on resize
// ========================================

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderCategories(), 200);
});

// System theme change
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'auto') applyTheme('auto');
});

// ========================================
// INIT
// ========================================

function init() {
  loadData();

  // Apply theme
  applyTheme(theme);

  // Currency select
  const currSelect = document.getElementById('currency-select');
  if (currSelect) {
    currSelect.value = currency;
    currSelect.addEventListener('change', () => {
      currency = currSelect.value;
      saveSettings();
      render();
      showToast('Currency updated');
    });
  }

  // Theme toggle button (top bar)
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  });

  // Theme setting buttons
  document.querySelectorAll('.theme-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeVal));
  });

  // FAB
  document.getElementById('fab-add').addEventListener('click', openAddModal);

  // Empty state CTA
  document.getElementById('empty-cta')?.addEventListener('click', openAddModal);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.tab.active').classList.remove('active');
      tab.classList.add('active');
      currentPeriod = tab.dataset.period;
      periodOffset  = 0;
      filterCategory = 'all';
      render();
    });
  });

  // Period nav
  document.getElementById('period-prev').addEventListener('click', () => {
    periodOffset--;
    render();
  });
  document.getElementById('period-next').addEventListener('click', () => {
    periodOffset++;
    render();
  });

  // Type toggle (income/expense)
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      syncTypeToggle();
    });
  });

  // Category selection in form
  document.getElementById('category-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    selectedCategory = btn.dataset.cat;
    renderCategoryGrid();
  });

  // Category bar rows — filter on click
  document.getElementById('category-bars').addEventListener('click', (e) => {
    const row = e.target.closest('.cat-bar-row');
    if (!row) return;
    const cat = row.dataset.cat;
    filterCategory = filterCategory === cat ? 'all' : cat;
    render();
  });

  // Filter pills
  document.getElementById('filter-row').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    filterCategory = pill.dataset.cat;
    render();
  });

  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      render();
    });
  }

  // Form submit
  document.getElementById('expense-form').addEventListener('submit', handleSave);

  // Modal close
  document.getElementById('modal-close').addEventListener('click', () =>
    closeModal(document.getElementById('modal-overlay')));
  document.getElementById('btn-cancel').addEventListener('click', () =>
    closeModal(document.getElementById('modal-overlay')));
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });

  // Delete modal
  document.getElementById('delete-cancel').addEventListener('click', () =>
    closeModal(document.getElementById('delete-overlay')));
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('delete-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', () =>
    openModal(document.getElementById('settings-overlay')));
  document.getElementById('settings-close').addEventListener('click', () =>
    closeModal(document.getElementById('settings-overlay')));
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('Delete ALL transactions? This cannot be undone.')) {
      expenses = [];
      saveData();
      closeModal(document.getElementById('settings-overlay'));
      filterCategory = 'all';
      searchQuery    = '';
      render();
      showToast('All data cleared');
    }
  });

  // Expense list delegation
  document.getElementById('expense-list').addEventListener('click', (e) => {
    const editBtn   = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    if (editBtn) {
      e.stopPropagation();
      openEditModal(editBtn.dataset.id);
    } else if (deleteBtn) {
      e.stopPropagation();
      promptDelete(deleteBtn.dataset.id);
    } else {
      const item = e.target.closest('.expense-item');
      if (item) openEditModal(item.dataset.id);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const isInputFocused = ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
    const anyOpen = document.querySelector('.modal-overlay.open');

    if (e.key === 'Escape' && anyOpen) {
      closeModal(anyOpen);
      return;
    }

    if (!isInputFocused && !anyOpen) {
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openAddModal();
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openModal(document.getElementById('settings-overlay'));
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyTheme(isDark ? 'light' : 'dark');
      }
    }
  });

  // Add shake keyframes dynamically
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-7px); }
      40%      { transform: translateX(7px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(styleEl);

  render();
}

document.addEventListener('DOMContentLoaded', init);
