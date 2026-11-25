export { err, isErr, isOk, map, ok } from './shared/result.js';
export type { Err, Ok, Result } from './shared/result.js';

export { isRole, roles } from './domain/role.js';
export type { Role } from './domain/role.js';

export type { ClockPort } from './ports/clock-port.js';

export { cmsErrorCodes } from './ports/cms-error.js';
export type { CmsError, CmsErrorCode } from './ports/cms-error.js';

export type {
  CmsConnectionStatus,
  CmsDraftInput,
  CmsPort,
  CmsPostId,
  CmsPostRef,
} from './ports/cms-port.js';

export type { EnqueueError, JobQueuePort } from './ports/job-queue-port.js';

export type {
  AuditAction,
  AuditChannel,
  AuditEntry,
  AuditLogPort,
  AuditOutcome,
  AuditWriteError,
} from './ports/audit-log-port.js';

export type { NewUser, User, UserRepository } from './ports/user-repository.js';

export {
  TestCmsConnection,
  isRetryableTestCmsConnectionError,
} from './application/test-cms-connection.js';
export type {
  TestCmsConnectionError,
  TestCmsConnectionInput,
  TestCmsConnectionSuccess,
} from './application/test-cms-connection.js';
