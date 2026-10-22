// Effectifs — drag-and-drop editor for the musicians of both formations.
// Data model: one JSON file per musician in src/content/musiciens (unchanged
// from the CMS), so this board and Sveltia CMS always edit the same files.
// Storage: GitHub (production, uses the Sveltia session token) or the
// browser's private file system shared with Sveltia's test repository (demo).
(function () {
  'use strict';

  var D = JSON.parse(document.getElementById('donnees').textContent);
  var PUPITRES = D.pupitres;
  var CLES = ['prenom', 'nom', 'ensemble', 'pupitre', 'ordre', 'photo', 'actif'];

  // ------------------------------------------------------------------ helpers
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texte') n.textContent = attrs[k];
      else if (k === 'classe') n.className = attrs[k];
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };
  var slug = function (s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  var comparer = function (a, b) { return a.localeCompare(b, 'fr-CH'); };
  var pluriel = function (n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); };

  function annoncer(texte, type) {
    var a = $('#annonce');
    a.textContent = texte;
    a.className = 'annonce visible' + (type ? ' annonce--' + type : '');
    clearTimeout(annoncer.t);
    annoncer.t = setTimeout(function () { a.className = 'annonce'; }, type === 'erreur' ? 9000 : 4000);
  }

  // ------------------------------------------------------------------ storage
  function versBase64(texte) {
    var octets = new TextEncoder().encode(texte);
    var bin = '';
    for (var i = 0; i < octets.length; i++) bin += String.fromCharCode(octets[i]);
    return btoa(bin);
  }

  var Github = {
    nom: 'GitHub',
    jeton: function () {
      try { return (JSON.parse(localStorage.getItem('sveltia-cms.user')) || {}).token; } catch (e) { return null; }
    },
    graphql: function (requete, variables) {
      return fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + this.jeton(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: requete, variables: variables }),
      }).then(function (r) {
        if (r.status === 401) throw new Error('Session expirée : reconnectez-vous dans l’éditeur du site.');
        return r.json();
      }).then(function (j) {
        if (j.errors) throw new Error(j.errors.map(function (e) { return e.message; }).join(' ; '));
        return j.data;
      });
    },
    charger: function () {
      if (!this.jeton()) return Promise.reject(Object.assign(new Error('non-connecte'), { connexion: true }));
      var p = D.depot.split('/');
      return this.graphql(
        'query($o:String!,$n:String!,$ref:String!,$exp:String!){repository(owner:$o,name:$n){ref(qualifiedName:$ref){target{oid}} object(expression:$exp){... on Tree{entries{name object{... on Blob{text}}}}}}}',
        { o: p[0], n: p[1], ref: 'refs/heads/' + D.branche, exp: D.branche + ':' + D.dossier },
      ).then(function (d) {
        var repo = d.repository;
        return {
          version: repo.ref.target.oid,
          fichiers: (repo.object ? repo.object.entries : [])
            .filter(function (e) { return /\.json$/.test(e.name) && e.object; })
            .map(function (e) { return { chemin: D.dossier + '/' + e.name, texte: e.object.text }; }),
        };
      });
    },
    enregistrer: function (modifs, message, version) {
      var self = this;
      // Re-read first: refuse to overwrite a file someone changed meanwhile.
      return this.charger().then(function (actuel) {
        var parChemin = {};
        actuel.fichiers.forEach(function (f) { parChemin[f.chemin] = f.texte; });
        var conflits = modifs.touches.filter(function (t) { return (parChemin[t.chemin] || null) !== t.origine; });
        if (conflits.length) {
          throw new Error('Quelqu’un a modifié ' + pluriel(conflits.length, 'musicien') + ' entre-temps. Rechargez la page pour repartir de la dernière version.');
        }
        return self.graphql(
          'mutation($i:CreateCommitOnBranchInput!){createCommitOnBranch(input:$i){commit{oid}}}',
          {
            i: {
              branch: { repositoryNameWithOwner: D.depot, branchName: D.branche },
              message: { headline: message },
              expectedHeadOid: actuel.version,
              fileChanges: {
                additions: modifs.ecritures.map(function (f) { return { path: f.chemin, contents: versBase64(f.texte) }; }),
                deletions: modifs.suppressions.map(function (c) { return { path: c }; }),
              },
            },
          },
        );
      });
    },
  };

  // Demo: Sveltia's "test repository" lives in the Origin Private File System.
  var RACINE_TEST = 'sveltia-cms-test';
  var Demo = {
    nom: 'démo',
    racine: function () {
      if (!navigator.storage || !navigator.storage.getDirectory) return Promise.reject(new Error('OPFS indisponible'));
      return navigator.storage.getDirectory().then(function (opfs) {
        return opfs.getDirectoryHandle(RACINE_TEST).catch(function () {
          return Demo.semer(opfs).then(function () { return opfs.getDirectoryHandle(RACINE_TEST); });
        });
      });
    },
    // Same seeding as Sveltia (link rel="cms-seed-url"), so both tools share one sandbox.
    semer: function (opfs) {
      var lien = document.querySelector('link[rel="cms-seed-url"]');
      var manifeste = new URL(lien.getAttribute('href'), location.href);
      return fetch(manifeste).then(function (r) { return r.json(); }).then(function (m) {
        return Promise.all(m.files.map(function (chemin) {
          return fetch(new URL(chemin, manifeste)).then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
        })).then(function (blobs) {
          return opfs.getDirectoryHandle(RACINE_TEST, { create: true }).then(function (racine) {
            return Promise.all(m.files.map(function (chemin, i) { return blobs[i] && Demo.ecrire(racine, chemin, blobs[i]); }));
          });
        });
      });
    },
    dossier: function (racine, chemin, creer) {
      return chemin.split('/').reduce(function (p, nom) {
        return p.then(function (d) { return d.getDirectoryHandle(nom, { create: creer }); });
      }, Promise.resolve(racine));
    },
    ecrire: function (racine, chemin, contenu) {
      var parties = chemin.split('/');
      var nom = parties.pop();
      return Demo.dossier(racine, parties.join('/'), true).then(function (d) {
        return d.getFileHandle(nom, { create: true });
      }).then(function (f) {
        return f.createWritable().then(function (w) { return w.write(contenu).then(function () { return w.close(); }); });
      });
    },
    charger: function () {
      return this.racine().then(function (racine) {
        return Demo.dossier(racine, D.dossier, true).then(function (dossier) {
          var fichiers = [];
          var it = dossier.values();
          var suivant = function () {
            return it.next().then(function (r) {
              if (r.done) return;
              if (r.value.kind === 'file' && /\.json$/.test(r.value.name)) {
                return r.value.getFile().then(function (f) { return f.text(); }).then(function (t) {
                  fichiers.push({ chemin: D.dossier + '/' + r.value.name, texte: t });
                  return suivant();
                });
              }
              return suivant();
            });
          };
          return suivant().then(function () { return { version: null, fichiers: fichiers }; });
        });
      });
    },
    enregistrer: function (modifs) {
      return this.racine().then(function (racine) {
        return Promise.all(modifs.ecritures.map(function (f) { return Demo.ecrire(racine, f.chemin, f.texte); })).then(function () {
          return Demo.dossier(racine, D.dossier, false).then(function (d) {
            return Promise.all(modifs.suppressions.map(function (c) { return d.removeEntry(c.split('/').pop()); }));
          });
        });
      });
    },
  };

  // Last resort (very old browser or blocked storage): build-time snapshot, kept in memory.
  var Memoire = {
    nom: 'mémoire',
    fichiers: D.fichiers.slice(),
    charger: function () { return Promise.resolve({ version: null, fichiers: this.fichiers.slice() }); },
    enregistrer: function (modifs) {
      var map = {};
      this.fichiers.forEach(function (f) { map[f.chemin] = f.texte; });
      modifs.ecritures.forEach(function (f) { map[f.chemin] = f.texte; });
      modifs.suppressions.forEach(function (c) { delete map[c]; });
      this.fichiers = Object.keys(map).map(function (c) { return { chemin: c, texte: map[c] }; });
      return Promise.resolve();
    },
  };

  var stockage = D.mode === 'github' ? Github : Demo;

  // ------------------------------------------------------------------ state
  var etat = { musiciens: [], supprimes: [], touches: {} };
  var version = null;
  var ensemble = 'A';
  var historique = [];
  var futur = [];
  var compteur = 0;

  var cleGroupe = function (m) { return m.ensemble + '|' + m.pupitre; };

  function depuisFichiers(fichiers) {
    var liste = [];
    fichiers.forEach(function (f) {
      try {
        var d = JSON.parse(f.texte);
        liste.push({
          id: 'm' + (++compteur), chemin: f.chemin, origine: f.texte,
          prenom: d.prenom || '', nom: d.nom || '', ensemble: d.ensemble === 'B' ? 'B' : 'A',
          pupitre: PUPITRES.indexOf(d.pupitre) >= 0 ? d.pupitre : PUPITRES[PUPITRES.length - 1],
          ordre: typeof d.ordre === 'number' ? d.ordre : undefined,
          photo: d.photo, actif: d.actif !== false,
        });
      } catch (e) {
        console.warn('Fichier illisible ignoré :', f.chemin, e);
      }
    });
    liste.sort(function (a, b) {
      return PUPITRES.indexOf(a.pupitre) - PUPITRES.indexOf(b.pupitre) ||
        (a.ordre === undefined ? 999 : a.ordre) - (b.ordre === undefined ? 999 : b.ordre) ||
        comparer(a.nom, b.nom) || comparer(a.prenom, b.prenom);
    });
    return liste;
  }

  function sauverEtape() {
    historique.push(JSON.stringify(etat));
    if (historique.length > 200) historique.shift();
    futur = [];
  }
  function annuler() {
    if (!historique.length) return;
    futur.push(JSON.stringify(etat));
    etat = JSON.parse(historique.pop());
    rendre();
    annoncer('Action annulée.');
  }
  function retablir() {
    if (!futur.length) return;
    historique.push(JSON.stringify(etat));
    etat = JSON.parse(futur.pop());
    rendre();
    annoncer('Action rétablie.');
  }

  var trouver = function (id) { return etat.musiciens.filter(function (m) { return m.id === id; })[0]; };
  var membres = function (ens, pup) {
    return etat.musiciens.filter(function (m) { return m.actif && m.ensemble === ens && m.pupitre === pup; });
  };

  /**
   * Move musician `id` into group (ens, pup) at position `index`. Without an
   * index (keyboard, menu, new entry) it takes its natural place (stored order,
   * then name), so no other file needs renumbering.
   */
  function placer(id, ens, pup, index) {
    var m = trouver(id);
    etat.touches[cleGroupe(m)] = true;
    etat.musiciens.splice(etat.musiciens.indexOf(m), 1);
    m.ensemble = ens; m.pupitre = pup; m.actif = true;
    etat.touches[cleGroupe(m)] = true;
    var groupe = membres(ens, pup);
    if (index === undefined) {
      index = groupe.length;
      for (var k = 0; k < groupe.length; k++) {
        if (ordreNaturel(m, groupe[k]) < 0) { index = k; break; }
      }
    }
    var position;
    if (index === undefined || index >= groupe.length) {
      position = groupe.length ? etat.musiciens.indexOf(groupe[groupe.length - 1]) + 1 : etat.musiciens.length;
    } else {
      position = etat.musiciens.indexOf(groupe[index]);
    }
    etat.musiciens.splice(position, 0, m);
  }

  // ------------------------------------------------------------------ diff
  function serialiser(m, ordre) {
    var o = { prenom: m.prenom, nom: m.nom, ensemble: m.ensemble, pupitre: m.pupitre };
    if (ordre !== undefined) o.ordre = ordre;
    if (m.photo) o.photo = m.photo;
    o.actif = m.actif;
    var trie = {};
    CLES.forEach(function (k) { if (k in o) trie[k] = o[k]; });
    return JSON.stringify(trie, null, 2) + '\n';
  }

  // Compare contents, not formatting: files written by other tools may differ
  // in whitespace or key order without any real change.
  function normaliser(texte) {
    if (texte === null || texte === undefined) return null;
    try {
      var o = JSON.parse(texte);
      var trie = {};
      Object.keys(o).sort().forEach(function (k) { trie[k] = o[k]; });
      return JSON.stringify(trie);
    } catch (e) { return texte; }
  }
  var inchange = function (texte, origine) { return origine !== null && normaliser(texte) === normaliser(origine); };

  function ordreNaturel(a, b) {
    return (a.ordre === undefined ? 999 : a.ordre) - (b.ordre === undefined ? 999 : b.ordre) ||
      comparer(a.nom, b.nom) || comparer(a.prenom, b.prenom);
  }

  // Numbering is only rewritten for a section whose displayed order can no
  // longer be obtained from the stored numbers and names: moving one musician
  // then changes one file, not the whole section.
  function ordres() {
    var res = {};
    var groupes = {};
    etat.musiciens.forEach(function (m) {
      res[m.id] = m.ordre;
      if (!m.actif) return;
      var k = cleGroupe(m);
      (groupes[k] = groupes[k] || []).push(m);
    });
    Object.keys(groupes).forEach(function (k) {
      if (!etat.touches[k]) return;
      var actuel = groupes[k];
      var naturel = actuel.slice().sort(ordreNaturel);
      var identique = actuel.every(function (m, i) { return m === naturel[i]; });
      if (!identique) actuel.forEach(function (m, i) { res[m.id] = i + 1; });
    });
    return res;
  }

  function cheminLibre(m, pris) {
    var base = D.dossier + '/' + (slug(m.nom + '-' + m.prenom) || 'musicien');
    var c = base + '.json';
    for (var i = 2; pris[c]; i++) c = base + '-' + i + '.json';
    pris[c] = true;
    return c;
  }

  function calculerModifs() {
    var o = ordres();
    var pris = {};
    etat.musiciens.forEach(function (m) { if (m.chemin) pris[m.chemin] = true; });
    etat.supprimes.forEach(function (s) { pris[s.chemin] = true; });
    var ecritures = [];
    var touches = [];
    var resume = [];
    etat.musiciens.forEach(function (m) {
      var texte = serialiser(m, o[m.id]);
      if (inchange(texte, m.origine)) return;
      var chemin = m.chemin || cheminLibre(m, pris);
      ecritures.push({ chemin: chemin, texte: texte, id: m.id });
      touches.push({ chemin: chemin, origine: m.origine });
      var avant = m.origine ? JSON.parse(m.origine) : null;
      var qui = m.prenom + ' ' + m.nom;
      var type;
      if (!avant) type = ['ajout', qui + ' ajouté·e (' + m.pupitre + ', ' + m.ensemble + ')'];
      else if (avant.actif !== false && !m.actif) type = ['retrait', qui + ' retiré·e de l’effectif'];
      else if (avant.actif === false && m.actif) type = ['retour', qui + ' réintégré·e'];
      else if (avant.ensemble !== m.ensemble || avant.pupitre !== m.pupitre) type = ['deplacement', qui + ' : ' + avant.pupitre + ' (' + avant.ensemble + ') → ' + m.pupitre + ' (' + m.ensemble + ')'];
      else if (avant.prenom !== m.prenom || avant.nom !== m.nom) type = ['modif', avant.prenom + ' ' + avant.nom + ' renommé·e en ' + qui];
      else type = ['ordre', qui];
      resume.push(type);
    });
    var renumerotes = resume.filter(function (r) { return r[0] === 'ordre'; }).length;
    resume = resume.filter(function (r) { return r[0] !== 'ordre'; });
    if (renumerotes) resume.push(['ordre', 'Ordre d’affichage mis à jour (' + pluriel(renumerotes, 'fiche') + ')']);
    var suppressions = etat.supprimes.map(function (s) {
      touches.push({ chemin: s.chemin, origine: s.origine });
      resume.push(['suppression', s.libelle + ' supprimé·e définitivement']);
      return s.chemin;
    });
    return { ecritures: ecritures, suppressions: suppressions, touches: touches, resume: resume };
  }

  function messageCommit(resume) {
    var noms = { ajout: 'ajout', retrait: 'retrait', retour: 'réintégration', deplacement: 'déplacement', modif: 'modification', ordre: 'réordonnancement', suppression: 'suppression' };
    var n = {};
    resume.forEach(function (r) { n[r[0]] = (n[r[0]] || 0) + 1; });
    var parties = Object.keys(n).filter(function (k) { return k !== 'ordre' || Object.keys(n).length === 1; })
      .map(function (k) { return n[k] + ' ' + noms[k] + (n[k] > 1 ? 's' : ''); });
    return 'content: effectifs — ' + (parties.join(', ') || 'ordre des pupitres');
  }

  // ------------------------------------------------------------------ rendering
  var sortables = [];
  var plateau = $('#plateau');
  var recherche = $('#recherche');

  function ligne(m) {
    var li = el('li', { classe: 'musicien', 'data-id': m.id, tabindex: '0', 'aria-label': m.prenom + ' ' + m.nom + ', ' + m.pupitre });
    var modifie = !inchange(serialiser(m, ordresCourants[m.id]), m.origine);
    li.appendChild(el('span', { classe: 'musicien__poignee', 'aria-hidden': 'true', texte: '⋮⋮' }));
    li.appendChild(el('span', { classe: 'musicien__nom' }, [el('span', { texte: m.prenom + ' ' }), el('strong', { texte: m.nom })]));
    if (m.origine === null) li.appendChild(el('span', { classe: 'etiquette etiquette--nouveau', texte: 'nouveau' }));
    else if (modifie) li.appendChild(el('span', { classe: 'point-modif', title: 'Modifié, non enregistré', 'aria-label': 'modifié' }));
    li.appendChild(el('button', { type: 'button', classe: 'musicien__menu', 'aria-label': 'Actions pour ' + m.prenom + ' ' + m.nom, 'aria-haspopup': 'menu', texte: '⋯' }));
    return li;
  }

  var ordresCourants = {};
  function rendre() {
    ordresCourants = ordres();
    sortables.forEach(function (s) { s.destroy(); });
    sortables = [];
    var focus = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-id]');
    var idFocus = focus && focus.getAttribute('data-id');

    plateau.textContent = '';
    PUPITRES.forEach(function (pup, i) {
      var liste = membres(ensemble, pup);
      var section = el('section', { classe: 'pupitre' + (liste.length ? '' : ' pupitre--vide'), 'aria-labelledby': 'pup-' + i });
      section.appendChild(el('header', { classe: 'pupitre__tete' }, [
        el('h2', { id: 'pup-' + i, texte: pup }),
        el('span', { classe: 'pupitre__nb', texte: String(liste.length) }),
      ]));
      var ul = el('ul', { classe: 'pupitre__liste', 'data-pupitre': pup, 'aria-label': pup });
      liste.forEach(function (m) { ul.appendChild(ligne(m)); });
      section.appendChild(ul);
      var ajout = el('form', { classe: 'ajout', 'data-pupitre': pup });
      ajout.appendChild(el('label', { classe: 'visuellement-cache', for: 'ajout-' + i, texte: 'Ajouter un musicien en ' + pup }));
      ajout.appendChild(el('input', { type: 'text', id: 'ajout-' + i, name: 'nom', placeholder: '＋ Ajouter (Prénom Nom)', autocomplete: 'off' }));
      section.appendChild(ajout);
      plateau.appendChild(section);
    });

    $$('.pupitre__liste', plateau).forEach(function (ul) {
      sortables.push(new Sortable(ul, {
        group: 'effectifs', animation: 150, forceFallback: true, fallbackOnBody: true,
        handle: '.musicien', filter: '.musicien__menu', preventOnFilter: false,
        ghostClass: 'musicien--fantome', chosenClass: 'musicien--choisi', dragClass: 'musicien--glisse',
        emptyInsertThreshold: 24, onStart: debutGlisser, onEnd: finGlisser,
      }));
    });

    // Header counts and side panel.
    ['A', 'B'].forEach(function (e) {
      $('[data-nb="' + e + '"]').textContent = etat.musiciens.filter(function (m) { return m.actif && m.ensemble === e; }).length;
    });
    $$('[data-onglet]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-onglet') === ensemble)); });
    var lienSite = $('[data-lien-site]');
    lienSite.setAttribute('href', lienSite.getAttribute('href').split('#')[0] + '#formation-' + ensemble.toLowerCase());
    rendreAnciens();
    filtrer();
    rendreBarre();
    $('#btn-annuler').disabled = !historique.length;
    $('#btn-retablir').disabled = !futur.length;

    if (idFocus) {
      var cible = plateau.querySelector('[data-id="' + idFocus + '"]');
      if (cible) cible.focus();
    }
  }

  function rendreAnciens() {
    var anciens = etat.musiciens.filter(function (m) { return !m.actif; })
      .sort(function (a, b) { return comparer(a.nom, b.nom); });
    $('#nb-anciens').textContent = anciens.length;
    var ul = $('#liste-anciens');
    ul.textContent = '';
    if (!anciens.length) ul.appendChild(el('li', { classe: 'anciens__vide', texte: 'Aucun ancien musicien.' }));
    anciens.forEach(function (m) {
      ul.appendChild(el('li', { classe: 'ancien', 'data-id': m.id }, [
        el('span', { classe: 'ancien__nom' }, [m.prenom + ' ', el('strong', { texte: m.nom }), el('small', { texte: m.pupitre + ' · ' + m.ensemble })]),
        el('button', { type: 'button', classe: 'bouton bouton--petit', 'data-action': 'reintegrer', texte: 'Réintégrer' }),
        el('button', { type: 'button', classe: 'bouton bouton--petit bouton--danger', 'data-action': 'supprimer', 'aria-label': 'Supprimer définitivement ' + m.prenom + ' ' + m.nom, texte: 'Supprimer' }),
      ]));
    });
    if (ul._sortable) ul._sortable.destroy();
    ul._sortable = new Sortable(ul, {
      group: { name: 'effectifs', pull: true, put: false }, sort: false, forceFallback: true, fallbackOnBody: true,
      draggable: '.ancien', filter: 'button', preventOnFilter: false, onStart: debutGlisser, onEnd: finGlisser,
    });
  }

  function rendreBarre() {
    var modifs = calculerModifs();
    var n = modifs.resume.length;
    var barre = $('#barre-enregistrer');
    barre.hidden = !n;
    document.body.classList.toggle('a-modifs', !!n);
    $('#nb-modifs').textContent = n ? pluriel(n, 'modification') + ' non enregistrée' + (n > 1 ? 's' : '') : '';
    var detail = $('#detail');
    detail.textContent = '';
    modifs.resume.forEach(function (r) { detail.appendChild(el('li', { classe: 'detail--' + r[0], texte: r[1] })); });
  }

  function filtrer() {
    var q = slug(recherche.value.trim());
    var n = 0;
    $$('.musicien', plateau).forEach(function (li) {
      var m = trouver(li.getAttribute('data-id'));
      var ok = !q || slug(m.prenom + ' ' + m.nom).indexOf(q) >= 0 || slug(m.nom + ' ' + m.prenom).indexOf(q) >= 0;
      li.classList.toggle('musicien--estompe', !ok);
      li.classList.toggle('musicien--trouve', !!q && ok);
      if (q && ok) n++;
    });
    var autre = ensemble === 'A' ? 'B' : 'A';
    var ailleurs = q ? etat.musiciens.filter(function (m) {
      return m.actif && m.ensemble === autre && slug(m.prenom + ' ' + m.nom).indexOf(q) >= 0;
    }).length : 0;
    $('#resultat').textContent = q ? pluriel(n, 'résultat') + (ailleurs ? ' · ' + ailleurs + ' en Formation ' + autre : '') : '';
  }

  // ------------------------------------------------------------------ drag & drop
  function debutGlisser() { document.body.classList.add('glisse-en-cours'); }

  function finGlisser(evt) {
    document.body.classList.remove('glisse-en-cours');
    $$('.onglet--cible').forEach(function (b) { b.classList.remove('onglet--cible'); });
    var id = evt.item.getAttribute('data-id');
    var m = trouver(id);
    var pt = evt.originalEvent && (evt.originalEvent.changedTouches ? evt.originalEvent.changedTouches[0] : evt.originalEvent);
    var sous = pt && document.elementFromPoint(pt.clientX, pt.clientY);
    var onglet = sous && sous.closest && sous.closest('[data-onglet]');

    // Dropped on the other formation's tab: move there, same section.
    if (onglet && onglet.getAttribute('data-onglet') !== m.ensemble) {
      sauverEtape();
      var cible = onglet.getAttribute('data-onglet');
      placer(id, cible, m.pupitre);
      rendre();
      annoncer(m.prenom + ' ' + m.nom + ' passe en Formation ' + cible + ' (' + m.pupitre + ').');
      return;
    }
    if (evt.to === evt.from && evt.oldIndex === evt.newIndex) { rendre(); return; }
    var pup = evt.to.getAttribute('data-pupitre');
    if (!pup) { rendre(); return; }
    sauverEtape();
    var etaitInactif = !m.actif;
    placer(id, ensemble, pup, evt.newIndex);
    rendre();
    annoncer(etaitInactif ? m.prenom + ' ' + m.nom + ' réintégré·e en ' + pup + '.' :
      evt.to === evt.from ? m.prenom + ' ' + m.nom + ' : nouvel ordre.' : m.prenom + ' ' + m.nom + ' → ' + pup + '.');
  }

  document.addEventListener('pointermove', function (e) {
    if (!document.body.classList.contains('glisse-en-cours')) return;
    $$('[data-onglet]').forEach(function (b) {
      var r = b.getBoundingClientRect();
      var dessus = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      b.classList.toggle('onglet--cible', dessus && b.getAttribute('data-onglet') !== ensemble);
    });
  });

  // ------------------------------------------------------------------ actions
  function deplacerDansGroupe(m, delta) {
    var groupe = membres(m.ensemble, m.pupitre);
    var i = groupe.indexOf(m);
    var j = i + delta;
    if (j < 0 || j >= groupe.length) return;
    sauverEtape();
    // Order within a section is the array order: swapping two neighbours is enough.
    var a = etat.musiciens.indexOf(m);
    var b = etat.musiciens.indexOf(groupe[j]);
    etat.musiciens[a] = groupe[j];
    etat.musiciens[b] = m;
    etat.touches[cleGroupe(m)] = true;
    rendre();
  }

  function changerPupitre(m, delta) {
    var i = PUPITRES.indexOf(m.pupitre) + delta;
    if (i < 0 || i >= PUPITRES.length) return;
    sauverEtape();
    placer(m.id, m.ensemble, PUPITRES[i]);
    rendre();
    annoncer(m.prenom + ' ' + m.nom + ' → ' + PUPITRES[i] + '.');
  }

  function changerFormation(m) {
    var cible = m.ensemble === 'A' ? 'B' : 'A';
    sauverEtape();
    placer(m.id, cible, m.pupitre);
    rendre();
    annoncer(m.prenom + ' ' + m.nom + ' passe en Formation ' + cible + '.');
  }

  function retirer(m) {
    sauverEtape();
    etat.touches[cleGroupe(m)] = true;
    m.actif = false;
    rendre();
    annoncer(m.prenom + ' ' + m.nom + ' retiré·e de l’effectif (voir « Anciens musiciens »). Ctrl+Z pour annuler.');
  }

  function supprimer(m) {
    sauverEtape();
    etat.musiciens.splice(etat.musiciens.indexOf(m), 1);
    if (m.origine !== null) etat.supprimes.push({ chemin: m.chemin, origine: m.origine, libelle: m.prenom + ' ' + m.nom });
    rendre();
    annoncer(m.prenom + ' ' + m.nom + ' sera supprimé·e définitivement à l’enregistrement.');
  }

  function decouperNom(texte) {
    var t = texte.trim().replace(/\s+/g, ' ');
    if (!t) return null;
    if (t.indexOf(',') >= 0) {
      var p = t.split(',');
      return { nom: p[0].trim(), prenom: p.slice(1).join(' ').trim() };
    }
    var mots = t.split(' ');
    if (mots.length === 1) return { prenom: mots[0], nom: '' };
    return { prenom: mots[0], nom: mots.slice(1).join(' ') };
  }

  function ajouter(nom, ens, pup) {
    var d = decouperNom(nom);
    if (!d) return null;
    var m = { id: 'n' + (++compteur), chemin: null, origine: null, prenom: d.prenom, nom: d.nom, ensemble: ens, pupitre: pup, actif: true };
    etat.musiciens.push(m);
    placer(m.id, ens, pup);
    return m;
  }

  // Row menu
  var menu = $('#menu');
  var menuPour = null;
  function ouvrirMenu(bouton, m) {
    menuPour = m;
    var autre = m.ensemble === 'A' ? 'B' : 'A';
    var groupe = membres(m.ensemble, m.pupitre);
    var i = groupe.indexOf(m);
    menu.textContent = '';
    [
      ['modifier', 'Modifier…', 'Entrée'],
      ['monter', 'Monter', 'Alt+↑', i === 0],
      ['descendre', 'Descendre', 'Alt+↓', i === groupe.length - 1],
      ['formation', 'Passer en Formation ' + autre],
      ['retirer', 'Retirer de l’effectif', 'Suppr'],
    ].forEach(function (a) {
      menu.appendChild(el('button', { type: 'button', role: 'menuitem', 'data-action': a[0], disabled: !!a[3], classe: a[0] === 'retirer' ? 'menu__danger' : '' }, [
        el('span', { texte: a[1] }), a[2] ? el('kbd', { texte: a[2] }) : null,
      ]));
    });
    menu.hidden = false;
    var r = bouton.getBoundingClientRect();
    var largeur = menu.offsetWidth;
    menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - largeur, window.innerWidth - largeur - 8)) + 'px';
    menu.querySelector('button:not([disabled])').focus();
    menu._bouton = bouton;
  }
  function fermerMenu(rendreFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (rendreFocus && menu._bouton) menu._bouton.focus();
  }
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]');
    if (!b || !menuPour) return;
    var m = menuPour;
    fermerMenu(false);
    ({
      modifier: function () { ouvrirEdition(m); },
      monter: function () { deplacerDansGroupe(m, -1); },
      descendre: function () { deplacerDansGroupe(m, 1); },
      formation: function () { changerFormation(m); },
      retirer: function () { retirer(m); },
    })[b.getAttribute('data-action')]();
  });
  menu.addEventListener('keydown', function (e) {
    var items = $$('button:not([disabled])', menu);
    var i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); fermerMenu(true); }
  });
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.musicien__menu')) fermerMenu(false);
  });
  window.addEventListener('resize', function () { fermerMenu(false); });
  window.addEventListener('scroll', function () { fermerMenu(false); }, true);

  // Edit dialog
  var dlg = $('#dialogue-musicien');
  var formM = $('#form-musicien');
  var enEdition = null;
  PUPITRES.forEach(function (p) {
    $('#dm-pupitre').appendChild(el('option', { value: p, texte: p }));
    $('#di-pupitre').appendChild(el('option', { value: p, texte: p }));
  });
  function ouvrirEdition(m) {
    enEdition = m;
    formM.prenom.value = m.prenom;
    formM.nom.value = m.nom;
    formM.querySelector('input[name="ensemble"][value="' + m.ensemble + '"]').checked = true;
    formM.pupitre.value = m.pupitre;
    dlg.showModal();
    formM.prenom.select();
  }
  formM.addEventListener('submit', function (e) {
    e.preventDefault();
    var m = enEdition;
    var prenom = formM.prenom.value.trim();
    var nom = formM.nom.value.trim();
    var ens = formM.querySelector('input[name="ensemble"]:checked').value;
    var pup = formM.pupitre.value;
    dlg.close();
    if (prenom === m.prenom && nom === m.nom && ens === m.ensemble && pup === m.pupitre) return;
    sauverEtape();
    m.prenom = prenom; m.nom = nom;
    if (ens !== m.ensemble || pup !== m.pupitre) {
      if (ens !== ensemble) ensemble = ens;
      placer(m.id, ens, pup);
    }
    rendre();
    annoncer('Modifications appliquées à ' + prenom + ' ' + nom + '.');
  });
  $('#dm-annuler').addEventListener('click', function () { dlg.close(); });
  $('#dm-retirer').addEventListener('click', function () { dlg.close(); retirer(enEdition); });
  dlg.addEventListener('close', function () {
    var li = enEdition && plateau.querySelector('[data-id="' + enEdition.id + '"]');
    if (li) li.focus();
  });

  // Bulk import dialog
  var dlgI = $('#dialogue-import');
  var formI = $('#form-import');
  function lignesImport() {
    return formI.noms.value.split(/\r?\n|;/).map(decouperNom).filter(Boolean);
  }
  formI.noms.addEventListener('input', function () {
    var n = lignesImport().length;
    $('#di-apercu').textContent = n ? pluriel(n, 'musicien') + ' à ajouter.' : '';
  });
  $('#btn-import').addEventListener('click', function () {
    formI.reset();
    formI.querySelector('input[name="ensemble"][value="' + ensemble + '"]').checked = true;
    $('#di-apercu').textContent = '';
    dlgI.showModal();
    formI.noms.focus();
  });
  $('#di-annuler').addEventListener('click', function () { dlgI.close(); });
  formI.addEventListener('submit', function (e) {
    e.preventDefault();
    var lignes = formI.noms.value.split(/\r?\n|;/).filter(function (l) { return l.trim(); });
    if (!lignes.length) { dlgI.close(); return; }
    var ens = formI.querySelector('input[name="ensemble"]:checked').value;
    var pup = formI.pupitre.value;
    sauverEtape();
    lignes.forEach(function (l) { ajouter(l, ens, pup); });
    dlgI.close();
    ensemble = ens;
    rendre();
    annoncer(pluriel(lignes.length, 'musicien') + ' ajouté' + (lignes.length > 1 ? 's' : '') + ' en ' + pup + ' (Formation ' + ens + ').');
  });

  // Board events
  plateau.addEventListener('submit', function (e) {
    var f = e.target.closest('.ajout');
    if (!f) return;
    e.preventDefault();
    var champ = f.querySelector('input');
    if (!champ.value.trim()) return;
    sauverEtape();
    var m = ajouter(champ.value, ensemble, f.getAttribute('data-pupitre'));
    var idChamp = champ.id;
    rendre();
    var nouveau = document.getElementById(idChamp);
    nouveau.focus(); // stay in the field to type the next name
    annoncer(m.prenom + ' ' + m.nom + ' ajouté·e en ' + m.pupitre + '.');
  });

  plateau.addEventListener('click', function (e) {
    var b = e.target.closest('.musicien__menu');
    if (b) { e.stopPropagation(); ouvrirMenu(b, trouver(b.closest('[data-id]').getAttribute('data-id'))); }
  });
  plateau.addEventListener('dblclick', function (e) {
    var li = e.target.closest('.musicien');
    if (li) ouvrirEdition(trouver(li.getAttribute('data-id')));
  });
  plateau.addEventListener('keydown', function (e) {
    var li = e.target.closest('.musicien');
    if (!li || e.target !== li) return;
    var m = trouver(li.getAttribute('data-id'));
    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); deplacerDansGroupe(m, -1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); deplacerDansGroupe(m, 1); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); changerPupitre(m, -1); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); changerPupitre(m, 1); }
    else if (e.key === 'Enter') { e.preventDefault(); ouvrirEdition(m); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); retirer(m); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var tous = $$('.musicien:not(.musicien--estompe)', plateau);
      var n = tous[tous.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (n) n.focus();
    }
  });

  $('#liste-anciens').addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]');
    if (!b) return;
    var m = trouver(b.closest('[data-id]').getAttribute('data-id'));
    if (b.getAttribute('data-action') === 'reintegrer') {
      sauverEtape();
      placer(m.id, m.ensemble, m.pupitre);
      ensemble = m.ensemble;
      rendre();
      annoncer(m.prenom + ' ' + m.nom + ' réintégré·e en ' + m.pupitre + ' (Formation ' + m.ensemble + ').');
    } else if (b.getAttribute('data-confirmer') === 'oui') {
      supprimer(m);
    } else {
      b.setAttribute('data-confirmer', 'oui');
      b.textContent = 'Confirmer ?';
      setTimeout(function () { if (b.isConnected) { b.removeAttribute('data-confirmer'); b.textContent = 'Supprimer'; } }, 4000);
    }
  });

  $$('[data-onglet]').forEach(function (b) {
    b.addEventListener('click', function () { ensemble = b.getAttribute('data-onglet'); rendre(); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        ensemble = ensemble === 'A' ? 'B' : 'A';
        rendre();
        $('[data-onglet="' + ensemble + '"]').focus();
      }
    });
  });

  recherche.addEventListener('input', filtrer);
  recherche.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { recherche.value = ''; filtrer(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      var premier = plateau.querySelector('.musicien--trouve');
      if (premier) { premier.scrollIntoView({ block: 'center' }); premier.focus(); }
    }
  });

  $('#btn-annuler').addEventListener('click', annuler);
  $('#btn-retablir').addEventListener('click', retablir);
  var panneau = $('#anciens');
  function basculerAnciens(ouvrir) {
    panneau.hidden = !ouvrir;
    document.body.classList.toggle('avec-anciens', ouvrir);
    $('#btn-anciens').setAttribute('aria-expanded', String(ouvrir));
  }
  $('#btn-anciens').addEventListener('click', function () { basculerAnciens(panneau.hidden); });
  $('#btn-fermer-anciens').addEventListener('click', function () { basculerAnciens(false); $('#btn-anciens').focus(); });
  $('#btn-detail').addEventListener('click', function () {
    var d = $('#detail');
    d.hidden = !d.hidden;
    this.setAttribute('aria-expanded', String(!d.hidden));
    this.textContent = d.hidden ? 'Voir le détail' : 'Masquer le détail';
  });
  $('#btn-tout-annuler').addEventListener('click', function () {
    if (!historique.length) return;
    futur = [];
    sauverEtape();
    etat = JSON.parse(historique[0]);
    historique = historique.slice(0, 1);
    rendre();
    annoncer('Toutes les modifications ont été annulées (Ctrl+Z pour les retrouver).');
  });

  // ------------------------------------------------------------------ save
  var enCours = false;
  function enregistrer() {
    var modifs = calculerModifs();
    if (!modifs.resume.length || enCours) return;
    enCours = true;
    var bouton = $('#btn-enregistrer');
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    var message = messageCommit(modifs.resume);
    stockage.enregistrer(modifs, message, version).then(function () {
      return stockage.charger();
    }).then(function (donnees) {
      version = donnees.version;
      etat = { musiciens: depuisFichiers(donnees.fichiers), supprimes: [], touches: {} };
      historique = []; futur = [];
      rendre();
      annoncer(D.mode === 'github'
        ? 'Enregistré ✓ ' + pluriel(modifs.resume.length, 'modification') + '. Le site sera à jour d’ici 3 minutes.'
        : 'Enregistré dans la démo ✓ ' + pluriel(modifs.resume.length, 'modification') + '. Visible aussi dans l’éditeur (menu Musiciens).', 'succes');
    }).catch(function (err) {
      annoncer('Échec de l’enregistrement : ' + err.message, 'erreur');
    }).then(function () {
      enCours = false;
      bouton.disabled = false;
      bouton.textContent = 'Enregistrer sur le site';
    });
  }
  $('#btn-enregistrer').addEventListener('click', enregistrer);
  if (D.mode !== 'github') $('#btn-enregistrer').textContent = 'Enregistrer (démo)';

  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); enregistrer(); }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); annuler(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); retablir(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); recherche.focus(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (calculerModifs().resume.length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------------ start
  function demarrer(donnees) {
    version = donnees.version;
    etat.musiciens = depuisFichiers(donnees.fichiers);
    rendre();
  }

  stockage.charger().catch(function (err) {
    if (err.connexion) throw err;
    if (stockage === Demo) {
      console.warn('Stockage de démo indisponible, données en mémoire :', err);
      stockage = Memoire;
      annoncer('Mode démo : les modifications restent dans cette page.');
      return Memoire.charger();
    }
    throw err;
  }).then(demarrer).catch(function (err) {
    var p = $('#chargement');
    p.textContent = '';
    if (err.connexion) {
      p.appendChild(el('strong', { texte: 'Connectez-vous d’abord à l’éditeur du site.' }));
      p.appendChild(el('br'));
      p.appendChild(document.createTextNode('Le tableau des effectifs utilise la même connexion. '));
      p.appendChild(el('a', { href: $('.barre__retour').getAttribute('href'), texte: 'Ouvrir l’éditeur et se connecter' }));
      p.appendChild(document.createTextNode(', puis revenez ici.'));
    } else {
      p.textContent = 'Impossible de charger les effectifs : ' + err.message;
    }
  });
})();
