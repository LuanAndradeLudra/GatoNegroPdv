/** Datas no calendário civil de America/Sao_Paulo (alinhado ao backend financeiro). */

const DD_MM_YYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Ex.: 2026-04-07 → 07/04/2026 */
export function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    return ymd;
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Valida calendário e retorna yyyy-mm-dd, ou null. */
export function parseDdMmYyyyToYmd(s: string): string | null {
  const t = s.trim();
  const m = DD_MM_YYYY.exec(t);
  if (!m) {
    return null;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Data (ISO instant ou Date) em dd/mm/yyyy, fuso São Paulo. */
export function formatDateDdMmYyyy(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Data e hora em dd/mm/yyyy HH:mm, fuso São Paulo. */
export function formatDateTimeDdMmYyyyHm(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function todayYmdSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addCalendarDaysYmdSaoPaulo(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
