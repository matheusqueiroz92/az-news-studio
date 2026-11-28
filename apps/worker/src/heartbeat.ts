const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_TTL_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 10_000;

export type HeartbeatStore = {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

/** Grava `worker:heartbeat` agora e a cada 10 s, com TTL de 30 s. */
export function startHeartbeat(store: HeartbeatStore): { stop(): void } {
  let stopped = false;

  const beat = (): void => {
    if (stopped) {
      return;
    }
    // Um Redis fora do ar não pode derrubar o processo; o próximo batimento tenta de novo.
    store
      .set(HEARTBEAT_KEY, new Date().toISOString(), HEARTBEAT_TTL_SECONDS)
      .catch(() => undefined);
  };

  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  timer.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
