import { describe, expect, it } from 'vitest';

import { cmsErrorCodes } from './cms-error.js';

describe('cmsErrorCodes', () => {
  it('deve expor os códigos unreachable, unauthenticated, draft_failed, trash_failed e invalid_response', () => {
    expect([...cmsErrorCodes]).toEqual([
      'unreachable',
      'unauthenticated',
      'draft_failed',
      'trash_failed',
      'invalid_response',
    ]);
  });
});
