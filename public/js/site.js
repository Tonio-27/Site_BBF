// Brass Band Fribourg — public site enhancements. No dependencies, no tracking.
(function () {
  'use strict';

  // Mobile menu
  var bouton = document.querySelector('.entete__menu');
  var nav = document.getElementById('nav-principale');
  if (bouton && nav) {
    var fermer = function () {
      bouton.setAttribute('aria-expanded', 'false');
      nav.classList.remove('ouvert');
    };
    bouton.addEventListener('click', function () {
      var ouvert = bouton.getAttribute('aria-expanded') === 'true';
      bouton.setAttribute('aria-expanded', String(!ouvert));
      nav.classList.toggle('ouvert', !ouvert);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('ouvert')) {
        fermer();
        bouton.focus();
      }
    });
  }

  // E-mail addresses are stored reversed in data attributes to deter harvesters.
  document.querySelectorAll('a.email[data-u]').forEach(function (a) {
    var inv = function (s) { return s.split('').reverse().join(''); };
    var adresse = inv(a.dataset.u) + '@' + inv(a.dataset.d);
    a.href = 'mailto:' + adresse;
    a.textContent = adresse;
  });

  // Agenda filter (All / A / B)
  var filtres = document.querySelector('[data-filtres]');
  if (filtres) {
    filtres.hidden = false;
    var statut = document.querySelector('[data-filtre-statut]');
    var aucun = document.querySelector('[data-aucun]');
    filtres.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filtre]');
      if (!b) return;
      var valeur = b.dataset.filtre;
      filtres.querySelectorAll('[data-filtre]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      var visibles = 0;
      document.querySelectorAll('[data-groupe]').forEach(function (g) {
        var n = 0;
        g.querySelectorAll('[data-ensembles]').forEach(function (li) {
          var ok = valeur === 'tous' || li.dataset.ensembles.split(' ').indexOf(valeur) !== -1;
          li.hidden = !ok;
          if (ok) n++;
        });
        g.hidden = n === 0;
        visibles += n;
      });
      if (aucun) aucun.hidden = visibles !== 0 || document.querySelectorAll('[data-groupe]').length === 0;
      if (statut) statut.textContent = visibles + ' événement' + (visibles > 1 ? 's' : '') + ' affiché' + (visibles > 1 ? 's' : '');
    });
  }

  // YouTube: load the privacy-enhanced player only after a click.
  document.querySelectorAll('[data-youtube]').forEach(function (bloc) {
    var lien = bloc.querySelector('a');
    if (!lien) return;
    lien.addEventListener('click', function (e) {
      e.preventDefault();
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(bloc.dataset.youtube) + '?autoplay=1';
      iframe.title = 'Vidéo YouTube';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.setAttribute('allowfullscreen', '');
      bloc.replaceChildren(iframe);
      iframe.focus();
    });
  });

  // Photo lightbox: keyboard, buttons and swipe.
  var galerie = document.querySelector('[data-galerie]');
  var dialog = document.querySelector('[data-visionneuse]');
  if (galerie && dialog && typeof dialog.showModal === 'function') {
    var liens = Array.prototype.slice.call(galerie.querySelectorAll('a[data-index]'));
    var img = dialog.querySelector('[data-v-image]');
    var legende = dialog.querySelector('[data-v-legende]');
    var compteur = dialog.querySelector('[data-v-compteur]');
    var courant = 0;
    var afficher = function (i) {
      courant = (i + liens.length) % liens.length;
      var l = liens[courant];
      var vignette = l.querySelector('img');
      img.src = l.getAttribute('href');
      img.alt = vignette ? vignette.alt : '';
      legende.textContent = l.dataset.legende || '';
      compteur.textContent = 'Photo ' + (courant + 1) + ' sur ' + liens.length;
    };
    galerie.addEventListener('click', function (e) {
      var l = e.target.closest('a[data-index]');
      if (!l) return;
      e.preventDefault();
      afficher(Number(l.dataset.index));
      dialog.showModal();
    });
    dialog.querySelector('[data-v-fermer]').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('[data-v-prec]').addEventListener('click', function () { afficher(courant - 1); });
    dialog.querySelector('[data-v-suiv]').addEventListener('click', function () { afficher(courant + 1); });
    dialog.addEventListener('close', function () { liens[courant].focus(); });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') afficher(courant - 1);
      if (e.key === 'ArrowRight') afficher(courant + 1);
    });
    var debutX = null;
    dialog.addEventListener('touchstart', function (e) { debutX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', function (e) {
      if (debutX === null) return;
      var dx = e.changedTouches[0].clientX - debutX;
      if (Math.abs(dx) > 50) afficher(courant + (dx < 0 ? 1 : -1));
      debutX = null;
    });
  }
})();
