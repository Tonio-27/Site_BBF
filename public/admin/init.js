// Sveltia CMS additions for the BBF editors:
// - article previews styled like the public site;
// - a shortcut to the "Effectifs" board (drag-and-drop musicians);
// - the "Musiciens" menu opens that board instead of Sveltia's list
//   (individual entries stay reachable for details such as a photo).
(function () {
  'use strict';
  var base = document.currentScript.src;
  if (window.CMS && CMS.registerPreviewStyle) CMS.registerPreviewStyle(new URL('apercu.css', base).href);

  var lien = document.createElement('a');
  // The self-contained demo has no directory indexes: link the file itself.
  lien.href = new URL('effectifs/' + ('demo' in document.documentElement.dataset ? 'index.html' : ''), base).href;
  lien.className = 'bbf-raccourci';
  lien.innerHTML = '<span aria-hidden="true">⇄</span> Effectifs <small>glisser-déposer</small>';
  lien.title = 'Gérer les musiciens par pupitre : ajouter, déplacer, retirer';
  // Sveltia handles link clicks as in-app navigation: leave the app explicitly.
  lien.addEventListener('click', function (e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.assign(lien.href);
  });
  var style = document.createElement('style');
  style.textContent =
    '.bbf-raccourci{position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:6px;' +
    'background:#0d0d0d;color:#fff;text-decoration:none!important;font:600 14px/1 "Source Sans 3",system-ui,sans-serif;' +
    'padding:10px 14px;border-radius:999px;box-shadow:0 6px 18px rgb(0 0 0/.25)}' +
    '.bbf-raccourci *{text-decoration:none!important}.bbf-raccourci span{color:#ff4d57;font-size:16px}.bbf-raccourci small{color:#bdbdbd;font-weight:400}' +
    '.bbf-raccourci:hover{background:#e30613}.bbf-raccourci:hover span,.bbf-raccourci:hover small{color:#fff}' +
    '.bbf-raccourci:focus-visible{outline:3px solid #e30613;outline-offset:2px}';
  document.head.appendChild(style);
  // replace(): the browser's Back button then returns to the previous editor
  // page instead of bouncing on the redirect again.
  var versEffectifs = function () {
    if (/^#\/collections\/musiciens\/?(\?.*)?$/.test(location.hash)) location.replace(lien.href);
  };
  window.addEventListener('hashchange', versEffectifs);
  versEffectifs();

  var poser = function () { document.body.appendChild(lien); };
  if (document.body) poser(); else document.addEventListener('DOMContentLoaded', poser);
})();
