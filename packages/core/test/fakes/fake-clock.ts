import type { ClockPort } from '../../src/ports/clock-port.js';

/**
 * Relógio fixo. Não formata fuso nem decide regra de negócio.
 * `now` devolve uma cópia, para o caso de uso não alterar `instant`.
 */
export class FakeClock implements ClockPort {
  nowCount = 0;

  constructor(public instant: Date) {}

  now(): Date {
    this.nowCount += 1;
    return new Date(this.instant.getTime());
  }
}
