import { describe, expect, it, vi } from 'vitest';

import {
  STUDIO_TIME_ZONE,
  formatStudioCalendarDate,
  formatStudioStamp,
} from './studio-date.js';

const PREVIOUS_EVENING = new Date('2026-11-24T02:00:00.000Z');
const SAO_PAULO_MIDNIGHT = new Date('2026-11-24T03:05:09.000Z');
const PADDED_JANUARY = new Date('2026-01-05T03:00:00.000Z');

describe('formatStudioCalendarDate', () => {
  it('deve formatar `2026-11-24T02:00:00.000Z` como `2026-11-23` em `America/Sao_Paulo`', () => {
    expect(formatStudioCalendarDate(PREVIOUS_EVENING)).toBe('2026-11-23');
  });

  it('deve formatar `2026-11-24T03:05:09.000Z` como `2026-11-24` quando é meia-noite em São Paulo', () => {
    expect(formatStudioCalendarDate(SAO_PAULO_MIDNIGHT)).toBe('2026-11-24');
  });

  it('deve usar dois dígitos no mês e no dia quando a data é 5 de janeiro', () => {
    expect(formatStudioCalendarDate(PADDED_JANUARY)).toBe('2026-01-05');
  });
});

describe('formatStudioStamp', () => {
  it('deve formatar `2026-11-24T02:00:00.000Z` como `20261123-230000` em `America/Sao_Paulo`', () => {
    expect(formatStudioStamp(PREVIOUS_EVENING)).toBe('20261123-230000');
  });

  it('deve formatar `2026-11-24T03:05:09.000Z` como `20261124-000509` quando é meia-noite em São Paulo', () => {
    expect(formatStudioStamp(SAO_PAULO_MIDNIGHT)).toBe('20261124-000509');
  });

  it('deve ignorar milissegundos quando o instante tem fração de segundo', () => {
    expect(formatStudioStamp(new Date('2026-11-24T03:05:09.999Z'))).toBe(
      '20261124-000509',
    );
  });

  it('deve usar dois dígitos no mês e no dia quando o carimbo é 5 de janeiro', () => {
    expect(formatStudioStamp(PADDED_JANUARY)).toBe('20260105-000000');
  });
});

describe('STUDIO_TIME_ZONE', () => {
  it('deve ser America/Sao_Paulo', () => {
    expect(STUDIO_TIME_ZONE).toBe('America/Sao_Paulo');
  });
});

describe('parte ausente do Intl', () => {
  it('deve lançar quando formatToParts não devolve uma parte pedida', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
      .mockReturnValue([{ type: 'month', value: '11' }]);

    try {
      expect(() => formatStudioCalendarDate(PREVIOUS_EVENING)).toThrow(
        'Intl.DateTimeFormat não devolveu a parte "year"',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
