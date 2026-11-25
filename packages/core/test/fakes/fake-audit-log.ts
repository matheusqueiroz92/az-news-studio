import { err, ok } from '../../src/shared/result.js';
import type {
  AuditEntry,
  AuditLogPort,
  AuditWriteError,
} from '../../src/ports/audit-log-port.js';
import type { Result } from '../../src/shared/result.js';

/**
 * Guarda cada `record`, inclusive quando a escrita está configurada para falhar.
 * Não escolhe action, channel nem resultado.
 */
export class FakeAuditLog implements AuditLogPort {
  readonly entries: AuditEntry[] = [];

  /** Quando true, `record` devolve `write_failed` e ainda assim guarda a entrada. */
  failWrites = false;

  async record(entry: AuditEntry): Promise<Result<void, AuditWriteError>> {
    this.entries.push(entry);
    if (this.failWrites) {
      return err({ code: 'write_failed' });
    }
    return ok(undefined);
  }
}
