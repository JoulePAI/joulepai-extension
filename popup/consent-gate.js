(async () => {
  const b = typeof browser !== 'undefined' ? browser : chrome;
  const { dataConsentGranted } = await b.storage.local.get('dataConsentGranted');
  if (!dataConsentGranted) {
    window.location.href = 'consent.html';
  }
})();
