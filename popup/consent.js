const b = typeof browser !== 'undefined' ? browser : chrome;

document.getElementById('agree').addEventListener('click', async () => {
  await b.storage.local.set({
    dataConsentGranted: true,
    dataConsentAt: new Date().toISOString(),
  });
  window.location.href = 'popup.html';
});

document.getElementById('decline').addEventListener('click', async () => {
  // Offer to uninstall — requires "management" permission
  try {
    await b.management.uninstallSelf({ showConfirmDialog: true });
  } catch (_) {
    // If management API unavailable, just close
    window.close();
  }
});
