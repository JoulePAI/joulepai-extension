/**
 * JoulePAI Extension — Background Service Worker
 *
 * Manages: auth state, session tokens, auto-lock, connection permissions,
 * auto-approve rules, transaction queue, notifications, polling.
 */

// Cross-browser compatibility: Chrome MV3 uses chrome.*, Firefox uses browser.*
// In module workers importScripts() is unavailable, so we shim directly.
// Chrome MV3 APIs already return Promises, so a simple alias suffices.
if (typeof globalThis.browser === 'undefined') {
  globalThis.browser = globalThis.chrome;
}

import { MSG, AUTO_LOCK_DEFAULT_MS, BALANCE_POLL_MS, API_BASE } from '../utils/constants.js';

// ── In-memory state (lost on SW restart, rebuilt from storage) ──
let state = {
  locked: true,
  token: null,        // JWT session token
  wallet: null,       // { id, handle, balance, email, status, ... }
  exchangeRate: 1000, // joules per USD
  connectedSites: {}, // { origin: { permissions: [], approvedAt } }
  autoRules: [],      // [{ id, label, sitePattern, handlePattern, maxPerTx, dailyCap, weeklyCap, monthlyCap, spent: { daily, weekly, monthly, lastReset } }]
  autoApproveEnabled: true, // kill switch
  notifications: [],
  settings: {
    autoLockMs: AUTO_LOCK_DEFAULT_MS,
    biometricEnabled: false,
    notificationsEnabled: true,
    developerMode: false,
  },
  queue: [],          // pending transactions from auto-approve overflow
};

let lastActivity = Date.now();

// ── Bootstrap: restore from storage ────────────────────────────
async function bootstrap() {
  const stored = await browser.storage.local.get([
    'encryptedToken', 'wallet', 'connectedSites', 'autoRules',
    'autoApproveEnabled', 'notifications', 'settings', 'locked',
  ]);
  if (stored.wallet) state.wallet = stored.wallet;
  if (stored.connectedSites) state.connectedSites = stored.connectedSites;
  if (stored.autoRules) state.autoRules = stored.autoRules;
  if (stored.autoApproveEnabled !== undefined) state.autoApproveEnabled = stored.autoApproveEnabled;
  if (stored.notifications) state.notifications = stored.notifications;
  if (stored.settings) state.settings = { ...state.settings, ...stored.settings };
  state.locked = stored.locked !== false; // default locked
}

bootstrap();

// ── Persist helpers ────────────────────────────────────────────
function persist(keys) {
  const data = {};
  for (const k of keys) data[k] = state[k];
  browser.storage.local.set(data);
}

// ── API helper ─────────────────────────────────────────────────
async function api(endpoint, opts = {}) {
  const { method = 'GET', body } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}/wallet${endpoint}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    state.locked = true;
    state.token = null;
    persist(['locked']);
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────
async function handleLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail || 'Login failed');
  }
  const data = await res.json();
  state.token = data.token;
  state.locked = false;
  lastActivity = Date.now();

  // Fetch wallet info
  state.wallet = await api('/me');

  // Fetch exchange rate
  try {
    const rate = await api('/exchange-rate');
    state.exchangeRate = rate.joules_per_usd || 1000;
  } catch (_) { /* use default */ }

  persist(['wallet', 'locked']);
  setupAlarms();
  return { wallet: state.wallet, exchangeRate: state.exchangeRate };
}

function handleLogout() {
  state.token = null;
  state.wallet = null;
  state.locked = true;
  state.queue = [];
  browser.storage.local.remove(['encryptedToken']);
  persist(['wallet', 'locked']);
  browser.alarms.clearAll();
  return { ok: true };
}

function handleLock() {
  state.locked = true;
  state.token = null;
  persist(['locked']);
  return { ok: true };
}

// ── Auto-lock ──────────────────────────────────────────────────
function setupAlarms() {
  browser.alarms.create('autoLock', { periodInMinutes: 1 });
  browser.alarms.create('pollBalance', { periodInMinutes: 0.5 });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoLock') {
    if (!state.locked && state.token) {
      const idle = Date.now() - lastActivity;
      if (idle > state.settings.autoLockMs) {
        handleLock();
        browser.notifications.create('autoLock', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'JoulePAI Locked',
          message: 'Wallet locked after inactivity.',
        });
      }
    }
  }

  if (alarm.name === 'pollBalance') {
    if (!state.locked && state.token && state.wallet) {
      try {
        const fresh = await api(`/balance/${state.wallet.id}`);
        if (fresh.balance !== state.wallet.balance) {
          const diff = fresh.balance - state.wallet.balance;
          state.wallet = { ...state.wallet, ...fresh };
          persist(['wallet']);

          if (diff > 0 && state.settings.notificationsEnabled) {
            addNotification('payment_received', `Received ${diff.toLocaleString()} joules`);
            browser.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Joules Received',
              message: `+${diff.toLocaleString()} joules`,
            });
          }
        }
      } catch (_) { /* silent */ }
    }
  }
});

// ── Notifications ──────────────────────────────────────────────
function addNotification(type, message) {
  const notif = { id: crypto.randomUUID(), type, message, time: Date.now(), read: false };
  state.notifications.unshift(notif);
  if (state.notifications.length > 50) state.notifications.length = 50;
  persist(['notifications']);
  // Update badge
  const unread = state.notifications.filter(n => !n.read).length;
  browser.action.setBadgeText({ text: unread > 0 ? String(unread) : '' });
  browser.action.setBadgeBackgroundColor({ color: '#4ADE80' });
}

// ── Balance & Transactions ─────────────────────────────────────
async function getBalance() {
  if (!state.token || !state.wallet) throw new Error('Not authenticated');
  const data = await api(`/balance/${state.wallet.id}`);
  state.wallet = { ...state.wallet, ...data };
  persist(['wallet']);
  return data;
}

async function getTransactions(limit = 20) {
  if (!state.token || !state.wallet) throw new Error('Not authenticated');
  return api(`/transactions/${state.wallet.id}?limit=${limit}`);
}

async function getExchangeRate() {
  const data = await api('/exchange-rate');
  state.exchangeRate = data.joules_per_usd || 1000;
  return data;
}

// ── Transfer ───────────────────────────────────────────────────
async function handleTransfer(payload) {
  if (!state.token || !state.wallet) throw new Error('Not authenticated');
  const result = await api('/transfer', {
    method: 'POST',
    body: { from_wallet_id: state.wallet.id, ...payload },
  });
  // Refresh balance
  await getBalance();
  addNotification('payment_sent', `Sent ${payload.amount.toLocaleString()} joules`);
  return result;
}

// ── Transaction Queue (agent headless mode) ────────────────────
function enqueue(request, sender) {
  const item = {
    id: crypto.randomUUID(),
    request,
    origin: sender?.origin || 'unknown',
    timestamp: Date.now(),
    status: 'pending',
  };
  state.queue.push(item);
  return item.id;
}

async function processQueue() {
  if (state.locked || !state.token) return;

  const pending = state.queue.filter(q => q.status === 'pending');
  for (const item of pending) {
    try {
      // Check auto-approve rules
      const rule = matchAutoApproveRule(item.origin, item.request);
      if (rule && state.autoApproveEnabled) {
        if (canSpendUnderRule(rule, item.request.amount)) {
          item.status = 'processing';
          const result = await handleTransfer(item.request);
          item.status = 'completed';
          item.result = result;
          recordSpending(rule, item.request.amount);
          // Notify content script
          notifyTabResult(item, result);
        } else {
          item.status = 'held';
          addNotification('queue_held', `Transaction held: exceeds ${rule.label} daily cap`);
        }
      } else {
        item.status = 'awaiting_approval';
      }
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
    }
  }
}

// ── Auto-Approve Rules ─────────────────────────────────────────
function matchAutoApproveRule(origin, request) {
  if (!state.autoApproveEnabled) return null;
  for (const rule of state.autoRules) {
    if (!rule.enabled) continue;
    // Match by site pattern
    if (rule.sitePattern && !origin.includes(rule.sitePattern)) continue;
    // Match by handle pattern
    if (rule.handlePattern && request.to_handle !== rule.handlePattern) continue;
    // Check per-transaction cap
    if (rule.maxPerTx && request.amount > rule.maxPerTx) continue;
    return rule;
  }
  return null;
}

function canSpendUnderRule(rule, amount) {
  const now = Date.now();
  const spent = rule.spent || { daily: 0, weekly: 0, monthly: 0, lastReset: now };

  // Reset daily counter if new day
  const dayMs = 86400000;
  if (now - spent.lastReset > dayMs) {
    spent.daily = 0;
    spent.lastReset = now;
  }

  if (rule.dailyCap && spent.daily + amount > rule.dailyCap) return false;
  if (rule.weeklyCap && spent.weekly + amount > rule.weeklyCap) return false;
  if (rule.monthlyCap && spent.monthly + amount > rule.monthlyCap) return false;
  return true;
}

function recordSpending(rule, amount) {
  if (!rule.spent) rule.spent = { daily: 0, weekly: 0, monthly: 0, lastReset: Date.now() };
  rule.spent.daily += amount;
  rule.spent.weekly += amount;
  rule.spent.monthly += amount;
  persist(['autoRules']);
}

function notifyTabResult(queueItem, result) {
  // Find the tab and send the result back
  browser.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && tab.url.includes(queueItem.origin)) {
        browser.tabs.sendMessage(tab.id, {
          type: 'joulepai:queue:result',
          queueId: queueItem.id,
          result,
        });
        break;
      }
    }
  });
}

// ── Connected Sites ────────────────────────────────────────────
function handleConnectApprove(origin, permissions) {
  state.connectedSites[origin] = {
    permissions: permissions || ['read_balance', 'view_handle'],
    approvedAt: Date.now(),
  };
  persist(['connectedSites']);
  addNotification('site_connected', `Connected to ${origin}`);
  return { ok: true, permissions: state.connectedSites[origin].permissions };
}

function handleRevokeSite(origin) {
  delete state.connectedSites[origin];
  persist(['connectedSites']);
  return { ok: true };
}

function isSiteConnected(origin) {
  return !!state.connectedSites[origin];
}

function getSitePermissions(origin) {
  return state.connectedSites[origin]?.permissions || [];
}

// ── Message Router ─────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  lastActivity = Date.now();
  const handler = messageHandlers[msg.type];
  if (!handler) {
    sendResponse({ error: 'Unknown message type' });
    return false;
  }
  // All handlers are async
  handler(msg, sender)
    .then(result => sendResponse({ ok: true, data: result }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // keep channel open for async response
});

const messageHandlers = {
  [MSG.LOGIN]: async (msg) => handleLogin(msg.email, msg.password),
  [MSG.LOGOUT]: async () => handleLogout(),
  [MSG.LOCK]: async () => handleLock(),
  [MSG.GET_STATE]: async () => ({
    locked: state.locked,
    wallet: state.wallet,
    exchangeRate: state.exchangeRate,
    hasToken: !!state.token,
    settings: state.settings,
  }),
  [MSG.GET_BALANCE]: async () => getBalance(),
  [MSG.TRANSFER]: async (msg) => handleTransfer(msg.payload),
  [MSG.GET_TRANSACTIONS]: async (msg) => getTransactions(msg.limit || 20),
  [MSG.GET_EXCHANGE_RATE]: async () => getExchangeRate(),

  // Connected sites
  [MSG.CONNECT_APPROVE]: async (msg) => handleConnectApprove(msg.origin, msg.permissions),
  [MSG.CONNECT_REJECT]: async () => ({ ok: true }),
  [MSG.REVOKE_SITE]: async (msg) => handleRevokeSite(msg.origin),
  [MSG.GET_CONNECTED_SITES]: async () => state.connectedSites,

  // Auto-approve rules
  [MSG.GET_AUTO_RULES]: async () => ({ rules: state.autoRules, enabled: state.autoApproveEnabled }),
  [MSG.SET_AUTO_RULE]: async (msg) => {
    const existing = state.autoRules.findIndex(r => r.id === msg.rule.id);
    if (existing >= 0) {
      state.autoRules[existing] = { ...state.autoRules[existing], ...msg.rule };
    } else {
      state.autoRules.push({ id: crypto.randomUUID(), enabled: true, spent: { daily: 0, weekly: 0, monthly: 0, lastReset: Date.now() }, ...msg.rule });
    }
    persist(['autoRules']);
    return { ok: true };
  },
  [MSG.DELETE_AUTO_RULE]: async (msg) => {
    state.autoRules = state.autoRules.filter(r => r.id !== msg.ruleId);
    persist(['autoRules']);
    return { ok: true };
  },
  [MSG.KILL_AUTO_APPROVE]: async () => {
    state.autoApproveEnabled = false;
    persist(['autoApproveEnabled']);
    addNotification('kill_switch', 'All auto-approvals disabled');
    return { ok: true };
  },

  // Settings
  [MSG.GET_SETTINGS]: async () => state.settings,
  [MSG.SET_SETTINGS]: async (msg) => {
    state.settings = { ...state.settings, ...msg.settings };
    persist(['settings']);
    return state.settings;
  },

  // Privacy
  [MSG.SET_PRIVACY_MODE]: async (msg) => {
    const mode = msg.privacy_mode;
    if (!['transparent', 'confidential', 'private'].includes(mode)) {
      return { ok: false, error: 'Invalid privacy mode' };
    }
    if (mode === 'private') {
      return { ok: false, error: 'Private mode (Aztec) not yet available' };
    }
    if (!state.wallet?.id) {
      return { ok: false, error: 'No wallet' };
    }
    try {
      const res = await apiFetch('/wallet/privacy-mode', {
        method: 'PUT',
        body: JSON.stringify({
          wallet_id: state.wallet.id,
          privacy_mode: mode,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        state.wallet = data;
        persist(['wallet']);
        return { ok: true, privacy_mode: mode };
      }
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.detail || 'Server error' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // Notifications
  [MSG.GET_NOTIFICATIONS]: async () => {
    state.notifications.forEach(n => n.read = true);
    persist(['notifications']);
    browser.action.setBadgeText({ text: '' });
    return state.notifications;
  },
  [MSG.CLEAR_NOTIFICATIONS]: async () => {
    state.notifications = [];
    persist(['notifications']);
    browser.action.setBadgeText({ text: '' });
    return { ok: true };
  },

  // Queue
  [MSG.GET_QUEUE]: async () => state.queue,
  [MSG.APPROVE_QUEUED]: async (msg) => {
    const item = state.queue.find(q => q.id === msg.queueId);
    if (item && item.status === 'awaiting_approval') {
      try {
        const result = await handleTransfer(item.request);
        item.status = 'completed';
        item.result = result;
        notifyTabResult(item, result);
        return result;
      } catch (err) {
        item.status = 'failed';
        item.error = err.message;
        throw err;
      }
    }
    throw new Error('Queue item not found or not awaiting approval');
  },
  [MSG.REJECT_QUEUED]: async (msg) => {
    const item = state.queue.find(q => q.id === msg.queueId);
    if (item) {
      item.status = 'rejected';
      notifyTabResult(item, { error: 'Rejected by user' });
    }
    return { ok: true };
  },

  // Content script: connect protocol
  [MSG.CONNECT_REQUEST]: async (msg, sender) => {
    const origin = msg.origin || sender?.tab?.url;
    if (isSiteConnected(origin)) {
      return { connected: true, permissions: getSitePermissions(origin) };
    }
    // Open popup with connect prompt
    // The popup will show a permission dialog
    return { connected: false, needsApproval: true, origin };
  },

  // Content script: pay request
  [MSG.PAY_REQUEST]: async (msg, sender) => {
    if (state.locked || !state.token) {
      return { error: 'Wallet is locked' };
    }
    const origin = msg.origin || sender?.tab?.url || 'unknown';

    // Check auto-approve
    const rule = matchAutoApproveRule(origin, msg.payload);
    if (rule && state.autoApproveEnabled && canSpendUnderRule(rule, msg.payload.amount)) {
      const result = await handleTransfer(msg.payload);
      recordSpending(rule, msg.payload.amount);
      return { autoApproved: true, result };
    }

    // Queue for manual approval
    const queueId = enqueue(msg.payload, { origin });
    return { queued: true, queueId };
  },
};

// ── Extension icon click (when no popup) ───────────────────────
// The popup handles this, but we ensure badge is updated
browser.runtime.onInstalled.addListener(() => {
  browser.action.setBadgeText({ text: '' });
  browser.action.setBadgeBackgroundColor({ color: '#4ADE80' });
});

// ── External message handling (from content scripts in other origins) ──
browser.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Not used in MV3 with content scripts, but reserved for future
  sendResponse({ error: 'Use content script messaging' });
});
