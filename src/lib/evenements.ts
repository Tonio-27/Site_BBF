import { versDate, jourIso, aUneHeure } from './dates.ts';

export interface EvenementData {
  date_debut: string;
  date_fin?: string;
  ensembles: ('A' | 'B')[];
}

/** End of the event: explicit end, otherwise end of the start day. */
export function finEvenement(e: EvenementData): Date {
  if (e.date_fin) {
    const fin = versDate(e.date_fin);
    return aUneHeure(e.date_fin) ? fin : versDate(`${jourIso(fin)}T23:59`);
  }
  return versDate(`${jourIso(e.date_debut)}T23:59`);
}

/** An event stays "upcoming" until the end of its last day. */
export const estAVenir = (e: EvenementData, maintenant = new Date()) => finEvenement(e) >= maintenant;

export function aVenir<T extends { data: EvenementData }>(liste: T[], maintenant = new Date()): T[] {
  return liste
    .filter((e) => estAVenir(e.data, maintenant))
    .sort((a, b) => versDate(a.data.date_debut).getTime() - versDate(b.data.date_debut).getTime());
}

export function passes<T extends { data: EvenementData }>(liste: T[], maintenant = new Date()): T[] {
  return liste
    .filter((e) => !estAVenir(e.data, maintenant))
    .sort((a, b) => versDate(b.data.date_debut).getTime() - versDate(a.data.date_debut).getTime());
}

export const pourEnsemble = <T extends { data: EvenementData }>(liste: T[], ensemble: 'A' | 'B') =>
  liste.filter((e) => e.data.ensembles.includes(ensemble));

export function libelleEnsembles(ensembles: ('A' | 'B')[]): string {
  const tri = [...ensembles].sort();
  return tri.length === 2 ? 'Formations A et B' : `Formation ${tri[0]}`;
}
