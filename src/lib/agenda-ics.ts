import type { Evenement } from './contenu.ts';
import type { IcsEvenement } from './ics.ts';

export function versIcs(evt: Evenement, site: URL): IcsEvenement {
  const d = evt.data;
  return {
    uid: evt.id,
    titre: d.titre,
    date_debut: d.date_debut,
    date_fin: d.date_fin,
    lieu: d.lieu,
    localite: d.localite,
    description: d.description,
    url: new URL(`/agenda/${evt.id}/`, site).href,
    annule: d.annule,
  };
}
