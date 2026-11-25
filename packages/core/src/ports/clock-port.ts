/** Relógio do domínio. O instante é UTC; a borda formata `America/Sao_Paulo`. */
export interface ClockPort {
  /** Agora, em UTC. */
  now(): Date;
}
