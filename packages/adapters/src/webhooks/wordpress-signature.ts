import { createHmac, timingSafeEqual } from 'node:crypto';

import { err, ok, type Result } from '@az-news/core';

const SIGNATURE_PREFIX = 'sha256=';

export type WordpressSignatureErrorCode =
  'missing_header' | 'invalid_prefix' | 'invalid_signature' | 'empty_secret';

export type WordpressSignatureError = {
  readonly code: WordpressSignatureErrorCode;
};

/**
 * Confere `X-AZ-Signature` do AZ Bridge.
 * O HMAC é dos bytes recebidos: sem JSON.parse e sem JSON.stringify.
 */
export function verifyWordpressSignature(
  body: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string,
): Result<void, WordpressSignatureError> {
  if (secret === '') {
    return err({ code: 'empty_secret' });
  }

  if (
    signatureHeader === undefined ||
    signatureHeader === null ||
    signatureHeader === ''
  ) {
    return err({ code: 'missing_header' });
  }

  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return err({ code: 'invalid_prefix' });
  }

  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac('sha256', secret).update(body).digest('hex');

  if (!fixedTimeEqual(expected, provided)) {
    return err({ code: 'invalid_signature' });
  }

  return ok(undefined);
}

/**
 * `timingSafeEqual` lança quando os buffers têm tamanhos diferentes.
 * Tamanho diferente já é assinatura inválida.
 */
function fixedTimeEqual(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);

  if (expectedBytes.byteLength !== providedBytes.byteLength) {
    return false;
  }

  return timingSafeEqual(expectedBytes, providedBytes);
}
