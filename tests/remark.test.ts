import { describe, expect, it } from 'vitest';
import { remarkSafeContent } from '../src/lib/remark-safe-content.mjs';

const para = (children: unknown[]) => ({ type: 'paragraph', children });

describe('Markdown sécurisé', () => {
  it('supprime le HTML brut', () => {
    const arbre = { type: 'root', children: [{ type: 'html', value: '<script>alert(1)</script>' }, para([{ type: 'text', value: 'ok' }])] };
    remarkSafeContent()(arbre);
    expect(arbre.children).toHaveLength(1);
  });

  it('transforme un lien YouTube seul en vidéo chargée au clic', () => {
    const arbre = { type: 'root', children: [para([{ type: 'link', url: 'https://youtu.be/dQw4w9WgXcQ', children: [] }])] };
    remarkSafeContent()(arbre);
    const n = arbre.children[0] as unknown as { type: string; value: string };
    expect(n.type).toBe('html');
    expect(n.value).toContain('data-youtube="dQw4w9WgXcQ"');
    expect(n.value).not.toContain('<iframe');
  });
});
