import { describe, expect, it } from 'vitest';

import {
  CMS_QUEUE_CONCURRENCY,
  CMS_QUEUE_NAME,
  optionsForJob,
} from '../index.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * ONE_DAY_SECONDS;

/** Política padrão da fila cms, inclusive o teto do que fica no Redis. */
const defaultOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: ONE_DAY_SECONDS, count: 100 },
  removeOnFail: { age: SEVEN_DAYS_SECONDS, count: 500 },
};

describe('opções da fila cms', () => {
  it('deve fixar a fila cms com concorrência 1', () => {
    expect(CMS_QUEUE_NAME).toBe('cms');
    expect(CMS_QUEUE_CONCURRENCY).toBe(1);
  });

  it('deve fixar 3 tentativas e backoff exponencial a partir de 1 segundo', () => {
    expect(optionsForJob('PublishToCms')).toEqual(defaultOptions);
  });

  it('deve limitar os jobs guardados no Redis para a fila não crescer sem fim', () => {
    expect(optionsForJob('PublishToCms')).toMatchObject({
      removeOnComplete: { count: 100, age: ONE_DAY_SECONDS },
      removeOnFail: { count: 500, age: SEVEN_DAYS_SECONDS },
    });
  });

  it('deve usar uma única tentativa no job TestCmsConnection', () => {
    expect(optionsForJob('TestCmsConnection')).toEqual({
      ...defaultOptions,
      attempts: 1,
    });
  });
});
