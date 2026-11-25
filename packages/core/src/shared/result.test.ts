import { describe, expect, it, vi } from 'vitest';

import { err, isErr, isOk, map, ok } from './result.js';
import type { Result } from './result.js';

const success: Result<string, { code: string }> = {
  ok: true,
  value: 'rascunho',
};

const failure: Result<string, { code: string }> = {
  ok: false,
  error: { code: 'draft_failed' },
};

describe('Result', () => {
  it('deve distinguir ok e erro sem lançar exceção', () => {
    expect(ok('rascunho')).toEqual({ ok: true, value: 'rascunho' });
    expect(err({ code: 'draft_failed' })).toEqual({
      ok: false,
      error: { code: 'draft_failed' },
    });

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
  });

  it('deve devolver a falha quando err recebe o erro', () => {
    expect(err({ code: 'unreachable' })).toEqual({
      ok: false,
      error: { code: 'unreachable' },
    });
  });

  it('deve responder verdadeiro em isOk quando o Result é sucesso', () => {
    expect(isOk(success)).toBe(true);
    expect(isOk(failure)).toBe(false);
  });

  it('deve responder verdadeiro em isErr quando o Result é falha', () => {
    expect(isErr(failure)).toBe(true);
    expect(isErr(success)).toBe(false);
  });

  it('deve preservar o código de erro ao mapear um Result com falha', () => {
    const trashed: Result<string, { code: string }> = {
      ok: false,
      error: { code: 'trash_failed' },
    };

    expect(map(trashed, (value: string) => value.length)).toEqual({
      ok: false,
      error: { code: 'trash_failed' },
    });
  });

  it('deve não chamar a função quando map recebe uma falha', () => {
    const fn = vi.fn((value: string) => value.length);

    map(failure, fn);

    expect(fn).not.toHaveBeenCalled();
  });

  it('deve transformar o valor quando o Result é sucesso', () => {
    const titled: Result<string, { code: string }> = {
      ok: true,
      value: 'abc',
    };

    expect(map(titled, (value: string) => value.length)).toEqual({
      ok: true,
      value: 3,
    });
  });
});
