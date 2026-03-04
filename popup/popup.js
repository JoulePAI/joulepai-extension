/**
 * JoulePAI Extension — Popup Application
 *
 * Vanilla JS single-page app. No build step required.
 * Views: Login, Wallet (balance + actions), Transfer, Transactions,
 *        Marketplace, Settings, Notifications, Developer, AutoRules, Queue.
 */

import { MSG, BSV_EXPLORER, JOULES_PER_USD } from '../utils/constants.js';
import { formatJoules, formatJoulesCompact, joulesToUsd, formatTime, truncateTx } from '../utils/format.js';

// ── State ──────────────────────────────────────────────────────
let appState = {
  view: 'loading',       // current view
  locked: true,
  wallet: null,
  exchangeRate: JOULES_PER_USD,
  transactions: [],
  notifications: [],
  settings: {},
  privacyMode: 'transparent', // transparent | confidential | private
  autoRules: [],
  autoApproveEnabled: true,
  queue: [],
  connectedSites: {},
  error: null,
  transferForm: { to: '', amount: '', note: '' },
};

const app = document.getElementById('app');

// ── Messaging ──────────────────────────────────────────────────
function send(type, data = {}) {
  return new Promise((resolve) => {
    browser.runtime.sendMessage({ type, ...data }, (response) => {
      resolve(response);
    });
  });
}

// ── Init ───────────────────────────────────────────────────────
async function init() {
  const res = await send(MSG.GET_STATE);
  if (res?.ok) {
    const d = res.data;
    appState.locked = d.locked;
    appState.wallet = d.wallet;
    appState.exchangeRate = d.exchangeRate || JOULES_PER_USD;
    appState.settings = d.settings || {};
    appState.privacyMode = d.wallet?.privacy_mode || 'transparent';

    if (d.locked || !d.wallet) {
      appState.view = 'login';
    } else {
      appState.view = 'wallet';
      loadTransactions();
      loadNotifications();
      loadAutoRules();
      loadQueue();
      loadConnectedSites();
    }
  } else {
    appState.view = 'login';
  }
  render();
}

async function loadTransactions() {
  const res = await send(MSG.GET_TRANSACTIONS, { limit: 20 });
  if (res?.ok) appState.transactions = res.data || [];
}

async function loadNotifications() {
  const res = await send(MSG.GET_NOTIFICATIONS);
  if (res?.ok) appState.notifications = res.data || [];
}

async function loadAutoRules() {
  const res = await send(MSG.GET_AUTO_RULES);
  if (res?.ok) {
    appState.autoRules = res.data.rules || [];
    appState.autoApproveEnabled = res.data.enabled !== false;
  }
}

async function loadQueue() {
  const res = await send(MSG.GET_QUEUE);
  if (res?.ok) appState.queue = res.data || [];
}

async function loadConnectedSites() {
  const res = await send(MSG.GET_CONNECTED_SITES);
  if (res?.ok) appState.connectedSites = res.data || {};
}

async function refreshBalance() {
  const res = await send(MSG.GET_BALANCE);
  if (res?.ok) {
    appState.wallet = { ...appState.wallet, ...res.data };
    render();
  }
}

// ── Navigation ─────────────────────────────────────────────────
function navigate(view) {
  appState.view = view;
  appState.error = null;
  render();
}

// ── Render ─────────────────────────────────────────────────────
function render() {
  const views = {
    loading: renderLoading,
    login: renderLogin,
    wallet: renderWallet,
    transfer: renderTransfer,
    transactions: renderTransactions,
    settings: renderSettings,
    notifications: renderNotifications,
    autorules: renderAutoRules,
    queue: renderQueue,
    developer: renderDeveloper,
    sites: renderConnectedSites,
  };

  const fn = views[appState.view] || renderWallet;
  app.innerHTML = fn();
  bindEvents();
}

// ── Bind Events (called after each render) ─────────────────────
function bindEvents() {
  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) return;

      setLoading(true);
      const res = await send(MSG.LOGIN, { email, password });
      setLoading(false);

      if (res?.ok) {
        appState.locked = false;
        appState.wallet = res.data.wallet;
        appState.exchangeRate = res.data.exchangeRate || JOULES_PER_USD;
        appState.view = 'wallet';
        loadTransactions();
        loadNotifications();
        loadAutoRules();
        loadQueue();
        render();
      } else {
        appState.error = res?.error || 'Login failed';
        render();
      }
    });
  }

  // Transfer form
  const transferForm = document.getElementById('transfer-form');
  if (transferForm) {
    transferForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const to = document.getElementById('tf-to').value.trim().replace(/^@/, '');
      const amount = parseInt(document.getElementById('tf-amount').value, 10);
      const note = document.getElementById('tf-note')?.value || '';

      if (!to || !amount || amount <= 0) {
        appState.error = 'Enter a valid handle and amount';
        render();
        return;
      }

      setLoading(true);
      const payload = { to_handle: to, amount, note, platform: 'joulepai-extension' };
      // Include privacy mode override if not using wallet default
      if (appState.privacyMode !== 'transparent') {
        payload.privacy_mode = appState.privacyMode;
      }
      const res = await send(MSG.TRANSFER, { payload });
      setLoading(false);

      if (res?.ok) {
        appState.wallet = { ...appState.wallet, balance: appState.wallet.balance - amount };
        showToast('success', `Sent ${formatJoules(amount)} joules to @${to}`);
        navigate('wallet');
        refreshBalance();
        loadTransactions();
      } else {
        appState.error = res?.error || 'Transfer failed';
        render();
      }
    });
  }

  // Nav tabs
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handleAction(el.dataset.action, el.dataset));
  });

  // Settings toggles
  document.querySelectorAll('.toggle input[data-setting]').forEach(el => {
    el.addEventListener('change', async () => {
      const key = el.dataset.setting;
      appState.settings[key] = el.checked;
      await send(MSG.SET_SETTINGS, { settings: { [key]: el.checked } });
    });
  });
}

async function handleAction(action, dataset) {
  switch (action) {
    case 'lock':
      await send(MSG.LOCK);
      appState.locked = true;
      navigate('login');
      break;
    case 'logout':
      await send(MSG.LOGOUT);
      appState.wallet = null;
      navigate('login');
      break;
    case 'refresh':
      await refreshBalance();
      await loadTransactions();
      render();
      break;
    case 'kill-auto':
      await send(MSG.KILL_AUTO_APPROVE);
      appState.autoApproveEnabled = false;
      render();
      break;
    case 'enable-auto':
      await send(MSG.SET_SETTINGS, { settings: {} });
      // Re-enable via setting autoApproveEnabled
      appState.autoApproveEnabled = true;
      await browser.storage.local.set({ autoApproveEnabled: true });
      render();
      break;
    case 'approve-queued': {
      const queueId = dataset.queueid;
      const res = await send(MSG.APPROVE_QUEUED, { queueId });
      if (res?.ok) {
        showToast('success', 'Transaction approved');
        await loadQueue();
        await refreshBalance();
      } else {
        showToast('error', res?.error || 'Failed');
      }
      render();
      break;
    }
    case 'reject-queued': {
      const queueId = dataset.queueid;
      await send(MSG.REJECT_QUEUED, { queueId });
      await loadQueue();
      render();
      break;
    }
    case 'revoke-site': {
      const origin = dataset.origin;
      await send(MSG.REVOKE_SITE, { origin });
      delete appState.connectedSites[origin];
      render();
      break;
    }
    case 'clear-notifications':
      await send(MSG.CLEAR_NOTIFICATIONS);
      appState.notifications = [];
      render();
      break;
    case 'cycle-privacy': {
      const modes = ['transparent', 'confidential', 'private'];
      const idx = modes.indexOf(appState.privacyMode);
      const next = modes[(idx + 1) % modes.length];
      if (next === 'private') {
        showToast('warning', 'Private mode (Aztec) not yet available');
        appState.privacyMode = 'transparent';
      } else {
        appState.privacyMode = next;
      }
      // Update server
      const res = await send(MSG.SET_PRIVACY_MODE, { privacy_mode: appState.privacyMode });
      if (!res?.ok) showToast('error', res?.error || 'Failed to update privacy mode');
      render();
      break;
    }
  }
}

function setLoading(loading) {
  const btn = document.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = loading;
    if (loading) btn.dataset.originalText = btn.textContent;
    btn.textContent = loading ? '...' : (btn.dataset.originalText || btn.textContent);
  }
}

function showToast(type, message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ══════════════════════════════════════════════════════════════
//  VIEW RENDERERS
// ══════════════════════════════════════════════════════════════

function renderLoading() {
  return `
    <div class="login-screen">
      <div class="login-logo">J</div>
      <div class="login-subtitle">Loading...</div>
    </div>`;
}

function renderLogin() {
  return `
    <div class="login-screen view">
      <div class="login-logo">J</div>
      <div class="login-title">JoulePAI</div>
      <div class="login-subtitle">Sign in to your wallet</div>
      <form id="login-form" class="login-form">
        <div class="input-group">
          <label class="input-label">Email</label>
          <input type="email" id="login-email" class="input" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="input-group">
          <label class="input-label">Password</label>
          <input type="password" id="login-password" class="input" placeholder="Enter password" required autocomplete="current-password">
        </div>
        ${appState.error ? `<div class="error-msg">${esc(appState.error)}</div>` : ''}
        <button type="submit" class="btn btn-primary mt-12">Sign In</button>
      </form>
    </div>`;
}

function renderHeader() {
  const unread = appState.notifications.filter(n => !n.read).length;
  const queuePending = appState.queue.filter(q => q.status === 'awaiting_approval').length;
  return `
    <div class="header">
      <div class="header-logo">
        <div class="logomark">J</div>
        <span class="brand">JoulePAI</span>
      </div>
      <div class="header-actions">
        ${queuePending > 0 ? `<button class="btn-icon" data-nav="queue" title="Queue (${queuePending} pending)" style="position:relative;border:1px solid var(--border);background:var(--bg-glass);color:var(--gold);cursor:pointer">&#9776;<span class="notif-dot" style="background:var(--gold)"></span></button>` : ''}
        <button class="btn-icon" data-nav="notifications" title="Notifications" style="position:relative;border:1px solid var(--border);background:var(--bg-glass);color:var(--silver);cursor:pointer">&#128276;${unread > 0 ? '<span class="notif-dot"></span>' : ''}</button>
        <button class="btn-icon" data-action="lock" title="Lock wallet" style="border:1px solid var(--border);background:var(--bg-glass);color:var(--silver);cursor:pointer">&#128274;</button>
      </div>
    </div>`;
}

function renderWallet() {
  const w = appState.wallet;
  if (!w) return renderLogin();

  const balance = w.balance || 0;
  const usd = joulesToUsd(balance, appState.exchangeRate);
  const handle = w.handle ? `@${w.handle}` : '';

  return `
    ${renderHeader()}
    <div class="balance-hero view">
      <div class="balance-label">Available Balance</div>
      <div class="balance-joules" id="balance-counter">${formatJoules(balance)}<span class="unit">J</span></div>
      <div class="balance-fiat">${usd}</div>
      ${handle ? `<div class="balance-handle-display">${esc(handle)}</div>` : ''}
      ${appState.privacyMode !== 'transparent' ? `<div class="privacy-badge privacy-${appState.privacyMode}">${privacyModeLabel(appState.privacyMode)}</div>` : ''}
    </div>

    <div class="actions-row">
      <button class="action-btn" data-nav="transfer">
        <span class="icon">&#8593;</span>
        Send
      </button>
      <button class="action-btn" data-action="refresh">
        <span class="icon">&#8595;</span>
        Receive
      </button>
      <button class="action-btn" data-nav="transactions">
        <span class="icon">&#9776;</span>
        Activity
      </button>
      <button class="action-btn" data-nav="settings">
        <span class="icon">&#9881;</span>
        Settings
      </button>
    </div>

    <div class="section-header">
      <span class="section-title">Recent Transactions</span>
      <button class="btn-sm" data-nav="transactions" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">View All</button>
    </div>

    <div class="tx-list-container">
      ${renderTxList(appState.transactions.slice(0, 5))}
    </div>
  `;
}

function renderTxList(txs) {
  if (!txs || txs.length === 0) {
    return '<div class="empty-state">No transactions yet</div>';
  }

  const walletId = appState.wallet?.id;
  return `<ul class="tx-list">${txs.map(tx => {
    const isIncoming = tx.to_wallet === walletId;
    const direction = isIncoming ? 'incoming' : 'outgoing';
    const arrow = isIncoming ? '&#8595;' : '&#8593;';
    const sign = isIncoming ? '+' : '-';
    const typeLabel = tx.type === 'transfer' ? (isIncoming ? 'Received' : 'Sent')
      : tx.type === 'fund' ? 'Funded'
      : tx.type === 'handle_fee' ? 'Handle Fee'
      : tx.type === 'genesis' ? 'Genesis'
      : tx.type;

    return `
      <li class="tx-item">
        <div class="tx-icon ${direction}">${arrow}</div>
        <div class="tx-details">
          <div class="tx-type">${esc(typeLabel)}</div>
          <div class="tx-meta">
            <span>${formatTime(tx.created_at)}</span>
            ${tx.bsv_tx_id ? `<a href="${BSV_EXPLORER}/${tx.bsv_tx_id}" target="_blank" class="tx-bsv-link" title="Verify on BSV">${truncateTx(tx.bsv_tx_id)}</a>` : ''}
          </div>
        </div>
        <div class="tx-amount">
          <div class="tx-amount-value ${direction}">${sign}${formatJoules(tx.amount)}</div>
        </div>
      </li>`;
  }).join('')}</ul>`;
}

function renderTransfer() {
  const w = appState.wallet;
  const balance = w?.balance || 0;
  return `
    ${renderHeader()}
    <div class="panel mt-12 view">
      <div class="section-header" style="padding:0 0 12px">
        <span class="section-title">Send Joules</span>
        <button class="btn-sm" data-nav="wallet" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715; Close</button>
      </div>
      <form id="transfer-form" class="transfer-form" style="padding:0">
        <div class="input-group transfer-recipient">
          <label class="input-label">Recipient</label>
          <span class="at-sign">@</span>
          <input type="text" id="tf-to" class="input" placeholder="handle" required value="${esc(appState.transferForm.to)}">
        </div>
        <div class="transfer-amount-row">
          <div class="input-group">
            <label class="input-label">Amount (joules)</label>
            <input type="number" id="tf-amount" class="input mono" placeholder="0" min="1" max="${balance}" required value="${esc(appState.transferForm.amount)}">
          </div>
          <div class="input-group">
            <label class="input-label">USD</label>
            <input type="text" class="input mono" readonly id="tf-usd" value="" style="color:var(--silver-dim)">
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">Note (optional)</label>
          <input type="text" id="tf-note" class="input" placeholder="What's this for?" value="${esc(appState.transferForm.note)}">
        </div>
        <div class="transfer-fee">
          <span>Fee (0.5%)</span>
          <span class="fee-value" id="tf-fee">0 J</span>
        </div>
        ${appState.error ? `<div class="error-msg">${esc(appState.error)}</div>` : ''}
        <button type="submit" class="btn btn-primary mt-8">Send Joules</button>
      </form>
    </div>
    <div class="panel mt-12" style="padding:12px;text-align:center">
      <span class="text-dim" style="font-size:11px">Balance: </span>
      <span class="mono" style="font-size:13px;color:var(--white)">${formatJoules(balance)} J</span>
    </div>
  `;
}

function renderTransactions() {
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">All Transactions</span>
      <button class="btn-sm" data-nav="wallet" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>
    <div class="tx-list-container view" style="max-height:460px">
      ${renderTxList(appState.transactions)}
    </div>`;
}

function privacyModeLabel(mode) {
  switch (mode) {
    case 'transparent': return 'Transparent';
    case 'confidential': return 'Confidential';
    case 'private': return 'Private';
    default: return 'Transparent';
  }
}

function privacyModeDesc(mode) {
  switch (mode) {
    case 'transparent': return 'Amounts and parties visible on-chain';
    case 'confidential': return 'Amounts hidden, parties visible';
    case 'private': return 'Fully private (Aztec) — coming soon';
    default: return 'Amounts and parties visible on-chain';
  }
}

function renderSettings() {
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Settings</span>
      <button class="btn-sm" data-nav="wallet" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>
    <div class="panel view">
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Auto-Lock Timer</div>
          <div class="settings-row-desc">${Math.round((appState.settings.autoLockMs || 300000) / 60000)} minutes of inactivity</div>
        </div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Biometric Unlock</div>
          <div class="settings-row-desc">Use fingerprint or face to unlock</div>
        </div>
        <label class="toggle">
          <input type="checkbox" data-setting="biometricEnabled" ${appState.settings.biometricEnabled ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Notifications</div>
          <div class="settings-row-desc">Payment and escrow alerts</div>
        </div>
        <label class="toggle">
          <input type="checkbox" data-setting="notificationsEnabled" ${appState.settings.notificationsEnabled !== false ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Privacy Mode</div>
          <div class="settings-row-desc">${privacyModeDesc(appState.privacyMode)}</div>
        </div>
        <button class="privacy-cycle-btn" data-action="cycle-privacy">${privacyModeLabel(appState.privacyMode)}</button>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Developer Mode</div>
          <div class="settings-row-desc">API key, webhook inspector</div>
        </div>
        <label class="toggle">
          <input type="checkbox" data-setting="developerMode" ${appState.settings.developerMode ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
    </div>

    <div class="nav-tabs mt-12">
      <button class="nav-tab" data-nav="autorules">Auto-Approve</button>
      <button class="nav-tab" data-nav="sites">Connected Sites</button>
      ${appState.settings.developerMode ? '<button class="nav-tab" data-nav="developer">Developer</button>' : ''}
    </div>

    <div class="panel mt-12" style="text-align:center">
      <button class="btn btn-danger btn-sm" data-action="logout">Sign Out</button>
    </div>
  `;
}

function renderNotifications() {
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Notifications</span>
      <div style="display:flex;gap:8px">
        <button class="btn-sm" data-action="clear-notifications" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">Clear All</button>
        <button class="btn-sm" data-nav="wallet" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
      </div>
    </div>
    <div class="tx-list-container view" style="max-height:460px">
      ${appState.notifications.length === 0
        ? '<div class="empty-state">No notifications</div>'
        : `<ul class="tx-list">${appState.notifications.map(n => `
            <li class="tx-item">
              <div class="tx-icon ${n.type.includes('received') || n.type.includes('connected') ? 'incoming' : n.type.includes('sent') ? 'outgoing' : 'fee'}">
                ${n.type.includes('received') ? '&#8595;' : n.type.includes('sent') ? '&#8593;' : '&#9656;'}
              </div>
              <div class="tx-details">
                <div class="tx-type">${esc(n.message)}</div>
                <div class="tx-meta"><span>${formatTime(new Date(n.time).toISOString())}</span></div>
              </div>
            </li>`).join('')}</ul>`
      }
    </div>`;
}

function renderAutoRules() {
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Auto-Approve Rules</span>
      <button class="btn-sm" data-nav="settings" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>

    <div class="kill-switch ${appState.autoApproveEnabled ? '' : 'disabled'}" data-action="${appState.autoApproveEnabled ? 'kill-auto' : 'enable-auto'}">
      ${appState.autoApproveEnabled ? '&#9888; KILL SWITCH — Disable All Auto-Approvals' : '&#10003; Auto-Approvals Disabled — Click to Re-enable'}
    </div>

    <div class="px-12 view">
      ${appState.autoRules.length === 0
        ? '<div class="empty-state">No auto-approve rules configured.<br>Rules let agents operate at machine speed within your limits.</div>'
        : appState.autoRules.map(rule => {
            const dailyPct = rule.dailyCap ? Math.min(100, ((rule.spent?.daily || 0) / rule.dailyCap) * 100) : 0;
            return `
              <div class="rule-card">
                <div class="rule-card-header">
                  <span class="rule-label">${esc(rule.label || 'Rule')}</span>
                  <span class="badge ${rule.enabled ? 'badge-green' : 'badge-red'}">${rule.enabled ? 'Active' : 'Off'}</span>
                </div>
                ${rule.sitePattern ? `<div class="rule-detail">Site: ${esc(rule.sitePattern)}</div>` : ''}
                ${rule.handlePattern ? `<div class="rule-detail">Handle: @${esc(rule.handlePattern)}</div>` : ''}
                ${rule.maxPerTx ? `<div class="rule-detail">Per tx: ${formatJoules(rule.maxPerTx)} J</div>` : ''}
                ${rule.dailyCap ? `
                  <div class="rule-detail">Daily: ${formatJoules(rule.spent?.daily || 0)} / ${formatJoules(rule.dailyCap)} J</div>
                  <div class="rule-progress"><div class="rule-progress-bar" style="width:${dailyPct}%"></div></div>
                ` : ''}
              </div>`;
          }).join('')
      }
    </div>`;
}

function renderQueue() {
  const pending = appState.queue.filter(q => q.status === 'awaiting_approval');
  const completed = appState.queue.filter(q => q.status !== 'awaiting_approval' && q.status !== 'pending');

  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Transaction Queue</span>
      <button class="btn-sm" data-nav="wallet" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>

    <div class="px-12 view">
      ${pending.length === 0
        ? '<div class="empty-state">No pending transactions</div>'
        : pending.map(q => `
            <div class="queue-item">
              <div class="tx-details">
                <div class="tx-type">@${esc(q.request?.to_handle || '?')} — ${formatJoules(q.request?.amount || 0)} J</div>
                <div class="tx-meta">
                  <span>${esc(q.origin)}</span>
                  <span>${formatTime(new Date(q.timestamp).toISOString())}</span>
                </div>
              </div>
              <div class="queue-item-actions">
                <button class="btn btn-sm btn-primary" data-action="approve-queued" data-queueid="${q.id}" style="width:auto;padding:4px 8px;font-size:10px">&#10003;</button>
                <button class="btn btn-sm btn-danger" data-action="reject-queued" data-queueid="${q.id}" style="width:auto;padding:4px 8px;font-size:10px">&#x2715;</button>
              </div>
            </div>`).join('')
      }

      ${completed.length > 0 ? `
        <div class="section-title mt-16 mb-8">Processed</div>
        ${completed.slice(0, 10).map(q => `
          <div class="queue-item" style="opacity:0.6">
            <div class="tx-details">
              <div class="tx-type">@${esc(q.request?.to_handle || '?')} — ${formatJoules(q.request?.amount || 0)} J</div>
              <div class="tx-meta"><span class="badge ${q.status === 'completed' ? 'badge-green' : 'badge-red'}">${q.status}</span></div>
            </div>
          </div>`).join('')}
      ` : ''}
    </div>`;
}

function renderDeveloper() {
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Developer Tools</span>
      <button class="btn-sm" data-nav="settings" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>
    <div class="dev-panel view">
      <div class="input-group">
        <label class="input-label">Wallet ID</label>
        <div class="api-key-display">${appState.wallet?.id || '—'}</div>
      </div>
      <div class="input-group">
        <label class="input-label">Handle</label>
        <div class="api-key-display">@${appState.wallet?.handle || '—'}</div>
      </div>
      <div class="input-group">
        <label class="input-label">Owner Type</label>
        <div class="api-key-display">${appState.wallet?.owner_type || '—'}</div>
      </div>
      <div class="input-group mt-16">
        <label class="input-label">Provider API Test</label>
        <div style="font-size:11px;color:var(--silver-dim);margin-bottom:8px;font-family:var(--font-mono)">
          window.joulepai.isInstalled → true<br>
          window.joulepai.balance() → Promise<br>
          window.joulepai.pay({ to, amount }) → Promise<br>
          window.joulepai.connect() → Promise<br>
          window.joulepai.getHandle() → Promise<br>
          window.joulepai.subscribe(event, cb) → unsub
        </div>
      </div>
    </div>`;
}

function renderConnectedSites() {
  const sites = Object.entries(appState.connectedSites);
  return `
    ${renderHeader()}
    <div class="section-header">
      <span class="section-title">Connected Sites</span>
      <button class="btn-sm" data-nav="settings" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:11px">&#x2715;</button>
    </div>
    <div class="px-12 view">
      ${sites.length === 0
        ? '<div class="empty-state">No sites connected.<br>Sites request access via the Connect JoulePAI protocol.</div>'
        : sites.map(([origin, info]) => `
            <div class="rule-card">
              <div class="rule-card-header">
                <span class="rule-label truncate" style="max-width:220px">${esc(origin)}</span>
                <button class="btn btn-sm btn-danger" data-action="revoke-site" data-origin="${esc(origin)}" style="width:auto;padding:3px 8px;font-size:10px">Revoke</button>
              </div>
              <div class="rule-detail">Permissions: ${(info.permissions || []).join(', ')}</div>
              <div class="rule-detail">Connected: ${formatTime(new Date(info.approvedAt).toISOString())}</div>
            </div>`).join('')
      }
    </div>`;
}

// ── Utility ────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ── Start ──────────────────────────────────────────────────────
init();

// Update transfer form USD estimate in real time
document.addEventListener('input', (e) => {
  if (e.target.id === 'tf-amount') {
    const amount = parseInt(e.target.value, 10) || 0;
    const usdEl = document.getElementById('tf-usd');
    const feeEl = document.getElementById('tf-fee');
    if (usdEl) usdEl.value = joulesToUsd(amount, appState.exchangeRate);
    if (feeEl) {
      const fee = Math.ceil(amount * 0.005);
      feeEl.textContent = `${formatJoules(fee)} J`;
    }
  }
});
