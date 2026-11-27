import {
  err,
  ok,
  type EnqueueError,
  type JobQueuePort,
  type Result,
} from '@az-news/core';
import type { JobsOptions, Queue } from 'bullmq';

import { optionsForJob, type CmsJobOptions } from './job-options.js';

type JobAddOptions = CmsJobOptions & {
  readonly jobId?: string;
};

/** Fila injetada. O `Queue` do BullMQ cabe aqui; o teste passa um fake. */
export type JobProducer = {
  add(
    name: string,
    data: Readonly<Record<string, unknown>>,
    opts: JobAddOptions,
  ): Promise<{ readonly id?: string }>;
};

type AssertAssignable<T extends U, U> = T;

// O tipo do BullMQ fica neste arquivo: não sai no index do pacote.
type _OptionsFitBullmq = AssertAssignable<JobAddOptions, JobsOptions>;
type _QueueIsProducer = AssertAssignable<Queue, JobProducer>;

export class BullmqQueue implements JobQueuePort {
  constructor(
    private readonly producers: Readonly<Record<string, JobProducer>>,
  ) {}

  async enqueue(
    queue: string,
    jobName: string,
    payload: Readonly<Record<string, unknown>>,
    jobId?: string,
  ): Promise<Result<{ readonly jobId: string }, EnqueueError>> {
    const producer = this.producers[queue];
    if (!producer) {
      return err({ code: 'enqueue_failed' });
    }

    try {
      const job = await producer.add(jobName, payload, {
        ...optionsForJob(jobName),
        ...(jobId === undefined ? {} : { jobId }),
      });
      if (!job.id) {
        return err({ code: 'enqueue_failed' });
      }
      return ok({ jobId: job.id });
    } catch {
      // A porta só conhece enqueue_failed: recusa do Redis não sobe como exceção.
      return err({ code: 'enqueue_failed' });
    }
  }
}
