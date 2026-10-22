// Single source of truth for brass band sections, in display order.
// Shared by the content schema, the admin config check and the display.
export const PUPITRES = [
  'Soprano Cornet',
  'Principal Cornet',
  'Assistant Cornet',
  'Solo Cornet',
  'Repiano Cornet',
  'Second Cornet',
  'Third Cornet',
  'Flugel Horn',
  'Solo Horn',
  'First Horn',
  'Second Horn',
  'Solo Baritone',
  'Second Baritone',
  'Solo Euphonium',
  'Assistant Euphonium',
  'Euphonium',
  'Solo Trombone',
  'Second Trombone',
  'Bass Trombone',
  'Eb Bass',
  'Bb Bass',
  'Percussion',
] as const;

export type Pupitre = (typeof PUPITRES)[number];

export interface Classable {
  pupitre: Pupitre;
  ordre?: number;
  nom: string;
  prenom: string;
}

/** Sort musicians by section, then explicit order, then name. */
export function trierParPupitre<T extends Classable>(musiciens: T[]): T[] {
  return [...musiciens].sort(
    (a, b) =>
      PUPITRES.indexOf(a.pupitre) - PUPITRES.indexOf(b.pupitre) ||
      (a.ordre ?? 999) - (b.ordre ?? 999) ||
      a.nom.localeCompare(b.nom, 'fr-CH') ||
      a.prenom.localeCompare(b.prenom, 'fr-CH'),
  );
}

/** Group sorted musicians by section, keeping section order. */
export function grouperParPupitre<T extends Classable>(musiciens: T[]): { pupitre: Pupitre; membres: T[] }[] {
  const groupes = new Map<Pupitre, T[]>();
  for (const m of trierParPupitre(musiciens)) {
    if (!groupes.has(m.pupitre)) groupes.set(m.pupitre, []);
    groupes.get(m.pupitre)!.push(m);
  }
  return [...groupes].map(([pupitre, membres]) => ({ pupitre, membres }));
}
