// Day / night mode. Runs in <head> before paint so a page never flashes the wrong theme.
// Follows the device setting until the visitor picks one with the toggle; the pick is remembered.
(function () {
  var KEY = 'looplove-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved !== 'dark' && saved !== 'light') saved = null;

  function current() { return saved || (media && media.matches ? 'dark' : 'light'); }

  function apply() {
    var t = current();
    root.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      if (!meta.dataset.day) meta.dataset.day = meta.content;
      meta.content = t === 'dark' ? '#1B0F18' : meta.dataset.day;
    }
    var label = t === 'dark' ? 'Switch to day mode' : 'Switch to night mode';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', label);
      b.title = label;
    });
  }

  apply();
  if (media && media.addEventListener) media.addEventListener('change', function () { if (!saved) apply(); });
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!b) return;
    saved = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, saved); } catch (err) {}
    root.classList.add('theme-fade');
    apply();
    setTimeout(function () { root.classList.remove('theme-fade'); }, 400);
  });
})();
