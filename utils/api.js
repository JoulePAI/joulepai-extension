/**
 * JoulePAI API client for the browser extension.
 * All calls go through the background service worker to keep
 * the API key out of popup/content script contexts.
 */

const API_BASE = 'https://joulepai.ai/api/v1/wallet';

export async function apiCall(endpoint, options = {}) {
  const { method = 'GET', body, token } = options;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }

  return res.json();
}

// ── Wallet ──────────────────────────────────────────────────────
export const getMe = (token) => apiCall('/me', { token });
export const getBalance = (walletId, token) => apiCall(`/balance/${walletId}`, { token });
export const getTransactions = (walletId, token, limit = 20) =>
  apiCall(`/transactions/${walletId}?limit=${limit}`, { token });

// ── Transfers ───────────────────────────────────────────────────
export const transfer = (token, payload) =>
  apiCall('/transfer', { method: 'POST', body: payload, token });

// ── Funding ─────────────────────────────────────────────────────
export const fundWallet = (token, payload) =>
  apiCall('/fund', { method: 'POST', body: payload, token });
export const fundingStatus = (eventId, token) =>
  apiCall(`/fund/status/${eventId}`, { token });

// ── Handle ──────────────────────────────────────────────────────
export const setHandle = (token, payload) =>
  apiCall('/handle', { method: 'PUT', body: payload, token });

// ── Limits ──────────────────────────────────────────────────────
export const getLimits = (walletId, token) => apiCall(`/limits/${walletId}`, { token });
export const setLimits = (token, payload) =>
  apiCall('/limits', { method: 'PUT', body: payload, token });

// ── Deposit ─────────────────────────────────────────────────────
export const getDepositInfo = (walletId, token) =>
  apiCall(`/deposit-info/${walletId}`, { token });
export const getDepositAddress = (walletId, token) =>
  apiCall(`/deposit-address/${walletId}`, { method: 'POST', token });

// ── Verification ────────────────────────────────────────────────
export const verifyPayment = (txId, token) => apiCall(`/verify-payment/${txId}`, { token });

// ── Exchange Rate ───────────────────────────────────────────────
export const getExchangeRate = (token) => apiCall('/exchange-rate', { token });

// ── Auth ────────────────────────────────────────────────────────
export const login = (email, password) =>
  apiCall('/login', {
    method: 'POST',
    body: { email, password },
  });

// Note: login endpoint is on auth_routes, adjust base if needed
const AUTH_BASE = 'https://joulepai.ai/api/v1/auth';
export const authLogin = async (email, password) => {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Auth ${res.status}`);
  }
  return res.json();
};
