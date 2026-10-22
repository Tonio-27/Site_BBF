import { describe, expect, it } from 'vitest';
import { versDate, iso, dateLongue, dateComplete, heure, jourIso } from '../src/lib/dates.ts';

describe('dates (Europe/Zurich)', () => {
  it('interprète l’heure en hiver (UTC+1)', () => {
    expect(versDate('2026-11-28T09:00').toISOString()).toBe('2026-11-28T08:00:00.000Z');
    expect(iso('2026-11-28T09:00')).toBe('2026-11-28T09:00:00+01:00');
  });

  it('interprète l’heure en été (UTC+2)', () => {
    expect(versDate('2026-06-21T18:30').toISOString()).toBe('2026-06-21T16:30:00.000Z');
    expect(iso('2026-06-21T18:30')).toBe('2026-06-21T18:30:00+02:00');
  });

  it('gère les jours de changement d’heure', () => {
    expect(versDate('2026-03-29T12:00').toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(versDate('2026-10-25T12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('formate en français de Suisse', () => {
    expect(dateLongue('2026-11-28')).toBe('28 novembre 2026');
    expect(dateComplete('2026-11-28T09:00')).toBe('samedi 28 novembre 2026');
    expect(heure('2026-11-28T20:00')).toBe('20:00');
    expect(jourIso('2026-11-28T23:30')).toBe('2026-11-28');
  });

  it('refuse une date invalide', () => {
    expect(() => versDate('28.11.2026')).toThrow();
  });
});
