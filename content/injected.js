/**
 * JoulePAI Provider — Injected into the page context.
 *
 * Exposes window.joulepai for agent-native programmatic access.
 * Communicates with the content script via window.postMessage.
 *
 * This file runs in the PAGE's JS context (not the extension's).
 */

(function() {
  'use strict';

  if (window.joulepai) return; // already injected

  const PREFIX = 'joulepai:';
  const pendingRequests = new Map();
  let requestId = 0;
  const eventListeners = new Map(); // event -> Set<callback>

  function sendRequest(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error('JoulePAI: request timed out'));
      }, 30000);

      pendingRequests.set(id, { resolve, reject, timeout });

      window.postMessage({
        source: 'joulepai-page',
        type: PREFIX + type,
        id,
        payload,
      }, '*');
    });
  }

  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'joulepai-content') return;

    const { type, id, payload } = event.data;

    // Response to a pending request
    if (type === PREFIX + 'response' && id && pendingRequests.has(id)) {
      const { resolve, reject, timeout } = pendingRequests.get(id);
      clearTimeout(timeout);
      pendingRequests.delete(id);
      if (payload.error) {
        reject(new Error(payload.error));
      } else {
        resolve(payload.result);
      }
      return;
    }

    // Broadcast event to subscribers
    if (type === PREFIX + 'event') {
      const listeners = eventListeners.get(payload.event);
      if (listeners) {
        for (const cb of listeners) {
          try { cb(payload.data); } catch (_) {}
        }
      }
    }
  });

  // ── Public API ─────────────────────────────────────────────

  const joulepai = Object.freeze({
    /** True if the extension is installed and injected. */
    isInstalled: true,

    /**
     * Request connection with optional permission scopes.
     * @param {object} opts - { permissions: ['read_balance', 'request_payment', 'view_handle'] }
     * @returns {Promise<{ connected: boolean, permissions: string[] }>}
     */
    connect(opts = {}) {
      return sendRequest('connect', opts);
    },

    /**
     * Request a payment. If auto-approve rules match, executes silently.
     * Otherwise prompts the user in the extension popup.
     * @param {object} opts - { to: '@handle', amount: 5000, note: 'API call' }
     * @returns {Promise<{ transactionId: string, autoApproved?: boolean }>}
     */
    pay(opts) {
      if (!opts || !opts.to || !opts.amount) {
        return Promise.reject(new Error('JoulePAI: pay() requires { to, amount }'));
      }
      return sendRequest('pay', {
        to_handle: opts.to.replace(/^@/, ''),
        amount: Number(opts.amount),
        note: opts.note || '',
        platform: opts.platform || window.location.hostname,
      });
    },

    /**
     * Get current balance (requires read_balance permission).
     * @returns {Promise<{ balance: number, usd: number }>}
     */
    balance() {
      return sendRequest('balance');
    },

    /**
     * Get the connected wallet's handle.
     * @returns {Promise<string>}  e.g. "@architect"
     */
    getHandle() {
      return sendRequest('getHandle');
    },

    /**
     * Get the wallet's reputation score.
     * @returns {Promise<{ score: number, level: string }>}
     */
    getReputation() {
      return sendRequest('getReputation');
    },

    /**
     * Request specific permission scope.
     * @param {string|string[]} scope
     * @returns {Promise<{ granted: boolean, permissions: string[] }>}
     */
    requestPermission(scope) {
      const scopes = Array.isArray(scope) ? scope : [scope];
      return sendRequest('requestPermission', { permissions: scopes });
    },

    /**
     * Get the wallet's current privacy mode.
     * @returns {Promise<string>}  'transparent' | 'confidential' | 'private'
     */
    getPrivacyMode() {
      return sendRequest('getPrivacyMode');
    },

    /**
     * Subscribe to wallet events.
     * Events: 'payment_received', 'payment_sent', 'escrow_created',
     *         'match_found', 'balance_changed'
     * @param {string} event
     * @param {function} callback
     * @returns {function} unsubscribe
     */
    subscribe(event, callback) {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
        sendRequest('subscribe', { event }).catch(() => {});
      }
      eventListeners.get(event).add(callback);
      return () => eventListeners.get(event).delete(callback);
    },
  });

  Object.defineProperty(window, 'joulepai', {
    value: joulepai,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  // Signal that the provider is ready
  window.dispatchEvent(new CustomEvent('joulepai:ready'));
  window.postMessage({
    source: 'joulepai-page',
    type: 'joulepai:provider:ready',
  }, '*');
})();
