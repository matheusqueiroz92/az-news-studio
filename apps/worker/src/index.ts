import { createWorkerApp, type WorkerApp } from './container.js';

async function main(): Promise<void> {
  let app: WorkerApp;
  try {
    app = await createWorkerApp();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Falha ao iniciar o worker',
    );
    process.exit(1);
  }

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    app.logger.info({ signal }, 'encerrando o worker');
    app
      .close()
      .then(() => {
        app.logger.info({ signal }, 'worker encerrado');
        process.exit(0);
      })
      .catch((closeError: unknown) => {
        const message =
          closeError instanceof Error ? closeError.message : 'falha ao encerrar';
        app.logger.error({ message }, 'falha ao encerrar o worker');
        process.exit(1);
      });
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shutdown(signal);
    });
  }
}

void main();
