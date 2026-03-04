/**
 * JoulePAI Content Script — Provider Bridge
 *
 * Runs in the content script isolated world.
 * Bridges page-level window.joulepai calls to the background service worker.
 * Also injects the provider script into the page context.
 */

(function() {
  'use strict';

  // Inject the provider script into the page's JS context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  const PREFIX = 'joulepai:';

  // ── Bridge: page → content script → background ──────────────
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'joulepai-page') return;

    const { type, id, payload } = event.data;
    if (!type || !type.startsWith(PREFIX)) return;

    const action = type.replace(PREFIX, '');
    let result;

    try {
      switch (action) {
        case 'connect':
          result = await chrome.runtime.sendMessage({
            type: 'jlp:connectRequest',
            origin: window.location.origin,
            permissions: payload.permissions || ['read_balance', 'view_handle'],
          });
          break;

        case 'pay':
          result = await chrome.runtime.sendMessage({
            type: 'jlp:payRequest',
            origin: window.location.origin,
            payload,
          });
          break;

        case 'balance':
          result = await chrome.runtime.sendMessage({
            type: 'jlp:getBalance',
            origin: window.location.origin,
          });
          break;

        case 'getHandle':
          result = await chrome.runtime.sendMessage({
            type: 'jlp:getState',
          });
          if (result?.ok) {
            result = { ok: true, data: { result: result.data.wallet?.handle || null } };
          }
          break;

        case 'getReputation':
          // Placeholder — reputation system TBD
          result = { ok: true, data: { result: { score: 0, level: 'new' } } };
          break;

        case 'requestPermission':
          result = await chrome.runtime.sendMessage({
            type: 'jlp:connectRequest',
            origin: window.location.origin,
            permissions: payload.permissions,
          });
          break;

        case 'subscribe':
          // Register interest — events pushed via background polling
          result = { ok: true, data: { result: { subscribed: true, event: payload.event } } };
          break;

        case 'provider:ready':
          // Provider injected successfully
          return;

        default:
          result = { ok: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }

    // Send response back to the page
    const response = {
      source: 'joulepai-content',
      type: PREFIX + 'response',
      id,
      payload: result?.ok
        ? { result: result.data }
        : { error: result?.error || 'Unknown error' },
    };

    window.postMessage(response, '*');
  });

  // ── Forward background events to the page ────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'joulepai:queue:result') {
      window.postMessage({
        source: 'joulepai-content',
        type: PREFIX + 'event',
        payload: {
          event: 'payment_result',
          data: msg.result,
        },
      }, '*');
    }
  });
})();
