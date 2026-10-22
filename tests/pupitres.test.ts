import { describe, expect, it } from 'vitest';
import { PUPITRES, trierParPupitre, grouperParPupitre, type Pupitre } from '../src/lib/pupitres.ts';

const m = (prenom: string, nom: string, pupitre: Pupitre, ordre?: number) => ({ prenom, nom, pupitre, ordre });

describe('pupitres', () => {
  it('contient 22 pupitres uniques, du soprano aux percussions', () => {
    expect(PUPITRES).toHaveLength(22);
    expect(new Set(PUPITRES).size).toBe(22);
    expect(PUPITRES[0]).toBe('Soprano Cornet');
    expect(PUPITRES.at(-1)).toBe('Percussion');
  });

  it('trie par pupitre, puis ordre, puis nom', () => {
    const tri = trierParPupitre([
      m('Zoé', 'Zbinden', 'Percussion'),
      m('Anna', 'Berset', 'Solo Cornet'),
      m('Marc', 'Aebischer', 'Solo Cornet', 1),
      m('Léa', 'Bapst', 'Soprano Cornet'),
      m('Éric', 'Égger', 'Solo Cornet'),
    ]);
    expect(tri.map((x) => x.nom)).toEqual(['Bapst', 'Aebischer', 'Berset', 'Égger', 'Zbinden']);
  });

  it('groupe en conservant l’ordre des pupitres', () => {
    const g = grouperParPupitre([m('A', 'A', 'Bb Bass'), m('B', 'B', 'Flugel Horn'), m('C', 'C', 'Bb Bass')]);
    expect(g.map((x) => [x.pupitre, x.membres.length])).toEqual([
      ['Flugel Horn', 1],
      ['Bb Bass', 2],
    ]);
  });
});
