import { describe, expect, it } from 'vitest';
import { aVenir, passes, estAVenir, pourEnsemble, libelleEnsembles, type EvenementData } from '../src/lib/evenements.ts';

const e = (id: string, data: Partial<EvenementData>) => ({ id, data: { date_debut: '2026-01-01', ensembles: ['A'], ...data } as EvenementData });
const maintenant = new Date('2026-11-28T15:00:00Z');

describe('événements à venir / passés', () => {
  const liste = [
    e('hier', { date_debut: '2026-11-27T20:00' }),
    e('aujourdhui-matin', { date_debut: '2026-11-28T09:00' }),
    e('multi-jours', { date_debut: '2026-11-20T09:00', date_fin: '2026-11-29T18:00' }),
    e('demain', { date_debut: '2026-11-29T20:00', ensembles: ['B'] }),
    e('ancien', { date_debut: '2025-03-22T20:00', ensembles: ['A', 'B'] }),
  ];

  it('un événement du jour reste « à venir » jusqu’à minuit', () => {
    expect(estAVenir(liste[1].data, maintenant)).toBe(true);
  });

  it('sépare et trie à venir (croissant) et passés (décroissant)', () => {
    expect(aVenir(liste, maintenant).map((x) => x.id)).toEqual(['multi-jours', 'aujourdhui-matin', 'demain']);
    expect(passes(liste, maintenant).map((x) => x.id)).toEqual(['hier', 'ancien']);
  });

  it('filtre par formation', () => {
    expect(pourEnsemble(liste, 'B').map((x) => x.id)).toEqual(['demain', 'ancien']);
  });

  it('libellé des formations', () => {
    expect(libelleEnsembles(['B', 'A'])).toBe('Formations A et B');
    expect(libelleEnsembles(['B'])).toBe('Formation B');
  });

  it('liste vide : aucun plantage', () => {
    expect(aVenir([], maintenant)).toEqual([]);
  });
});
