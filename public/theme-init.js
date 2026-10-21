// Apply the saved theme before first paint to avoid a light/dark flash.
// Kept as a static file so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('chatss:prefs:v1') || '{}');
    var dark =
      p.theme === 'dark' ||
      ((!p.theme || p.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* storage unavailable */
  }
})();
