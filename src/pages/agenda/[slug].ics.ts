import type { APIRoute } from 'astro';
import { evenements, type Evenement } from '../../lib/contenu.ts';
import { genererIcs } from '../../lib/ics.ts';
import { versIcs } from '../../lib/agenda-ics.ts';

export async function getStaticPaths() {
  return (await evenements()).map((evt) => ({ params: { slug: evt.id }, props: { evt } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const evt = props.evt as Evenement;
  return new Response(genererIcs([versIcs(evt, site!)], evt.data.titre), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
