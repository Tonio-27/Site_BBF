// Remark plugin applied to all editor-written Markdown:
// - drops raw HTML (editors fill fields, they never inject markup or scripts);
// - turns a paragraph containing only a YouTube link into a privacy-friendly
//   embed that loads youtube-nocookie.com only after a click.

const YT_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/;

const echapper = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function lienSeul(paragraphe) {
  const enfants = paragraphe.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  if (enfants.length !== 1) return null;
  const n = enfants[0];
  if (n.type === 'link') return n.url;
  if (n.type === 'text') return n.value.trim();
  return null;
}

function embed(id) {
  return `<div class="video" data-youtube="${echapper(id)}"><a class="video__lancer" href="https://www.youtube.com/watch?v=${echapper(id)}"><span class="video__icone" aria-hidden="true">▶</span><span>Lire la vidéo<br><small>La vidéo est chargée depuis YouTube (sans cookie) après le clic.</small></span></a></div>`;
}

function parcourir(noeud) {
  if (!Array.isArray(noeud.children)) return;
  const nouveaux = [];
  for (const enfant of noeud.children) {
    if (enfant.type === 'html') continue;
    if (enfant.type === 'paragraph') {
      const url = lienSeul(enfant);
      const m = url && YT_RE.exec(url);
      if (m) {
        nouveaux.push({ type: 'html', value: embed(m[1]) });
        continue;
      }
    }
    parcourir(enfant);
    nouveaux.push(enfant);
  }
  noeud.children = nouveaux;
}

export function remarkSafeContent() {
  return (arbre) => parcourir(arbre);
}
