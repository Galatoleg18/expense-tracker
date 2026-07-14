// ========================================
// ExpenseFlow — Daily Expense Tracker
// Vanilla JS, zero dependencies
// ========================================

// --- Categories ---
const CATEGORIES = [
  { id: 'food', name: 'Food', icon: '🍔', color: '#FF6B6B' },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#4ECDC4' },
  { id: 'shopping', name: 'Shopping', icon: '🛒', color: '#45B7D1' },
  { id: 'bills', name: 'Bills', icon: '📄', color: '#96CEB4' },
  { id: 'entertainment', name: 'Fun', icon: '🎬', color: '#FFEAA7' },
  { id: 'health', name: 'Health', icon: '💊', color: '#DDA0DD' },
  { id: 'education', name: 'Learn', icon: '📚', color: '#74B9FF' },
  { id: 'other', name: 'Other', icon: '📦', color: '#A29BFE' },
];

// --- State ---
let expenses = [];
let currentPeriod = 'day';
let periodOffset = 0;
let selectedCategory = null;
let editingId = null;
let deleteTargetId = null;
let currency = '$';

// --- Storage ---
const STORAGE_KEY = 'expenseflow_data';
const SETTINGS_KEY = 'expenseflow_settings';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    expenses = raw ? JSON.parse(raw) : [];
  } catch { expenses = []; }
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.currency) currency = s.currency;
  } catch {}
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ currency }));
}

// --- Date Helpers ---
function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMoney(n) {
  return `${currency}${Number(n).toFixed(2)}`;
}

function getWeekRange(offset) {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + (offset * 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: fmtISO(start), end: fmtISO(end) };
}

function getMonthRange(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: fmtISO(start), end: fmtISO(end) };
}

function getDayDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return fmtISO(d);
}

function fmtISO(d) {
  return d.toISOString().slice(0, 10);
}

function getPeriodLabel() {
  if (currentPeriod === 'day') {
    if (periodOffset === 0) return 'Today';
    if (periodOffset === -1) return 'Yesterday';
    return formatDate(getDayDate(periodOffset));
  }
  if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    if (periodOffset === 0) return 'This Week';
    if (periodOffset === -1) return 'Last Week';
    const s = new Date(r.start + 'T00:00:00');
    const e = new Date(r.end + 'T00:00:00');
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (currentPeriod === 'month') {
    const r = getMonthRange(periodOffset);
    const s = new Date(r.start + 'T00:00:00');
    if (periodOffset === 0) return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return '';
}

function getFilteredExpenses() {
  if (currentPeriod === 'day') {
    const d = getDayDate(periodOffset);
    return expenses.filter(e => e.date === d);
  }
  if (currentPeriod === 'week') {
    const r = getWeekRange(periodOffset);
    return expenses.filter(e => e.date >= r.start && e.date <= r.end);
  }
  if (currentPeriod === 'month') {
    const r = getMonthRange(periodOffset);
    return expenses.filter(e => e.date >= r.start && e.date <= r.end);
  }
  return [];
}

// --- Rendering ---
function render() {
  renderSummary();
  renderCategories();
  renderExpenseList();
}

function renderSummary() {
  const filtered = getFilteredExpenses();
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const count = filtered.length;

  document.getElementById('period-label').textContent = getPeriodLabel();
  document.getElementById('summary-amount').textContent = formatMoney(total);
  document.getElementById('summary-meta').textContent =
    `${count} expense${count !== 1 ? 's' : ''}`;

  // Update currency display
  document.querySelector('.currency-symbol').textContent = currency;
}

function renderCategories() {
  const filtered = getFilteredExpenses();
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = {};
  filtered.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  });

  const container = document.getElementById('category-bars');
  const section = document.getElementById('category-section');

  if (Object.keys(byCat).length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  container.innerHTML = sorted.map(([catId, amount]) => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
    const pct = total > 0 ? ((amount / total) * 100) : 0;
    return `
      <div class="cat-bar-row">
        <span class="cat-bar-icon">${cat.icon}</span>
        <div class="cat-bar-info">
          <div class="cat-bar-top">
            <span class="cat-bar-name">${cat.name}</span>
            <span class="cat-bar-amount">${formatMoney(amount)} (${Math.round(pct)}%)</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></div>
          </div>
        </div>
      </div>`;
  }).join('');
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

  // Sort by date desc, then by creation order desc
  const sorted = [...filtered].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });

  // Group by date for multi-day views
  const showDateHeaders = currentPeriod !== 'day';
  let lastDate = null;
  let html = '';

  sorted.forEach(e => {
    const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
    if (showDateHeaders && e.date !== lastDate) {
      lastDate = e.date;
      html += `<div class="date-header">${formatDate(e.date)}</div>`;
    }
    html += `
      <div class="expense-item" data-id="${e.id}">
        <div class="expense-icon" style="background:${cat.color}20">
          ${cat.icon}
        </div>
        <div class="expense-info">
          <div class="expense-category">${cat.name}</div>
          ${e.description ? `<div class="expense-desc">${escapeHtml(e.description)}</div>` : ''}
        </div>
        <div class="expense-right">
          <div class="expense-amount">${formatMoney(e.amount)}</div>
          ${currentPeriod === 'day' ? '' : `<div class="expense-date">${formatDate(e.date)}</div>`}
        </div>
        <div class="expense-actions">
          <button class="expense-action-btn edit-btn" data-id="${e.id}" aria-label="Edit">✏️</button>
          <button class="expense-action-btn delete-btn" data-id="${e.id}" aria-label="Delete">🗑️</button>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Category Grid in Form ---
function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <button type="button" class="cat-btn ${selectedCategory === cat.id ? 'selected' : ''}" data-cat="${cat.id}">
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-label">${cat.name}</span>
    </button>
  `).join('');
}

// --- Modal Controls ---
function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openAddModal() {
  editingId = null;
  selectedCategory = null;
  document.getElementById('modal-title').textContent = 'Add Expense';
  document.getElementById('expense-form').reset();
  document.getElementById('expense-id').value = '';
  document.getElementById('expense-date').value = periodOffset === 0 ? today() : getDayDate(periodOffset);
  document.getElementById('btn-save').textContent = 'Add Expense';
  renderCategoryGrid();
  openModal(document.getElementById('modal-overlay'));
  setTimeout(() => document.getElementById('expense-amount').focus(), 300);
}

function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editingId = id;
  selectedCategory = expense.category;
  document.getElementById('modal-title').textContent = 'Edit Expense';
  document.getElementById('expense-id').value = id;
  document.getElementById('expense-amount').value = expense.amount;
  document.getElementById('expense-date').value = expense.date;
  document.getElementById('expense-desc').value = expense.description || '';
  document.getElementById('btn-save').textContent = 'Update';
  renderCategoryGrid();
  openModal(document.getElementById('modal-overlay'));
}

// --- CRUD ---
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function handleSave(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('expense-amount').value);
  const date = document.getElementById('expense-date').value;
  const description = document.getElementById('expense-desc').value.trim();

  if (!amount || amount <= 0) {
    document.getElementById('expense-amount').focus();
    shakeElement(document.querySelector('.amount-input-wrap'));
    return;
  }
  if (!selectedCategory) {
    shakeElement(document.getElementById('category-grid'));
    return;
  }
  if (!date) {
    document.getElementById('expense-date').focus();
    return;
  }

  if (editingId) {
    const idx = expenses.findIndex(ex => ex.id === editingId);
    if (idx !== -1) {
      expenses[idx] = { ...expenses[idx], amount, category: selectedCategory, date, description };
    }
  } else {
    expenses.push({
      id: generateId(),
      amount,
      category: selectedCategory,
      date,
      description,
      createdAt: Date.now(),
    });
  }

  saveData();
  closeModal(document.getElementById('modal-overlay'));
  render();
}

function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => el.style.animation = '', 400);
}

// Add shake keyframes
const style = document.createElement('style');
style.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`;
document.head.appendChild(style);

function promptDelete(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;
  deleteTargetId = id;
  const cat = CATEGORIES.find(c => c.id === expense.category) || CATEGORIES[7];
  document.getElementById('delete-msg').textContent =
    `Delete ${cat.name} expense of ${formatMoney(expense.amount)}?`;
  openModal(document.getElementById('delete-overlay'));
}

function confirmDelete() {
  if (!deleteTargetId) return;
  expenses = expenses.filter(e => e.id !== deleteTargetId);
  deleteTargetId = null;
  saveData();
  closeModal(document.getElementById('delete-overlay'));
  render();
}

// --- CSV Export ---
function exportCSV() {
  if (expenses.length === 0) return;
  const header = 'Date,Category,Amount,Description\n';
  const rows = expenses
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
      return `${e.date},${cat.name},${e.amount},"${(e.description || '').replace(/"/g, '""')}"`;
    })
    .join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenses-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Event Listeners ---
function init() {
  loadData();

  // Currency setting
  const currSelect = document.getElementById('currency-select');
  currSelect.value = currency;
  currSelect.addEventListener('change', () => {
    currency = currSelect.value;
    saveSettings();
    render();
  });

  // FAB
  document.getElementById('fab-add').addEventListener('click', openAddModal);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.tab.active').classList.remove('active');
      tab.classList.add('active');
      currentPeriod = tab.dataset.period;
      periodOffset = 0;
      render();
    });
  });

  // Period navigation
  document.getElementById('period-prev').addEventListener('click', () => {
    periodOffset--;
    render();
  });
  document.getElementById('period-next').addEventListener('click', () => {
    periodOffset++;
    render();
  });

  // Category selection
  document.getElementById('category-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    selectedCategory = btn.dataset.cat;
    renderCategoryGrid();
  });

  // Form submit
  document.getElementById('expense-form').addEventListener('submit', handleSave);

  // Modal close buttons
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
    if (confirm('Delete ALL expenses? This cannot be undone.')) {
      expenses = [];
      saveData();
      closeModal(document.getElementById('settings-overlay'));
      render();
    }
  });

  // Expense list delegation (edit/delete)
  document.getElementById('expense-list').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
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

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m));
    }
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey &&
        !document.querySelector('.modal-overlay.open') &&
        document.activeElement.tagName !== 'INPUT') {
      openAddModal();
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
