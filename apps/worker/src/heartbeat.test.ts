import { afterEach, describe, expect, it, vi } from 'vitest';

import { startHeartbeat, type HeartbeatStore } from './heartbeat.js';

describe('heartbeat', () => {
  const running: Array<{ stop(): void }> = [];

  afterEach(() => {
    for (const heartbeat of running) {
      heartbeat.stop();
    }
    running.length = 0;
    vi.useRealTimers();
  });

  it('deve escrever a chave worker:heartbeat com TTL de 30 segundos', () => {
    const set = vi.fn<HeartbeatStore['set']>(async () => undefined);
    running.push(startHeartbeat({ set }));

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      'worker:heartbeat',
      expect.any(String),
      30,
    );
  });

  it('deve renovar a chave a cada 10 segundos enquanto o processo está de pé', async () => {
    vi.useFakeTimers();
    const set = vi.fn<HeartbeatStore['set']>(async () => undefined);
    const heartbeat = startHeartbeat({ set });
    running.push(heartbeat);

    expect(set).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(set).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(set).toHaveBeenCalledTimes(3);
    expect(set).toHaveBeenNthCalledWith(
      3,
      'worker:heartbeat',
      expect.any(String),
      30,
    );

    heartbeat.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(set).toHaveBeenCalledTimes(3);
  });
});
