/**
 * Shared constants for the JoulePAI extension.
 */

// ── Design tokens ───────────────────────────────────────────────
export const COLORS = {
  bg:           '#050507',
  bgPanel:      'rgba(20, 20, 25, 0.85)',
  bgGlass:      'rgba(30, 30, 38, 0.6)',
  border:       'rgba(184, 186, 190, 0.12)',
  borderHover:  'rgba(184, 186, 190, 0.25)',
  silver:       '#B8BABE',
  silverLight:  '#D4D6DA',
  silverDim:    'rgba(184, 186, 190, 0.5)',
  accent:       '#7B8794',
  green:        '#4ADE80',
  greenDim:     'rgba(74, 222, 128, 0.15)',
  red:          '#F87171',
  redDim:       'rgba(248, 113, 113, 0.15)',
  gold:         '#D4A853',
  goldDim:      'rgba(212, 168, 83, 0.15)',
  white:        '#FFFFFF',
};

// ── Typography ──────────────────────────────────────────────────
export const FONTS = {
  mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ── Dimensions ──────────────────────────────────────────────────
export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 600;

// ── Timing ──────────────────────────────────────────────────────
export const AUTO_LOCK_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes
export const BALANCE_POLL_MS = 30_000; // 30s
export const TX_POLL_MS = 60_000; // 1 min

// ── API ─────────────────────────────────────────────────────────
export const API_BASE = 'https://joulepai.ai/api/v1';
export const BSV_EXPLORER = 'https://whatsonchain.com/tx';
export const JOULES_PER_USD = 1000;

// ── Messages (popup <-> background) ─────────────────────────────
export const MSG = {
  // Auth
  LOGIN:              'jlp:login',
  LOGOUT:             'jlp:logout',
  GET_STATE:          'jlp:getState',
  LOCK:               'jlp:lock',
  UNLOCK:             'jlp:unlock',
  // Wallet
  GET_BALANCE:        'jlp:getBalance',
  TRANSFER:           'jlp:transfer',
  GET_TRANSACTIONS:   'jlp:getTransactions',
  GET_EXCHANGE_RATE:  'jlp:getExchangeRate',
  // Connect protocol
  CONNECT_REQUEST:    'jlp:connectRequest',
  CONNECT_APPROVE:    'jlp:connectApprove',
  CONNECT_REJECT:     'jlp:connectReject',
  REVOKE_SITE:        'jlp:revokeSite',
  GET_CONNECTED_SITES:'jlp:getConnectedSites',
  // Pay with Joules
  PAY_REQUEST:        'jlp:payRequest',
  PAY_CONFIRM:        'jlp:payConfirm',
  PAY_REJECT:         'jlp:payReject',
  // Auto-approve
  GET_AUTO_RULES:     'jlp:getAutoRules',
  SET_AUTO_RULE:      'jlp:setAutoRule',
  DELETE_AUTO_RULE:   'jlp:deleteAutoRule',
  KILL_AUTO_APPROVE:  'jlp:killAutoApprove',
  // Settings
  GET_SETTINGS:       'jlp:getSettings',
  SET_SETTINGS:       'jlp:setSettings',
  // Privacy
  SET_PRIVACY_MODE:   'jlp:setPrivacyMode',
  // Notifications
  GET_NOTIFICATIONS:  'jlp:getNotifications',
  CLEAR_NOTIFICATIONS:'jlp:clearNotifications',
  // Queue
  GET_QUEUE:          'jlp:getQueue',
  APPROVE_QUEUED:     'jlp:approveQueued',
  REJECT_QUEUED:      'jlp:rejectQueued',
};

// ── Content <-> Page messages ───────────────────────────────────
export const PAGE_MSG = {
  PROVIDER_READY:     'joulepai:provider:ready',
  CONNECT:            'joulepai:connect',
  CONNECT_RESULT:     'joulepai:connect:result',
  PAY:                'joulepai:pay',
  PAY_RESULT:         'joulepai:pay:result',
  BALANCE:            'joulepai:balance',
  BALANCE_RESULT:     'joulepai:balance:result',
  GET_HANDLE:         'joulepai:getHandle',
  GET_HANDLE_RESULT:  'joulepai:getHandle:result',
  GET_REPUTATION:     'joulepai:getReputation',
  GET_REPUTATION_RESULT:'joulepai:getReputation:result',
  REQUEST_PERMISSION: 'joulepai:requestPermission',
  REQUEST_PERMISSION_RESULT:'joulepai:requestPermission:result',
  SUBSCRIBE:          'joulepai:subscribe',
  EVENT:              'joulepai:event',
};
