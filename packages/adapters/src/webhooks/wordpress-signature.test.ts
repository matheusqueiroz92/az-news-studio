import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyWordpressSignature } from '../index.js';

/**
 * Mesmo contrato do AZ Bridge (`az-bridge.php`):
 * `'sha256=' . hash_hmac('sha256', $body, $secret)`.
 * O PHP devolve o HMAC-SHA256 em hexadecimal minúsculo.
 */
function phpSignature(body: string | Uint8Array, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

/**
 * Vetor fixo, calculado fora da função com node:crypto:
 * createHmac('sha256', 'segredo-do-bridge')
 *   .update('{"event":"post.published"}')
 *   .digest('hex')
 */
const FIXED_BODY = '{"event":"post.published"}';
const FIXED_SECRET = 'segredo-do-bridge';
const FIXED_HEX =
  '8ae8b89658aac9060fe13b8d3403f0f091ad48a657de88deaf2d17dc13581857';

/** Espaços de propósito: JSON.parse + stringify mudaria estes bytes. */
const RAW_BODY = '{ "event" : "post.published", "postId" : 7 }';
const SECRET = 'az-studio-webhook-secret';

describe('verifyWordpressSignature', () => {
  it('deve aceitar o cabeçalho sha256= com o HMAC-SHA256 hexadecimal do corpo exato', () => {
    const header = phpSignature(RAW_BODY, SECRET);

    expect(verifyWordpressSignature(RAW_BODY, header, SECRET)).toEqual({
      ok: true,
      value: undefined,
    });

    const bytes = new TextEncoder().encode(RAW_BODY);
    expect(verifyWordpressSignature(bytes, header, SECRET)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('deve aceitar o vetor fixo de corpo, segredo e hex conhecidos', () => {
    expect(
      createHmac('sha256', FIXED_SECRET).update(FIXED_BODY).digest('hex'),
    ).toBe(FIXED_HEX);

    expect(
      verifyWordpressSignature(FIXED_BODY, `sha256=${FIXED_HEX}`, FIXED_SECRET),
    ).toEqual({ ok: true, value: undefined });
  });

  it('deve reproduzir o formato do PHP: hash_hmac sha256 em hex minúsculo com prefixo sha256=', () => {
    const body =
      '{"event":"post.published","postId":42,"url":"https://homolog.aznews.com.br/obra/","title":"Obra no centro","publishedAt":"2026-11-25T12:00:00+00:00"}';
    const secret = 'AZ_STUDIO_WEBHOOK_SECRET';
    const hex = createHmac('sha256', secret).update(body).digest('hex');

    expect(hex).toBe(hex.toLowerCase());
    expect(phpSignature(body, secret)).toBe(`sha256=${hex}`);
    expect(verifyWordpressSignature(body, `sha256=${hex}`, secret)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      verifyWordpressSignature(body, `sha256=${hex.toUpperCase()}`, secret),
    ).toEqual({ ok: false, error: { code: 'invalid_signature' } });
  });

  it('deve recusar cabeçalho ausente', () => {
    for (const header of [undefined, null, ''] as const) {
      expect(verifyWordpressSignature(RAW_BODY, header, SECRET)).toEqual({
        ok: false,
        error: { code: 'missing_header' },
      });
    }
  });

  it('deve recusar prefixo diferente de sha256=', () => {
    const hex = phpSignature(RAW_BODY, SECRET).slice('sha256='.length);

    for (const header of [
      `sha1=${hex}`,
      `SHA256=${hex}`,
      hex,
      `sha256${hex}`,
    ]) {
      expect(verifyWordpressSignature(RAW_BODY, header, SECRET)).toEqual({
        ok: false,
        error: { code: 'invalid_prefix' },
      });
    }
  });

  it('deve recusar segredo errado', () => {
    const header = phpSignature(RAW_BODY, SECRET);

    expect(verifyWordpressSignature(RAW_BODY, header, 'outro-segredo')).toEqual(
      { ok: false, error: { code: 'invalid_signature' } },
    );
  });

  it('deve recusar quando um byte do corpo muda', () => {
    const body = new TextEncoder().encode(RAW_BODY);
    const header = phpSignature(body, SECRET);
    const changed = new Uint8Array(body);
    const first = changed[0] ?? 0;
    changed[0] = first + 1;

    expect(verifyWordpressSignature(changed, header, SECRET)).toEqual({
      ok: false,
      error: { code: 'invalid_signature' },
    });
  });

  it('deve recusar assinatura com tamanho diferente sem lançar', () => {
    const hex = phpSignature(RAW_BODY, SECRET).slice('sha256='.length);
    const cases = [
      `sha256=${hex.slice(0, -1)}`,
      `sha256=${hex}0`,
      'sha256=',
      // 64 caracteres e 128 bytes UTF-8: timingSafeEqual lançaria sem a checagem.
      `sha256=${'é'.repeat(hex.length)}`,
    ];

    for (const header of cases) {
      let result: ReturnType<typeof verifyWordpressSignature> | undefined;
      expect(() => {
        result = verifyWordpressSignature(RAW_BODY, header, SECRET);
      }).not.toThrow();
      expect(result).toEqual({
        ok: false,
        error: { code: 'invalid_signature' },
      });
    }
  });

  it('deve recusar segredo vazio', () => {
    const header = phpSignature(RAW_BODY, '');

    expect(verifyWordpressSignature(RAW_BODY, header, '')).toEqual({
      ok: false,
      error: { code: 'empty_secret' },
    });
    expect(verifyWordpressSignature(RAW_BODY, undefined, '')).toEqual({
      ok: false,
      error: { code: 'empty_secret' },
    });
  });
});
