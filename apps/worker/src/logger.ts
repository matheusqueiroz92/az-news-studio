import pino from 'pino';

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const SECRET_KEYS = [
  'WP_APP_PASSWORD',
  'appPassword',
  'authorization',
  'Authorization',
  'WP_WEBHOOK_SECRET',
  'webhookSecret',
];

const SECRET_PATHS = SECRET_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `headers.${key}`,
  `*.headers.${key}`,
]);

/** JSON no stdout. Senha, Authorization e segredo do webhook não saem no log. */
export function createLogger(options: {
  readonly level: LogLevel;
  readonly destination?: pino.DestinationStream;
}) {
  return pino(
    {
      level: options.level,
      redact: { paths: SECRET_PATHS, censor: '[Redacted]' },
    },
    options.destination,
  );
}
