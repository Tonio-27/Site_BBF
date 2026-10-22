// Dates are stored as local Swiss wall-clock time ("2026-11-28T14:00")
// and always interpreted in Europe/Zurich, whatever the build machine's zone.
export const FUSEAU = 'Europe/Zurich';
export const LOCALE = 'fr-CH';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** Offset of Europe/Zurich from UTC, in minutes, at the given instant. */
function decalageZurich(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSEAU,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Convert a Zurich wall-clock string (or Date) to an absolute Date. */
export function versDate(valeur: string | Date): Date {
  if (valeur instanceof Date) return valeur;
  const m = LOCAL_RE.exec(valeur);
  if (!m) throw new Error(`Date invalide : « ${valeur} »`);
  const [, y, mo, d, h = '00', mi = '00'] = m;
  const naif = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // Two passes handle the DST transition correctly.
  let instant = naif - decalageZurich(new Date(naif)) * 60000;
  instant = naif - decalageZurich(new Date(instant)) * 60000;
  return new Date(instant);
}

/** True when the stored value carries a time of day. */
export function aUneHeure(valeur: string | Date): boolean {
  return typeof valeur === 'string' ? /[T ]\d{2}:\d{2}/.test(valeur) : true;
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: FUSEAU, ...options });

/** « 28 novembre 2026 » */
export const dateLongue = (v: string | Date) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(versDate(v));
/** « samedi 28 novembre 2026 » */
export const dateComplete = (v: string | Date) => `${fmt({ weekday: 'long' }).format(versDate(v))} ${dateLongue(v)}`;
/** « 14:00 » */
export const heure = (v: string | Date) => fmt({ hour: '2-digit', minute: '2-digit' }).format(versDate(v));
/** { jour: '28', mois: 'nov.' } for date badges */
export function pastille(v: string | Date) {
  const d = versDate(v);
  return { jour: fmt({ day: 'numeric' }).format(d), mois: fmt({ month: 'short' }).format(d) };
}
/** Year in Zurich time. */
export const annee = (v: string | Date) => Number(fmt({ year: 'numeric' }).format(versDate(v)));

/** ISO 8601 with offset, for <time datetime> and JSON-LD. */
export function iso(v: string | Date): string {
  const d = versDate(v);
  const off = decalageZurich(d);
  const local = new Date(d.getTime() + off * 60000).toISOString().slice(0, 19);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Date-only « YYYY-MM-DD » in Zurich time. */
export function jourIso(v: string | Date): string {
  return iso(v).slice(0, 10);
}
