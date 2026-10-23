// Sveltia CMS additions for the BBF editors:
// - article previews styled like the public site;
// - the "Musiciens" menu opens the "Effectifs" board (drag-and-drop
//   musicians) instead of Sveltia's list (individual entries stay reachable
//   for details such as a photo).
(function () {
  'use strict';
  var base = document.currentScript.src;
  if (window.CMS && CMS.registerPreviewStyle) CMS.registerPreviewStyle(new URL('apercu.css', base).href);

  // The self-contained demo has no directory indexes: link the file itself.
  var effectifs = new URL('effectifs/' + ('demo' in document.documentElement.dataset ? 'index.html' : ''), base).href;
  // replace(): the browser's Back button then returns to the previous editor
  // page instead of bouncing on the redirect again.
  var versEffectifs = function () {
    if (/^#\/collections\/musiciens\/?(\?.*)?$/.test(location.hash)) location.replace(effectifs);
  };
  window.addEventListener('hashchange', versEffectifs);
  versEffectifs();
})();
