import { describe, expect, it } from 'vitest';
import { genererIcs } from '../src/lib/ics.ts';

const base = { uid: 'test', titre: 'Concert annuel, édition 2027', lieu: 'Équilibre', localite: 'Fribourg', url: 'https://brassbandfribourg.ch/agenda/test/' };
const horodatage = new Date('2026-10-22T10:00:00Z');

describe('génération .ics', () => {
  it('produit un VEVENT en UTC avec échappement', () => {
    const ics = genererIcs([{ ...base, date_debut: '2027-03-20T20:00' }], 'BBF', horodatage);
    expect(ics).toContain('DTSTART:20270320T190000Z');
    expect(ics).toContain('DTEND:20270320T210000Z');
    expect(ics).toContain('SUMMARY:Concert annuel\\, édition 2027');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('gère les événements sur plusieurs jours sans heure', () => {
    const ics = genererIcs([{ ...base, date_debut: '2026-05-09', date_fin: '2026-05-10' }], 'BBF', horodatage);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260509');
    expect(ics).toContain('DTEND;VALUE=DATE:20260511');
  });

  it('marque les événements annulés', () => {
    const ics = genererIcs([{ ...base, date_debut: '2027-01-17T11:00', annule: true }], 'BBF', horodatage);
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SUMMARY:ANNULÉ – ');
  });
});
