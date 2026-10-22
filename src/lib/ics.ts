import { versDate, aUneHeure, jourIso } from './dates.ts';

export interface IcsEvenement {
  uid: string;
  titre: string;
  date_debut: string;
  date_fin?: string;
  lieu: string;
  localite: string;
  description?: string;
  url: string;
  annule?: boolean;
}

const echapper = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const jour = (v: string) => jourIso(v).replace(/-/g, '');

const octets = (s: string) => new TextEncoder().encode(s).length;

/** Fold lines at 75 octets as required by RFC 5545. */
function plier(ligne: string): string {
  const out: string[] = [];
  let reste = ligne;
  while (octets(reste) > 75) {
    let n = 75;
    while (octets(reste.slice(0, n)) > 75) n--;
    out.push(reste.slice(0, n));
    reste = ' ' + reste.slice(n);
  }
  out.push(reste);
  return out.join('\r\n');
}

function vevent(e: IcsEvenement, horodatage: Date): string[] {
  const lignes = ['BEGIN:VEVENT', `UID:${e.uid}@brassbandfribourg.ch`, `DTSTAMP:${utc(horodatage)}`];
  if (aUneHeure(e.date_debut)) {
    const debut = versDate(e.date_debut);
    const fin = e.date_fin ? versDate(e.date_fin) : new Date(debut.getTime() + 2 * 3600 * 1000);
    lignes.push(`DTSTART:${utc(debut)}`, `DTEND:${utc(fin)}`);
  } else {
    const finJour = versDate(e.date_fin ?? e.date_debut);
    const lendemain = new Date(finJour.getTime() + 36 * 3600 * 1000);
    lignes.push(`DTSTART;VALUE=DATE:${jour(e.date_debut)}`, `DTEND;VALUE=DATE:${jour(lendemain.toISOString())}`);
  }
  lignes.push(
    `SUMMARY:${echapper((e.annule ? 'ANNULÉ – ' : '') + e.titre)}`,
    `LOCATION:${echapper(`${e.lieu}, ${e.localite}`)}`,
    `URL:${e.url}`,
  );
  if (e.description) lignes.push(`DESCRIPTION:${echapper(e.description)}`);
  if (e.annule) lignes.push('STATUS:CANCELLED');
  lignes.push('END:VEVENT');
  return lignes;
}

export function genererIcs(evenements: IcsEvenement[], nom = 'Brass Band Fribourg', horodatage = new Date()): string {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brass Band Fribourg//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(nom)}`,
    'X-WR-TIMEZONE:Europe/Zurich',
    ...evenements.flatMap((e) => vevent(e, horodatage)),
    'END:VCALENDAR',
  ];
  return lignes.map(plier).join('\r\n') + '\r\n';
}
