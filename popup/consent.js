document.getElementById('agree').addEventListener('click', async () => {
  await (typeof browser !== 'undefined' ? browser : chrome).storage.local.set({
    dataConsentGranted: true,
    dataConsentAt: new Date().toISOString(),
  });
  window.location.href = 'popup.html';
});
document.getElementById('decline').addEventListener('click', () => {
  window.close();
});
