/**
 * JoulePAI Content Script — Pay with Joules Detection + Connect Badge
 *
 * Detects data-joulepai-pay elements on the page and instruments them.
 * Shows a green "Connected" badge when the site is connected.
 */

(function() {
  'use strict';

  let isConnected = false;
  let badge = null;

  // ── Check connection status ──────────────────────────────────
  async function checkConnection() {
    try {
      const result = await browser.runtime.sendMessage({
        type: 'jlp:connectRequest',
        origin: window.location.origin,
      });
      if (result?.ok && result.data?.connected) {
        isConnected = true;
        showConnectedBadge();
      }
    } catch (_) {}
  }

  // ── Connected badge ──────────────────────────────────────────
  function showConnectedBadge() {
    if (badge) return;
    badge = document.createElement('div');
    badge.className = 'joulepai-connect-badge';
    badge.innerHTML = '<span class="dot"></span> JoulePAI';
    badge.addEventListener('click', () => {
      // Open extension popup
      browser.runtime.sendMessage({ type: 'jlp:getState' });
    });
    document.body.appendChild(badge);
  }

  function removeConnectedBadge() {
    if (badge) {
      badge.remove();
      badge = null;
    }
  }

  // ── Pay with Joules button detection ─────────────────────────
  function detectPayButtons() {
    const buttons = document.querySelectorAll('[data-joulepai-pay]');
    buttons.forEach(instrumentPayButton);
  }

  function instrumentPayButton(el) {
    if (el._joulepaiInstrumented) return;
    el._joulepaiInstrumented = true;

    const to = el.getAttribute('data-to') || el.dataset.to;
    const amount = parseInt(el.getAttribute('data-amount') || el.dataset.amount, 10);
    const note = el.getAttribute('data-note') || el.dataset.note || '';

    if (!to || !amount) return;

    // Style the button if it doesn't have custom styling
    if (!el.style.cursor) el.style.cursor = 'pointer';

    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // Send pay request to background
        const result = await browser.runtime.sendMessage({
          type: 'jlp:payRequest',
          origin: window.location.origin,
          payload: {
            to_handle: to.replace(/^@/, ''),
            amount,
            note,
            platform: window.location.hostname,
          },
        });

        if (result?.ok) {
          if (result.data.autoApproved) {
            // Auto-approved: show success notification
            showPayNotification('success', `Paid ${amount.toLocaleString()} joules to @${to.replace(/^@/, '')}`);
            el.dispatchEvent(new CustomEvent('joulepai:pay:success', {
              detail: result.data.result,
            }));
          } else if (result.data.queued) {
            showPayNotification('pending', 'Payment queued — confirm in JoulePAI wallet');
          }
        } else {
          showPayNotification('error', result?.error || 'Payment failed');
          el.dispatchEvent(new CustomEvent('joulepai:pay:error', {
            detail: { error: result?.error },
          }));
        }
      } catch (err) {
        showPayNotification('error', err.message);
      }
    });
  }

  // ── Pay notification toast ───────────────────────────────────
  function showPayNotification(type, message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 56px;
      right: 16px;
      padding: 10px 16px;
      background: rgba(5, 5, 7, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid ${type === 'success' ? 'rgba(74, 222, 128, 0.3)' : type === 'error' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(184, 186, 190, 0.2)'};
      border-radius: 10px;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 12px;
      color: ${type === 'success' ? '#4ADE80' : type === 'error' ? '#F87171' : '#B8BABE'};
      z-index: 2147483647;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      animation: joulepai-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 300px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── MutationObserver for dynamically added pay buttons ───────
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.hasAttribute && node.hasAttribute('data-joulepai-pay')) {
          instrumentPayButton(node);
        }
        // Check children too
        const children = node.querySelectorAll?.('[data-joulepai-pay]');
        if (children) children.forEach(instrumentPayButton);
      }
    }
  });

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    checkConnection();
    detectPayButtons();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
