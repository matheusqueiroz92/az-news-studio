/**
 * Data e hora de calendário do Studio.
 * O `Date` entra em UTC. A saída é o relógio de parede em `America/Sao_Paulo`.
 * A implementação usa `Intl.DateTimeFormat.formatToParts` (calendário gregoriano,
 * numeração `latn`): o texto não pode depender da ordem da locale.
 * `Date` inválido fica fora do contrato; `ClockPort` entrega um instante real.
 * Se `formatToParts` não devolver uma parte pedida, a formatação lança `Error`.
 * Isso é falha de ambiente, não fluxo esperado.
 */

/** Fuso da data que aparece no título e no slug do rascunho de teste. */
export const STUDIO_TIME_ZONE = 'America/Sao_Paulo';

const studioDateTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: STUDIO_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function studioPart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const part = parts.find((item) => item.type === type);
  if (part === undefined) {
    throw new Error(`Intl.DateTimeFormat não devolveu a parte "${type}"`);
  }
  return part.value;
}

function studioParts(instant: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const parts = studioDateTimeFormat.formatToParts(instant);
  return {
    year: studioPart(parts, 'year'),
    month: studioPart(parts, 'month'),
    day: studioPart(parts, 'day'),
    hour: studioPart(parts, 'hour'),
    minute: studioPart(parts, 'minute'),
    second: studioPart(parts, 'second'),
  };
}

/**
 * Data de calendário `YYYY-MM-DD` em `America/Sao_Paulo`.
 * Mês e dia com dois dígitos.
 * `2026-11-24T02:00:00.000Z` → `2026-11-23`.
 */
export function formatStudioCalendarDate(instant: Date): string {
  const { year, month, day } = studioParts(instant);
  return `${year}-${month}-${day}`;
}

/**
 * Carimbo `YYYYMMDD-HHmmss` em `America/Sao_Paulo`, para o slug não colidir.
 * Hora, minuto e segundo com dois dígitos. Milissegundos não entram.
 * `2026-11-24T02:00:00.000Z` → `20261123-230000`.
 * `2026-11-24T03:05:09.000Z` → `20261124-000509`.
 */
export function formatStudioStamp(instant: Date): string {
  const { year, month, day, hour, minute, second } = studioParts(instant);
  return `${year}${month}${day}-${hour}${minute}${second}`;
}
