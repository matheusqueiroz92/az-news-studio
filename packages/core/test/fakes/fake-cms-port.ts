import { err, ok } from '../../src/shared/result.js';
import type { CmsError } from '../../src/ports/cms-error.js';
import type {
  CmsConnectionStatus,
  CmsDraftInput,
  CmsPort,
  CmsPostId,
  CmsPostRef,
} from '../../src/ports/cms-port.js';
import type { Result } from '../../src/shared/result.js';

/**
 * CMS em memória. Devolve o que o teste configurou.
 * Não decide se o rascunho pode ser criado nem o que vai para o audit log.
 * O mesmo `nextPostId` vale até o teste trocar.
 */
export class FakeCmsPort implements CmsPort {
  status: CmsConnectionStatus = {
    reachable: true,
    authenticated: true,
    bridgeVersion: null,
    siteName: '',
  };

  /** Se não for null, `checkConnection` ignora `status` e devolve este erro. */
  checkError: CmsError | null = null;

  /** Se não for null, `createDraft` devolve este erro. O input fica em `drafts`. */
  draftError: CmsError | null = null;

  /** Se não for null, `trashPost` devolve este erro. O id fica em `trashAttempts`. */
  trashError: CmsError | null = null;

  nextPostId: CmsPostId = '1';

  checkCount = 0;

  readonly drafts: CmsDraftInput[] = [];

  readonly createdIds: CmsPostId[] = [];

  readonly trashAttempts: CmsPostId[] = [];

  readonly trashedIds: CmsPostId[] = [];

  async checkConnection(): Promise<Result<CmsConnectionStatus, CmsError>> {
    this.checkCount += 1;
    if (this.checkError !== null) {
      return err(this.checkError);
    }
    return ok({
      reachable: this.status.reachable,
      authenticated: this.status.authenticated,
      bridgeVersion: this.status.bridgeVersion,
      siteName: this.status.siteName,
    });
  }

  async createDraft(
    input: CmsDraftInput,
  ): Promise<Result<CmsPostRef, CmsError>> {
    this.drafts.push(input);
    if (this.draftError !== null) {
      return err(this.draftError);
    }
    this.createdIds.push(this.nextPostId);
    return ok({ id: this.nextPostId });
  }

  async trashPost(id: CmsPostId): Promise<Result<void, CmsError>> {
    this.trashAttempts.push(id);
    if (this.trashError !== null) {
      return err(this.trashError);
    }
    this.trashedIds.push(id);
    return ok(undefined);
  }
}
