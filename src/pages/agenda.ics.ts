import type { APIRoute } from 'astro';
import { evenements } from '../lib/contenu.ts';
import { genererIcs } from '../lib/ics.ts';
import { versIcs } from '../lib/agenda-ics.ts';

// Subscribable calendar with every event (past ones keep calendars complete).
export const GET: APIRoute = async ({ site }) => {
  const liste = await evenements();
  return new Response(genererIcs(liste.map((e) => versIcs(e, site!))), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
