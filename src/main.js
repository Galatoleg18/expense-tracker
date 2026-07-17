// ========================================
// ExpenseFlow — Premium Fintech App
// Vanilla JS | No frameworks | v3.0
// ========================================

// ========================================
// SUPABASE CONFIG
// ========================================
const SUPABASE_URL = 'https://uitzxtrkenciwigorday.supabase.co';
const SUPABASE_KEY = 'sb_publishable_p_VegYRa0IQPx7HsL9cyxQ_wTSslOR1';

let supabase = null;
let currentUser = null;
let isGuestMode = false;

const SYNC_QUEUE_KEY = 'expenseflow_sync_queue';
const GUEST_MODE_KEY = 'expenseflow_guest_mode';

// Initialize Supabase client (disabled — localStorage-only mode)
function initSupabase() {
  supabase = null;
}

// ========================================
// SYNC STATUS INDICATOR
// ========================================
function setSyncStatus(status) {
  // status: 'synced' | 'syncing' | 'offline' | 'hidden'
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.className = 'sync-indicator';
  if (status === 'hidden' || !currentUser) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  if (status === 'synced')  { el.classList.add('synced');  el.textContent = '✓ synced'; }
  if (status === 'syncing') { el.classList.add('syncing'); el.textContent = '↻ syncing'; }
  if (status === 'offline') { el.classList.add('offline'); el.textContent = '⚠ offline'; }
}

// ========================================
// AUTH UI
// ========================================
let authMode = 'signin'; // 'signin' | 'signup'

function showAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (screen) screen.classList.remove('hidden');
  // Hide the main app
  document.getElementById('app').style.visibility = 'hidden';
}

function hideAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (screen) screen.classList.add('hidden');
  document.getElementById('app').style.visibility = '';
}

function setAuthMode(mode) {
  authMode = mode;
  const titleEl   = document.getElementById('auth-title');
  const subEl     = document.getElementById('auth-sub');
  const submitEl  = document.getElementById('auth-submit-label');
  const toggleEl  = document.getElementById('auth-mode-toggle');
  const switchTxt = document.getElementById('auth-switch-text');
  const forgotEl  = document.getElementById('auth-forgot');
  const passGroup = document.getElementById('auth-password-group');

  if (mode === 'signup') {
    titleEl.textContent   = 'Create account';
    subEl.textContent     = 'Start syncing your expenses to the cloud';
    submitEl.textContent  = 'Sign Up';
    toggleEl.textContent  = 'Sign In';
    switchTxt.textContent = 'Already have an account?';
    forgotEl.style.display = 'none';
    passGroup.style.display = '';
  } else if (mode === 'forgot') {
    titleEl.textContent   = 'Reset password';
    subEl.textContent     = 'Enter your email and we\'ll send a reset link';
    submitEl.textContent  = 'Send Reset Link';
    toggleEl.textContent  = 'Sign In';
    switchTxt.textContent = 'Remember your password?';
    forgotEl.style.display = 'none';
    passGroup.style.display = 'none';
  } else {
    titleEl.textContent   = 'Welcome back';
    subEl.textContent     = 'Sign in to sync your data across devices';
    submitEl.textContent  = 'Sign In';
    toggleEl.textContent  = 'Sign Up';
    switchTxt.textContent = 'Don\'t have an account?';
    forgotEl.style.display = '';
    passGroup.style.display = '';
  }

  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  if (!supabase) { showAuthError('Auth service unavailable. Continue as guest.'); return; }

  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password')?.value || '';
  const submitBtn = document.getElementById('auth-submit');
  const labelEl   = document.getElementById('auth-submit-label');

  clearAuthError();
  submitBtn.disabled = true;
  const origLabel = labelEl.textContent;
  labelEl.textContent = 'Please wait…';

  try {
    if (authMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
      });
      if (error) throw error;
      showAuthError('✓ Reset link sent! Check your email.');
      submitBtn.disabled = false;
      labelEl.textContent = origLabel;
      return;
    }

    let result;
    if (authMode === 'signup') {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    const { data, error } = result;
    if (error) throw error;

    if (authMode === 'signup' && data.user && !data.session) {
      // Email confirmation required
      showAuthError('✓ Check your email to confirm your account!');
      submitBtn.disabled = false;
      labelEl.textContent = origLabel;
      return;
    }

    if (data.user) {
      const isNewUser = authMode === 'signup';
      await onAuthSuccess(data.user, isNewUser);
    }
  } catch (err) {
    submitBtn.disabled = false;
    labelEl.textContent = origLabel;
    let msg = err.message || 'Something went wrong';
    if (msg.includes('Invalid login credentials')) msg = 'Incorrect email or password.';
    if (msg.includes('User already registered')) msg = 'An account with this email already exists.';
    if (msg.includes('Password should be at least')) msg = 'Password must be at least 6 characters.';
    showAuthError(msg);
  }
}

async function onAuthSuccess(user, isNewUser = false) {
  currentUser = user;
  isGuestMode = false;
  localStorage.removeItem(GUEST_MODE_KEY);

  hideAuthScreen();
  updateAccountUI();

  // For new signups with existing local data, offer migration
  if (isNewUser) {
    const hasLocalData = expenses.length > 0 || Object.keys(budgets).length > 0 || templates.length > 0;
    if (hasLocalData) {
      showCloudImportPrompt();
      return;
    }
  }

  // Pull data from cloud and merge
  await pullFromSupabase();
  render();
  setSyncStatus('synced');
  setTimeout(() => flushSyncQueue(), 500);
}

function enterGuestMode() {
  currentUser = null;
  isGuestMode = true;
  localStorage.setItem(GUEST_MODE_KEY, '1');
  hideAuthScreen();
  updateAccountUI();
  render();
}

function updateAccountUI() {
  const accountSection = document.getElementById('account-section');
  const guestBanner    = document.getElementById('guest-banner');
  const emailEl        = document.getElementById('settings-user-email');
  const syncEl         = document.getElementById('sync-indicator');

  if (currentUser) {
    accountSection && (accountSection.style.display = '');
    guestBanner?.classList.add('hidden');
    if (emailEl) emailEl.textContent = currentUser.email || '—';
    syncEl?.classList.remove('hidden');
  } else {
    accountSection && (accountSection.style.display = 'none');
    if (isGuestMode) {
      guestBanner?.classList.remove('hidden');
    } else {
      guestBanner?.classList.add('hidden');
    }
    syncEl?.classList.add('hidden');
  }
}

async function signOut() {
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  currentUser = null;
  isGuestMode = false;
  localStorage.removeItem(GUEST_MODE_KEY);
  updateAccountUI();
  setSyncStatus('hidden');
  showAuthScreen();
}

// ========================================
// CLOUD IMPORT MIGRATION
// ========================================
function showCloudImportPrompt() {
  const overlay = document.getElementById('cloud-import-overlay');
  if (!overlay) return;
  const msgEl = document.getElementById('cloud-import-msg');
  const count = expenses.length;
  if (msgEl) {
    msgEl.textContent = `You have ${count} transaction${count !== 1 ? 's' : ''} stored locally. Would you like to upload this data to your new account?`;
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function importLocalDataToCloud() {
  const overlay = document.getElementById('cloud-import-overlay');
  overlay?.classList.remove('open');
  document.body.style.overflow = '';

  if (!currentUser || !supabase) return;

  setSyncStatus('syncing');
  let synced = 0;

  try {
    // Upload expenses
    if (expenses.length > 0) {
      const rows = expenses.map(e => expenseToRow(e, currentUser.id));
      const { error } = await supabase.from('expenses').upsert(rows, { onConflict: 'local_id,user_id' });
      if (!error) synced += rows.length;
    }

    // Upload budgets
    const budgetEntries = Object.entries(budgets);
    if (budgetEntries.length > 0) {
      const rows = budgetEntries.map(([category, monthly_limit]) => ({
        user_id: currentUser.id,
        category,
        monthly_limit,
      }));
      await supabase.from('budgets').upsert(rows, { onConflict: 'user_id,category' });
    }

    // Upload templates
    if (templates.length > 0) {
      const rows = templates.map(t => ({
        id: t.id,
        user_id: currentUser.id,
        name: t.name,
        amount: t.amount,
        category: t.category,
        description: t.icon || '',
        type: t.type || 'expense',
      }));
      await supabase.from('templates').upsert(rows, { onConflict: 'id' });
    }

    // Upload settings
    await syncSettingsToSupabase();

    setSyncStatus('synced');
    showToast(`☁️ ${synced} items uploaded to cloud ✓`);
  } catch (err) {
    console.warn('Cloud import error:', err);
    setSyncStatus('offline');
    showToast('Import partially failed — will retry on next sync');
  }
}

// ========================================
// SUPABASE DATA HELPERS
// ========================================

// Convert local expense object → Supabase row
function expenseToRow(e, userId) {
  return {
    user_id:     userId,
    local_id:    e.id,
    amount:      e.amount,
    category:    e.category,
    date:        e.date,
    description: e.description || '',
    type:        e.type || 'expense',
    recurring:   e.recurring || null,
    updated_at:  e.updatedAt ? new Date(e.updatedAt).toISOString() : new Date().toISOString(),
    created_at:  e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString(),
  };
}

// Convert Supabase row → local expense object
function rowToExpense(row) {
  return {
    id:          row.local_id || row.id,
    amount:      parseFloat(row.amount),
    category:    row.category,
    date:        row.date,
    description: row.description || '',
    type:        row.type || 'expense',
    recurring:   row.recurring || null,
    createdAt:   row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt:   row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
    _serverId:   row.id,
  };
}

// ========================================
// SYNC — PULL FROM SUPABASE
// ========================================
async function pullFromSupabase() {
  if (!supabase || !currentUser) return;

  setSyncStatus('syncing');

  try {
    // Pull expenses
    const { data: expRows, error: expErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', currentUser.id);

    if (!expErr && expRows) {
      // Merge strategy: server wins on conflict (newer updated_at)
      const serverMap = {};
      expRows.forEach(row => {
        const localId = row.local_id || row.id;
        serverMap[localId] = row;
      });

      // Keep local items not on server (pending upload), override with server version when newer
      const merged = [];
      const seenIds = new Set();

      expRows.forEach(row => {
        const localId = row.local_id || row.id;
        seenIds.add(localId);
        const local = expenses.find(e => e.id === localId);
        if (!local) {
          merged.push(rowToExpense(row));
        } else {
          // Server wins if updated_at is newer
          const serverTime = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          const localTime  = local.updatedAt || local.createdAt || 0;
          merged.push(serverTime >= localTime ? rowToExpense(row) : local);
        }
      });

      // Local-only items (not yet on server)
      expenses.forEach(e => {
        if (!seenIds.has(e.id)) merged.push(e);
      });

      // Safety: never replace local data with fewer items unless server has data
      if (merged.length >= expenses.length || expRows.length > 0) {
        expenses = merged;
        saveData();
      }
    }

    // Pull budgets
    const { data: budgetRows, error: budgetErr } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', currentUser.id);

    if (!budgetErr && budgetRows) {
      budgetRows.forEach(row => {
        if (row.monthly_limit > 0) budgets[row.category] = parseFloat(row.monthly_limit);
      });
      saveBudgets();
    }

    // Pull templates
    const { data: tplRows, error: tplErr } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', currentUser.id);

    if (!tplErr && tplRows) {
      const existingIds = new Set(templates.map(t => t.id));
      tplRows.forEach(row => {
        if (!existingIds.has(row.id)) {
          templates.push({
            id:       row.id,
            name:     row.name,
            icon:     row.description || '',
            amount:   parseFloat(row.amount),
            category: row.category,
            type:     row.type || 'expense',
          });
        }
      });
      saveTemplates();
    }

    // Pull settings
    const { data: settRows, error: settErr } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', currentUser.id)
      .limit(1);

    if (!settErr && settRows && settRows.length > 0) {
      const sett = settRows[0];
      if (sett.currency) { currency = sett.currency; }
      if (sett.theme)    { theme    = sett.theme;    }
      saveSettings();
      applyTheme(theme);
      const currSelect = document.getElementById('currency-select');
      if (currSelect) currSelect.value = currency;
    }

    setSyncStatus('synced');
  } catch (err) {
    console.warn('Pull from Supabase failed:', err);
    setSyncStatus(navigator.onLine ? 'synced' : 'offline');
  }
}

// ========================================
// SYNC — PUSH TO SUPABASE
// ========================================
async function pushExpenseToSupabase(action, expense) {
  if (!supabase || !currentUser) return false;

  try {
    if (action === 'delete') {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('local_id', expense.id)
        .eq('user_id', currentUser.id);
      return !error;
    } else {
      const row = expenseToRow(expense, currentUser.id);
      const { error } = await supabase
        .from('expenses')
        .upsert(row, { onConflict: 'local_id,user_id' });
      return !error;
    }
  } catch {
    return false;
  }
}

async function syncSettingsToSupabase() {
  if (!supabase || !currentUser) return;
  try {
    await supabase.from('user_settings').upsert({
      user_id:  currentUser.id,
      currency,
      theme,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {}
}

// ========================================
// SYNC QUEUE (offline-first)
// ========================================
function loadSyncQueue() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
  } catch { return []; }
}

function saveSyncQueue(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function enqueueSyncOp(action, table, data) {
  if (!currentUser) return;
  const queue = loadSyncQueue();
  // De-duplicate: remove old op for same item+action
  const filtered = queue.filter(op =>
    !(op.table === table && op.data?.id === data?.id && op.action === action)
  );
  filtered.push({ action, table, data, timestamp: Date.now() });
  saveSyncQueue(filtered);
}

async function flushSyncQueue() {
  if (!supabase || !currentUser || !navigator.onLine) return;

  const queue = loadSyncQueue();
  if (queue.length === 0) return;

  setSyncStatus('syncing');

  const remaining = [];
  for (const op of queue) {
    let ok = false;
    try {
      if (op.table === 'expenses') {
        ok = await pushExpenseToSupabase(op.action, op.data);
      } else if (op.table === 'budgets' && op.action !== 'delete') {
        const { error } = await supabase.from('budgets').upsert({
          user_id: currentUser.id,
          category: op.data.category,
          monthly_limit: op.data.monthly_limit,
        }, { onConflict: 'user_id,category' });
        ok = !error;
      } else if (op.table === 'settings') {
        await syncSettingsToSupabase();
        ok = true;
      }
    } catch {}
    if (!ok) remaining.push(op);
  }

  saveSyncQueue(remaining);
  setSyncStatus(remaining.length > 0 ? 'offline' : 'synced');
}

// ========================================
// ONLINE/OFFLINE LISTENER
// ========================================
function initOnlineListeners() {
  window.addEventListener('online', () => {
    if (currentUser) {
      setSyncStatus('syncing');
      setTimeout(() => flushSyncQueue(), 500);
    }
  });

  window.addEventListener('offline', () => {
    if (currentUser) setSyncStatus('offline');
  });
}

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

// Recurring interval labels
const RECURRING_LABELS = {
  daily: '🔁 Daily',
  weekly: '🔁 Weekly',
  monthly: '🔁 Monthly',
};

// --- State ---
let expenses        = [];
let currentPeriod   = 'month';
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
let budgets         = {};        // { [categoryId]: number (monthly budget) }
let templates       = [];        // [{ id, name, icon, amount, category, type }]
let currentRecurring = null;     // null | 'daily' | 'weekly' | 'monthly'
let lastOpenedDate  = null;      // ISO date string — for recurring suggestions

// --- Storage Keys ---
const STORAGE_KEY       = 'expenseflow_data';
const SETTINGS_KEY      = 'expenseflow_settings';
const BUDGETS_KEY       = 'expenseflow_budgets';
const TEMPLATES_KEY     = 'expenseflow_templates';
const LAST_OPENED_KEY   = 'expenseflow_last_opened';

// Data format version
const DATA_VERSION = 1;

// ========================================
// DATA LAYER
// ========================================

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Support both plain array (legacy) and versioned object
      expenses = Array.isArray(parsed) ? parsed : (parsed.expenses || []);
    } else {
      expenses = [];
    }
  } catch { expenses = []; }

  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.currency) currency = s.currency;
    if (s.theme)    theme    = s.theme;
  } catch {}

  try {
    const b = JSON.parse(localStorage.getItem(BUDGETS_KEY) || '{}');
    budgets = b;
  } catch { budgets = {}; }

  try {
    const t = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
    templates = Array.isArray(t) ? t : [];
  } catch { templates = []; }

  try {
    lastOpenedDate = localStorage.getItem(LAST_OPENED_KEY);
  } catch {}
}

function saveData() {
  const payload = {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    expenses,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  checkBackupReminder();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ currency, theme }));
  // Sync to Supabase (background)
  if (currentUser) {
    enqueueSyncOp('upsert', 'settings', { currency, theme });
    if (navigator.onLine) syncSettingsToSupabase();
  }
}

function saveBudgets() {
  localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets));
}

function saveTemplates() {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function saveLastOpened(dateStr) {
  localStorage.setItem(LAST_OPENED_KEY, dateStr);
  lastOpenedDate = dateStr;
}

// --- Auto-backup reminder ---
let _backupReminderLastCount = null;
function checkBackupReminder() {
  const count = expenses.length;
  if (count > 0 && count % 20 === 0 && count !== _backupReminderLastCount) {
    _backupReminderLastCount = count;
    setTimeout(() => {
      showToastWithAction(
        `💾 ${count} entries — consider exporting a backup!`,
        'Export',
        () => exportJSON(),
        5000
      );
    }, 800);
  }
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
  start.setHours(0,0,0,0);
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
  const isDark = root.getAttribute('data-theme') === 'dark';
  const lightIcon = document.getElementById('theme-icon-light');
  const darkIcon  = document.getElementById('theme-icon-dark');
  if (lightIcon && darkIcon) {
    lightIcon.style.display = isDark ? 'none'  : '';
    darkIcon.style.display  = isDark ? ''      : 'none';
  }
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
  // Remove any action button
  toast.innerHTML = '';
  toast.textContent = msg;
  toast.style.pointerEvents = 'none';
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

function showToastWithAction(msg, actionLabel, actionFn, duration = 4000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.style.pointerEvents = 'auto';
  toast.innerHTML = `
    <span>${escapeHtml(msg)}</span>
    <button class="toast-action-btn" style="margin-left:10px;padding:3px 10px;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15);color:inherit;border-radius:99px;font-size:0.75rem;font-weight:700;cursor:pointer;">${escapeHtml(actionLabel)}</button>
  `;
  toast.classList.add('visible');
  toast.querySelector('.toast-action-btn').addEventListener('click', () => {
    toast.classList.remove('visible');
    actionFn();
  });
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    toast.style.pointerEvents = 'none';
  }, duration);
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

function animateValue(el, newText) {
  if (!el) return;
  el.classList.remove('animating');
  void el.offsetWidth;
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

  document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = currency);
}

function renderFilterPills() {
  const container = document.getElementById('filter-row');
  if (!container) return;

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

  drawDonut(sorted, total);

  // Get current month budget spending for budget progress
  const currentMonthRange = getMonthRange(0);
  const monthExpenses = expenses.filter(e =>
    e.type !== 'income' &&
    e.date >= currentMonthRange.start &&
    e.date <= currentMonthRange.end
  );
  const monthByCat = {};
  monthExpenses.forEach(e => {
    monthByCat[e.category] = (monthByCat[e.category] || 0) + e.amount;
  });

  const container = document.getElementById('category-bars');
  container.innerHTML = sorted.map(([catId, amount]) => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
    const pct = total > 0 ? (amount / total) * 100 : 0;

    // Budget bar (if budget set)
    const budget = budgets[catId];
    const monthSpent = monthByCat[catId] || 0;
    let budgetHtml = '';
    if (budget && budget > 0) {
      const budgetPct = Math.min((monthSpent / budget) * 100, 100);
      const budgetColor = budgetPct >= 100 ? 'var(--expense)' : budgetPct >= 80 ? '#f59e0b' : 'var(--income)';
      budgetHtml = `
        <div class="budget-bar-wrap" title="Monthly budget: ${formatMoney(budget)}">
          <div class="budget-bar-track">
            <div class="budget-bar-fill" style="width:0%;background:${budgetColor}" data-width="${budgetPct}"></div>
          </div>
          <span class="budget-bar-label" style="color:${budgetColor}">${Math.round(budgetPct)}% of budget</span>
        </div>`;
    }

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
          ${budgetHtml}
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    container.querySelectorAll('.cat-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
    container.querySelectorAll('.budget-bar-fill').forEach(bar => {
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
  const gap   = 0.025;

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
    const recurringBadge = e.recurring
      ? `<span class="recurring-badge" title="${RECURRING_LABELS[e.recurring] || 'Recurring'}">🔁</span>`
      : '';

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
          <div class="expense-category">${cat.name}${recurringBadge}${isIncome ? ' <span style="font-size:0.65rem;background:var(--income-soft);color:var(--income);padding:1px 5px;border-radius:4px;font-weight:600;vertical-align:middle">Income</span>' : ''}</div>
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
// TEMPLATES
// ========================================

function renderTemplates() {
  const container = document.getElementById('template-quick-adds');
  if (!container) return;
  if (templates.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  container.innerHTML = `
    <div class="template-label">Quick Add</div>
    <div class="template-scroll">
      ${templates.map(t => `
        <button type="button" class="template-chip" data-tpl-id="${t.id}">
          <span>${t.icon || '⚡'}</span>
          <span class="tpl-name">${escapeHtml(t.name)}</span>
          <span class="tpl-amount">${currency}${parseFloat(t.amount).toFixed(2)}</span>
        </button>
      `).join('')}
    </div>`;
}

function applyTemplate(tplId) {
  const tpl = templates.find(t => t.id === tplId);
  if (!tpl) return;
  currentType      = tpl.type || 'expense';
  selectedCategory = tpl.category;
  document.getElementById('expense-amount').value = tpl.amount;
  document.getElementById('expense-desc').value   = tpl.name;
  syncTypeToggle();
  renderCategoryGrid();
  renderTemplates();
}

function offerSaveTemplate(expense) {
  const cat = CATEGORIES.find(c => c.id === expense.category) || CATEGORIES[7];
  showToastWithAction(
    `Save "${cat.name}" as template?`,
    'Save',
    () => {
      const name = expense.description || cat.name;
      const existing = templates.find(t =>
        t.category === expense.category &&
        t.amount === expense.amount &&
        t.name === name
      );
      if (!existing) {
        templates.push({
          id: generateId(),
          name,
          icon: cat.icon,
          amount: expense.amount,
          category: expense.category,
          type: expense.type || 'expense',
        });
        saveTemplates();
        showToast(`Template saved: ${cat.icon} ${name}`);
      } else {
        showToast('Template already exists');
      }
    },
    4000
  );
}

// ========================================
// MODAL CONTROLS
// ========================================

function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
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
  currentRecurring = null;

  document.getElementById('modal-title').textContent = 'Add Transaction';
  document.getElementById('expense-form').reset();
  document.getElementById('expense-id').value  = '';
  document.getElementById('expense-date').value = periodOffset === 0 ? today() : getDayDate(periodOffset);
  document.getElementById('btn-save').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    Save`;

  syncTypeToggle();
  syncRecurringToggle();
  renderCategoryGrid();
  renderTemplates();
  openModal(document.getElementById('modal-overlay'));
  setTimeout(() => document.getElementById('expense-amount').focus(), 350);
}

function openEditModal(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editingId        = id;
  selectedCategory = expense.category;
  currentType      = expense.type || 'expense';
  currentRecurring = expense.recurring || null;

  document.getElementById('modal-title').textContent = 'Edit Transaction';
  document.getElementById('expense-id').value          = id;
  document.getElementById('expense-amount').value      = expense.amount;
  document.getElementById('expense-date').value        = expense.date;
  document.getElementById('expense-desc').value        = expense.description || '';
  document.getElementById('btn-save').innerHTML        = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    Update`;

  syncTypeToggle();
  syncRecurringToggle();
  renderCategoryGrid();
  renderTemplates();
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

function syncRecurringToggle() {
  document.querySelectorAll('.recurring-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.recurring === (currentRecurring || 'none'));
  });
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
  let savedExpense;

  if (isEditing) {
    const idx = expenses.findIndex(ex => ex.id === editingId);
    if (idx !== -1) {
      expenses[idx] = {
        ...expenses[idx],
        amount,
        category: selectedCategory,
        date,
        description,
        type: currentType,
        recurring: currentRecurring || null,
        updatedAt: Date.now(),
      };
      savedExpense = expenses[idx];
    }
  } else {
    savedExpense = {
      id: generateId(),
      amount,
      category:    selectedCategory,
      date,
      description,
      type:        currentType,
      recurring:   currentRecurring || null,
      createdAt:   Date.now(),
    };
    expenses.push(savedExpense);
  }

  saveData();
  closeModal(document.getElementById('modal-overlay'));
  render();

  const cat = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[7];
  const toastMsg = isEditing
    ? `${cat.icon} Transaction updated`
    : `${cat.icon} ${currentType === 'income' ? 'Income' : 'Expense'} added · ${formatMoney(amount)}`;
  showToast(toastMsg);

  // Cloud sync disabled — localStorage only

  // Offer template save for new non-recurring expenses
  if (!isEditing && currentType === 'expense' && savedExpense) {
    setTimeout(() => offerSaveTemplate(savedExpense), 2500);
  }

  // Check budget warnings
  if (!isEditing && currentType === 'expense') {
    checkBudgetWarning(selectedCategory);
  }
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
  const deletedExpense = expenses.find(e => e.id === deleteTargetId);
  expenses = expenses.filter(e => e.id !== deleteTargetId);
  const id = deleteTargetId;
  deleteTargetId = null;
  saveData();
  closeModal(document.getElementById('delete-overlay'));

  // Sync deletion to Supabase
  if (currentUser && deletedExpense) {
    enqueueSyncOp('delete', 'expenses', deletedExpense);
    if (navigator.onLine) {
      setSyncStatus('syncing');
      pushExpenseToSupabase('delete', deletedExpense).then(ok => {
        if (ok) {
          const q = loadSyncQueue();
          saveSyncQueue(q.filter(op => !(op.table === 'expenses' && op.data?.id === deletedExpense.id && op.action === 'delete')));
          setSyncStatus('synced');
        } else {
          setSyncStatus('offline');
        }
      });
    } else {
      setSyncStatus('offline');
    }
  }

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
// BUDGET WARNINGS
// ========================================

function checkBudgetWarning(categoryId) {
  const budget = budgets[categoryId];
  if (!budget || budget <= 0) return;

  const r = getMonthRange(0);
  const monthSpent = expenses
    .filter(e => e.type !== 'income' && e.category === categoryId && e.date >= r.start && e.date <= r.end)
    .reduce((s, e) => s + e.amount, 0);

  const cat = CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[7];
  const pct = (monthSpent / budget) * 100;

  if (pct >= 100) {
    setTimeout(() => showToast(`🚨 ${cat.name} budget exceeded! ${formatMoney(monthSpent)} / ${formatMoney(budget)}`, 3500), 300);
  } else if (pct >= 80) {
    setTimeout(() => showToast(`⚠️ ${cat.name} at ${Math.round(pct)}% of monthly budget`, 3000), 300);
  }
}

// ========================================
// JSON IMPORT / EXPORT
// ========================================

function exportJSON() {
  const payload = {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'ExpenseFlow',
    expenses,
    budgets,
    templates,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenseflow-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported ✓');
}

function importJSON() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text    = await file.text();
      const parsed  = JSON.parse(text);
      const imported = Array.isArray(parsed) ? parsed : (parsed.expenses || []);

      if (!Array.isArray(imported)) throw new Error('Invalid format');

      const confirmed = confirm(
        `Import ${imported.length} transactions?\n\nThis will MERGE with your existing data (duplicates by ID are skipped).`
      );
      if (!confirmed) return;

      // Merge by ID
      const existingIds = new Set(expenses.map(e => e.id));
      let added = 0;
      imported.forEach(item => {
        if (item.id && !existingIds.has(item.id)) {
          expenses.push(item);
          added++;
        }
      });

      // Import budgets if present
      if (parsed.budgets && typeof parsed.budgets === 'object') {
        Object.assign(budgets, parsed.budgets);
        saveBudgets();
      }

      // Import templates if present
      if (parsed.templates && Array.isArray(parsed.templates)) {
        const existingTplIds = new Set(templates.map(t => t.id));
        parsed.templates.forEach(t => {
          if (t.id && !existingTplIds.has(t.id)) templates.push(t);
        });
        saveTemplates();
      }

      saveData();
      render();
      showToast(`✓ Imported ${added} transactions`);

      // Sync newly imported items to Supabase
      if (currentUser && added > 0 && supabase) {
        const newIds = new Set(imported.filter(i => i.id).map(i => i.id));
        const newExpenses = expenses.filter(e => newIds.has(e.id));
        newExpenses.forEach(e => enqueueSyncOp('insert', 'expenses', e));
        if (navigator.onLine) setTimeout(() => flushSyncQueue(), 300);
      }
    } catch (err) {
      showToast('Import failed: invalid file');
    }
  };
  input.click();
}

// ========================================
// CSV EXPORT (legacy - kept for Settings)
// ========================================

function exportCSV() {
  if (expenses.length === 0) {
    showToast('No data to export');
    return;
  }
  openReportModal();
}

// ========================================
// REPORT GENERATOR
// ========================================

let reportDateFrom  = '';
let reportDateTo    = '';
let reportPreset    = 'month';

function openReportModal() {
  // Set defaults
  const now = new Date();
  const r   = getMonthRange(0);
  reportDateFrom = r.start;
  reportDateTo   = r.end;
  reportPreset   = 'month';

  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;

  const fromEl = overlay.querySelector('#report-from');
  const toEl   = overlay.querySelector('#report-to');
  if (fromEl) fromEl.value = reportDateFrom;
  if (toEl)   toEl.value   = reportDateTo;

  // Highlight active preset
  syncReportPresets();
  renderReportPreview();

  openModal(overlay);
}

function syncReportPresets() {
  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.report-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === reportPreset);
  });
}

function applyReportPreset(preset) {
  reportPreset = preset;
  const now = new Date();
  let from, to;

  if (preset === 'week') {
    const r = getWeekRange(0);
    from = r.start; to = r.end;
  } else if (preset === 'month') {
    const r = getMonthRange(0);
    from = r.start; to = r.end;
  } else if (preset === 'last_month') {
    const r = getMonthRange(-1);
    from = r.start; to = r.end;
  } else if (preset === '3months') {
    const r3 = getMonthRange(-2);
    const rNow = getMonthRange(0);
    from = r3.start; to = rNow.end;
  } else if (preset === 'all') {
    if (expenses.length === 0) { from = today(); to = today(); }
    else {
      const dates = expenses.map(e => e.date).sort();
      from = dates[0]; to = dates[dates.length - 1];
    }
  }

  reportDateFrom = from;
  reportDateTo   = to;

  const overlay = document.getElementById('report-overlay');
  if (!overlay) return;
  const fromEl = overlay.querySelector('#report-from');
  const toEl   = overlay.querySelector('#report-to');
  if (fromEl) fromEl.value = from;
  if (toEl)   toEl.value   = to;

  syncReportPresets();
  renderReportPreview();
}

function getReportExpenses() {
  return expenses.filter(e => e.date >= reportDateFrom && e.date <= reportDateTo);
}

function renderReportPreview() {
  const data = getReportExpenses();
  const container = document.getElementById('report-preview-body');
  if (!container) return;

  const expOnly  = data.filter(e => e.type !== 'income');
  const incOnly  = data.filter(e => e.type === 'income');
  const totalExp = expOnly.reduce((s, e) => s + e.amount, 0);
  const totalInc = incOnly.reduce((s, e) => s + e.amount, 0);
  const balance  = totalInc - totalExp;

  // Daily average
  const days = data.length > 0
    ? Math.max(1, Math.round((new Date(reportDateTo) - new Date(reportDateFrom)) / 86400000) + 1)
    : 1;
  const dailyAvg = totalExp / days;

  // Category summary
  const byCat = {};
  expOnly.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0];

  // Biggest expense
  let biggestExp = null;
  if (expOnly.length > 0) {
    biggestExp = expOnly.reduce((max, e) => e.amount > max.amount ? e : max, expOnly[0]);
  }

  if (data.length === 0) {
    container.innerHTML = `<p class="report-empty">No transactions in this period.</p>`;
    return;
  }

  const topCatInfo = topCat ? CATEGORIES.find(c => c.id === topCat[0]) : null;

  container.innerHTML = `
    <div class="report-stats-grid">
      <div class="report-stat">
        <div class="report-stat-label">Total Spent</div>
        <div class="report-stat-val expense-color">${formatMoney(totalExp)}</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-label">Total Income</div>
        <div class="report-stat-val income-color">${formatMoney(totalInc)}</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-label">Balance</div>
        <div class="report-stat-val ${balance >= 0 ? 'income-color' : 'expense-color'}">${balance >= 0 ? '+' : ''}${formatMoney(balance)}</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-label">Daily Average</div>
        <div class="report-stat-val">${formatMoney(dailyAvg)}</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-label">Transactions</div>
        <div class="report-stat-val">${data.length}</div>
      </div>
      ${topCatInfo ? `<div class="report-stat">
        <div class="report-stat-label">Top Category</div>
        <div class="report-stat-val">${topCatInfo.icon} ${topCatInfo.name}</div>
      </div>` : ''}
    </div>
    ${biggestExp ? `<div class="report-insight">💡 Biggest expense: ${formatMoney(biggestExp.amount)} on ${formatDate(biggestExp.date)}</div>` : ''}
    ${sortedCats.length > 0 ? `
    <div class="report-cat-summary">
      <div class="report-section-title">Category Breakdown</div>
      ${sortedCats.slice(0, 5).map(([catId, amt]) => {
        const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
        const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
        return `<div class="report-cat-row">
          <span>${cat.icon} ${cat.name}</span>
          <span>${formatMoney(amt)} (${pct}%)</span>
        </div>`;
      }).join('')}
    </div>` : ''}
  `;
}

function exportReportCSV() {
  const data = getReportExpenses();
  if (data.length === 0) {
    showToast('No transactions in selected range');
    return;
  }

  const expOnly  = data.filter(e => e.type !== 'income');
  const incOnly  = data.filter(e => e.type === 'income');
  const totalExp = expOnly.reduce((s, e) => s + e.amount, 0);
  const totalInc = incOnly.reduce((s, e) => s + e.amount, 0);
  const balance  = totalInc - totalExp;

  const days = Math.max(1, Math.round((new Date(reportDateTo) - new Date(reportDateFrom)) / 86400000) + 1);
  const dailyAvg = totalExp / days;

  const byCat = {};
  expOnly.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  let csv = '';

  // Header section
  csv += `ExpenseFlow Report\n`;
  csv += `Period,${reportDateFrom} to ${reportDateTo}\n`;
  csv += `Total Spent,${totalExp.toFixed(2)}\n`;
  csv += `Total Income,${totalInc.toFixed(2)}\n`;
  csv += `Balance,${balance.toFixed(2)}\n`;
  csv += `Daily Average,${dailyAvg.toFixed(2)}\n`;
  csv += `Transactions,${data.length}\n\n`;

  // Transactions
  csv += `Date,Type,Category,Amount,Description,Recurring\n`;
  [...data].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
    csv += `${e.date},${e.type || 'expense'},${cat.name},${e.amount},"${(e.description || '').replace(/"/g, '""')}",${e.recurring || ''}\n`;
  });

  // Category summary
  csv += `\nCategory Summary\n`;
  csv += `Category,Amount,Percentage\n`;
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([catId, amt]) => {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[7];
    const pct = totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) : '0';
    csv += `${cat.name},${amt.toFixed(2)},${pct}%\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `expenseflow-report-${reportDateFrom}-${reportDateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report exported ✓');
  closeModal(document.getElementById('report-overlay'));
}

// ========================================
// SPENDING INSIGHTS
// ========================================

function openInsightsModal() {
  const overlay = document.getElementById('insights-overlay');
  if (!overlay) return;
  renderInsights();
  openModal(overlay);
}

function renderInsights() {
  const container = document.getElementById('insights-body');
  if (!container) return;

  const todayStr = today();
  const r = getMonthRange(0);
  const rPrev = getMonthRange(-1);
  const rWeek = getWeekRange(0);
  const rPrevWeek = getWeekRange(-1);

  const thisMonthExp = expenses.filter(e => e.type !== 'income' && e.date >= r.start && e.date <= r.end);
  const prevMonthExp = expenses.filter(e => e.type !== 'income' && e.date >= rPrev.start && e.date <= rPrev.end);
  const thisWeekExp  = expenses.filter(e => e.type !== 'income' && e.date >= rWeek.start && e.date <= rWeek.end);
  const prevWeekExp  = expenses.filter(e => e.type !== 'income' && e.date >= rPrevWeek.start && e.date <= rPrevWeek.end);

  const thisMonthTotal = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const prevMonthTotal = prevMonthExp.reduce((s, e) => s + e.amount, 0);
  const thisWeekTotal  = thisWeekExp.reduce((s, e) => s + e.amount, 0);

  // Daily average this month
  const daysElapsed = new Date(todayStr).getDate();
  const dailyAvg = thisMonthTotal / Math.max(1, daysElapsed);

  // Top category this month
  const byCat = {};
  thisMonthExp.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const topCat = sortedCats[0] ? CATEGORIES.find(c => c.id === sortedCats[0][0]) : null;

  // Biggest expense ever
  const allExpenses = expenses.filter(e => e.type !== 'income');
  const biggest = allExpenses.length > 0
    ? allExpenses.reduce((max, e) => e.amount > max.amount ? e : max, allExpenses[0])
    : null;
  const biggestCat = biggest ? CATEGORIES.find(c => c.id === biggest.category) : null;

  // Spending streak (consecutive days with expense logged)
  const expDays = new Set(expenses.map(e => e.date));
  let streak = 0;
  const checkDate = new Date();
  while (true) {
    const d = fmtISO(checkDate);
    if (expDays.has(d)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else break;
    if (streak > 365) break;
  }

  // Category comparison week vs prev week (food as example)
  const weekCatComparisons = [];
  CATEGORIES.forEach(cat => {
    const thisW = thisWeekExp.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
    const prevW = prevWeekExp.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0);
    if (thisW > 0 || prevW > 0) {
      weekCatComparisons.push({ cat, thisW, prevW });
    }
  });
  weekCatComparisons.sort((a, b) => b.thisW - a.thisW);
  const topWeekCat = weekCatComparisons[0];

  const insights = [];

  if (topWeekCat && topWeekCat.prevW > 0) {
    const diff = ((topWeekCat.thisW - topWeekCat.prevW) / topWeekCat.prevW) * 100;
    const dir = diff > 0 ? 'more' : 'less';
    const icon = diff > 0 ? '📈' : '📉';
    insights.push(`${icon} You spent <strong>${Math.abs(Math.round(diff))}% ${dir}</strong> on ${topWeekCat.cat.icon} ${topWeekCat.cat.name} this week vs last week`);
  } else if (topWeekCat) {
    insights.push(`📊 Top category this week: ${topWeekCat.cat.icon} ${topWeekCat.cat.name} (${formatMoney(topWeekCat.thisW)})`);
  }

  if (topCat) {
    insights.push(`🏆 Your top category this month is <strong>${topCat.icon} ${topCat.name}</strong> (${formatMoney(sortedCats[0][1])})`);
  }

  if (thisMonthTotal > 0) {
    insights.push(`📅 Daily average this month: <strong>${formatMoney(dailyAvg)}</strong>`);
  }

  if (biggest && biggestCat) {
    insights.push(`💸 Biggest expense: <strong>${formatMoney(biggest.amount)}</strong> on ${biggestCat.icon} ${biggestCat.name} (${formatDate(biggest.date)})`);
  }

  if (prevMonthTotal > 0 && thisMonthTotal > 0) {
    const mDiff = ((thisMonthTotal - prevMonthTotal) / prevMonthTotal) * 100;
    const mDir = mDiff > 0 ? 'more' : 'less';
    const mIcon = mDiff > 0 ? '⬆️' : '⬇️';
    insights.push(`${mIcon} You're spending <strong>${Math.abs(Math.round(mDiff))}% ${mDir}</strong> this month vs last month`);
  }

  if (streak > 0) {
    insights.push(`🔥 You've logged expenses for <strong>${streak} day${streak !== 1 ? 's' : ''} in a row</strong>!`);
  }

  if (expenses.length === 0) {
    container.innerHTML = `<p class="insights-empty">No data yet — start adding transactions to see insights!</p>`;
    return;
  }

  container.innerHTML = insights.map(text => `
    <div class="insight-item">${text}</div>
  `).join('') || `<p class="insights-empty">Keep adding transactions — insights will appear soon!</p>`;
}

// ========================================
// RECURRING EXPENSES
// ========================================

function checkRecurringSuggestions() {
  const todayStr = today();
  if (lastOpenedDate === todayStr) return; // already checked today

  saveLastOpened(todayStr);

  const recurringExpenses = expenses.filter(e => e.recurring);
  if (recurringExpenses.length === 0) return;

  const suggestions = [];
  recurringExpenses.forEach(e => {
    const lastDate = new Date(e.date + 'T00:00:00');
    const todayDate = new Date(todayStr + 'T00:00:00');
    const daysDiff = Math.round((todayDate - lastDate) / 86400000);

    let shouldSuggest = false;
    if (e.recurring === 'daily'   && daysDiff >= 1) shouldSuggest = true;
    if (e.recurring === 'weekly'  && daysDiff >= 7) shouldSuggest = true;
    if (e.recurring === 'monthly' && daysDiff >= 28) shouldSuggest = true;

    if (shouldSuggest) {
      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[7];
      suggestions.push({ expense: e, cat });
    }
  });

  if (suggestions.length === 0) return;

  const overlay = document.getElementById('recurring-suggest-overlay');
  if (!overlay) return;

  const body = overlay.querySelector('#recurring-suggest-body');
  if (body) {
    body.innerHTML = suggestions.map(({ expense: e, cat }) => `
      <div class="recurring-suggest-item" data-recurring-id="${e.id}">
        <div class="recurring-suggest-icon" style="background:${cat.color}18;color:${cat.color}">${cat.icon}</div>
        <div class="recurring-suggest-info">
          <div class="recurring-suggest-name">${cat.name}${e.description ? ` — ${escapeHtml(e.description)}` : ''}</div>
          <div class="recurring-suggest-meta">${RECURRING_LABELS[e.recurring] || 'Recurring'} · ${formatMoney(e.amount)}</div>
        </div>
        <button class="btn btn-sm btn-primary recurring-add-btn" data-recurring-id="${e.id}">Add</button>
      </div>
    `).join('');
  }

  openModal(overlay);
}

function addRecurringExpense(originalId) {
  const original = expenses.find(e => e.id === originalId);
  if (!original) return;

  const newEntry = {
    ...original,
    id: generateId(),
    date: today(),
    createdAt: Date.now(),
  };
  expenses.push(newEntry);
  saveData();
  render();

  const cat = CATEGORIES.find(c => c.id === original.category) || CATEGORIES[7];
  showToast(`${cat.icon} ${cat.name} recurring entry added`);

  // Sync to Supabase
  if (currentUser) {
    enqueueSyncOp('insert', 'expenses', newEntry);
    if (navigator.onLine) {
      pushExpenseToSupabase('insert', newEntry).then(ok => {
        if (ok) {
          const q = loadSyncQueue();
          saveSyncQueue(q.filter(op => !(op.table === 'expenses' && op.data?.id === newEntry.id)));
          setSyncStatus('synced');
        }
      });
    }
  }

  // Remove the item from suggestion list
  const btn = document.querySelector(`.recurring-add-btn[data-recurring-id="${originalId}"]`);
  if (btn) {
    const item = btn.closest('.recurring-suggest-item');
    if (item) item.remove();

    const body = document.getElementById('recurring-suggest-body');
    if (body && body.children.length === 0) {
      closeModal(document.getElementById('recurring-suggest-overlay'));
    }
  }
}

// ========================================
// BUDGET SETTINGS
// ========================================

function renderBudgetSettings() {
  const container = document.getElementById('budget-settings-body');
  if (!container) return;

  container.innerHTML = CATEGORIES.filter(cat => cat.id !== 'other').map(cat => {
    const budgetVal = budgets[cat.id] || '';
    return `
      <div class="budget-row">
        <div class="budget-row-cat">
          <span class="budget-cat-icon">${cat.icon}</span>
          <span class="budget-cat-name">${cat.name}</span>
        </div>
        <div class="budget-input-wrap">
          <span class="budget-currency">${currency}</span>
          <input type="number" class="budget-input" data-cat-id="${cat.id}"
            value="${budgetVal}" placeholder="No limit" min="0" step="1"
            inputmode="decimal" />
        </div>
      </div>`;
  }).join('');
}

function saveBudgetSettings() {
  const inputs = document.querySelectorAll('.budget-input');
  inputs.forEach(input => {
    const catId = input.dataset.catId;
    const val   = parseFloat(input.value);
    if (val > 0) {
      budgets[catId] = val;
    } else {
      delete budgets[catId];
    }
  });
  saveBudgets();
  renderCategories();
  showToast('Budget limits saved ✓');

  // Sync budgets to Supabase
  if (currentUser && supabase && navigator.onLine) {
    const budgetEntries = Object.entries(budgets);
    if (budgetEntries.length > 0) {
      const rows = budgetEntries.map(([category, monthly_limit]) => ({
        user_id: currentUser.id,
        category,
        monthly_limit,
      }));
      supabase.from('budgets').upsert(rows, { onConflict: 'user_id,category' }).catch(() => {});
    }
  }
}

// ========================================
// DONUT — redraw on resize
// ========================================

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderCategories(), 200);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'auto') applyTheme('auto');
});

// ========================================
// INIT
// ========================================

async function init() {
  loadData();
  applyTheme(theme);

  // Initialize Supabase
  initSupabase();
  initOnlineListeners();

  // Wire up Auth UI events
  document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
  document.getElementById('auth-mode-toggle')?.addEventListener('click', () => {
    setAuthMode(authMode === 'signin' ? 'signup' : (authMode === 'signup' ? 'signin' : 'signin'));
  });
  document.getElementById('auth-forgot')?.addEventListener('click', () => setAuthMode('forgot'));
  document.getElementById('auth-guest')?.addEventListener('click', () => enterGuestMode());
  document.getElementById('guest-banner-cta')?.addEventListener('click', () => {
    setAuthMode('signup');
    showAuthScreen();
  });
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    closeModal(document.getElementById('settings-overlay'));
    setTimeout(() => signOut(), 300);
  });

  // Cloud import modal
  document.getElementById('cloud-import-confirm')?.addEventListener('click', importLocalDataToCloud);
  document.getElementById('cloud-import-skip')?.addEventListener('click', async () => {
    const overlay = document.getElementById('cloud-import-overlay');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
    // Still pull from cloud
    await pullFromSupabase();
    render();
    setSyncStatus('synced');
    flushSyncQueue();
  });
  document.getElementById('cloud-import-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  // No cloud — go straight to app
  hideAuthScreen();
  render();

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
      currentPeriod  = tab.dataset.period;
      periodOffset   = 0;
      filterCategory = 'all';
      render();
    });
  });

  // Period nav
  document.getElementById('period-prev').addEventListener('click', () => { periodOffset--; render(); });
  document.getElementById('period-next').addEventListener('click', () => { periodOffset++; render(); });

  // Type toggle (income/expense)
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      syncTypeToggle();
    });
  });

  // Recurring toggle
  document.querySelectorAll('.recurring-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.recurring;
      currentRecurring = (val === 'none' || currentRecurring === val) ? null : val;
      syncRecurringToggle();
    });
  });

  // Category selection in form
  document.getElementById('category-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    selectedCategory = btn.dataset.cat;
    renderCategoryGrid();
  });

  // Template quick-add delegation
  document.getElementById('expense-form').addEventListener('click', (e) => {
    const chip = e.target.closest('.template-chip');
    if (chip) applyTemplate(chip.dataset.tplId);
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

  // Export CSV (now opens Report Generator)
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  // Export JSON
  document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);

  // Import JSON
  document.getElementById('btn-import-json')?.addEventListener('click', importJSON);

  // Budget settings button
  document.getElementById('btn-budget-settings')?.addEventListener('click', () => {
    renderBudgetSettings();
    closeModal(document.getElementById('settings-overlay'));
    openModal(document.getElementById('budget-overlay'));
  });

  // Save budget
  document.getElementById('btn-save-budgets')?.addEventListener('click', () => {
    saveBudgetSettings();
    closeModal(document.getElementById('budget-overlay'));
  });

  // Budget modal close
  document.getElementById('budget-close')?.addEventListener('click', () =>
    closeModal(document.getElementById('budget-overlay')));
  document.getElementById('btn-cancel-budgets')?.addEventListener('click', () =>
    closeModal(document.getElementById('budget-overlay')));
  document.getElementById('budget-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });

  // Insights button (top bar)
  document.getElementById('btn-insights')?.addEventListener('click', openInsightsModal);

  // Insights button from Settings
  document.getElementById('btn-insights-from-settings')?.addEventListener('click', () => {
    closeModal(document.getElementById('settings-overlay'));
    setTimeout(() => openInsightsModal(), 300);
  });
  document.getElementById('insights-close')?.addEventListener('click', () =>
    closeModal(document.getElementById('insights-overlay')));
  document.getElementById('insights-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });

  // Report modal
  document.getElementById('report-close')?.addEventListener('click', () =>
    closeModal(document.getElementById('report-overlay')));
  document.getElementById('report-close-btn')?.addEventListener('click', () =>
    closeModal(document.getElementById('report-overlay')));
  document.getElementById('report-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });
  document.getElementById('btn-export-report')?.addEventListener('click', exportReportCSV);

  // Report preset buttons
  document.querySelectorAll('.report-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyReportPreset(btn.dataset.preset));
  });

  // Report date range inputs
  document.getElementById('report-from')?.addEventListener('change', (e) => {
    reportDateFrom = e.target.value;
    reportPreset   = 'custom';
    syncReportPresets();
    renderReportPreview();
  });
  document.getElementById('report-to')?.addEventListener('change', (e) => {
    reportDateTo = e.target.value;
    reportPreset = 'custom';
    syncReportPresets();
    renderReportPreview();
  });

  // Recurring suggestions modal
  document.getElementById('recurring-suggest-close')?.addEventListener('click', () =>
    closeModal(document.getElementById('recurring-suggest-overlay')));
  document.getElementById('recurring-suggest-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal(e.currentTarget);
  });
  document.getElementById('recurring-suggest-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.recurring-add-btn');
    if (btn) addRecurringExpense(btn.dataset.recurringId);
  });
  document.getElementById('recurring-suggest-skip')?.addEventListener('click', () =>
    closeModal(document.getElementById('recurring-suggest-overlay')));

  // Clear all
  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    const confirmed = confirm(
      currentUser
        ? 'Delete ALL transactions locally? (Cloud data is preserved — sign out and back in to restore)'
        : 'Delete ALL transactions? This cannot be undone.'
    );
    if (confirmed) {
      expenses = [];
      saveData();
      localStorage.removeItem(SYNC_QUEUE_KEY);
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
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddModal(); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); openModal(document.getElementById('settings-overlay')); }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyTheme(isDark ? 'light' : 'dark');
      }
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); openInsightsModal(); }
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

  // Check recurring suggestions after initial render
  setTimeout(() => checkRecurringSuggestions(), 600);
}

document.addEventListener('DOMContentLoaded', init);

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}