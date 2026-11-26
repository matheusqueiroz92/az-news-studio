import { describe, expect, it } from 'vitest';

import { wordpressWebhookEventSchema } from './wordpress-webhook-event.js';
import type { WordPressWebhookEvent } from './wordpress-webhook-event.js';

/** Formato `c` do PHP, o mesmo que `az-bridge.php` grava em `publishedAt`. */
const phpPublishedAt = '2026-11-25T12:00:00+00:00';

const validEvent = {
  event: 'post.published',
  postId: 42,
  url: 'https://homolog.aznews.com.br/obra-no-centro/',
  title: 'Prefeitura anuncia obra no centro',
  publishedAt: phpPublishedAt,
} satisfies WordPressWebhookEvent;

describe('wordpressWebhookEventSchema', () => {
  it('deve aceitar post.published com postId inteiro positivo, url, title e publishedAt em ISO-8601', () => {
    const result = wordpressWebhookEventSchema.safeParse(validEvent);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validEvent);
    }
  });

  it('deve aceitar publishedAt com Z e com offset +00:00 no formato c do PHP', () => {
    const withZ = wordpressWebhookEventSchema.safeParse({
      ...validEvent,
      publishedAt: '2026-11-25T12:00:00Z',
    });
    const withOffset = wordpressWebhookEventSchema.safeParse({
      ...validEvent,
      publishedAt: '2026-11-25T12:00:00+00:00',
    });

    expect(withZ.success).toBe(true);
    expect(withOffset.success).toBe(true);
    if (withZ.success) {
      expect(withZ.data.publishedAt).toBe('2026-11-25T12:00:00Z');
    }
    if (withOffset.success) {
      expect(withOffset.data.publishedAt).toBe('2026-11-25T12:00:00+00:00');
    }
  });

  it('deve recusar event diferente de post.published', () => {
    for (const event of ['post.updated', 'page.published', '']) {
      const result = wordpressWebhookEventSchema.safeParse({
        ...validEvent,
        event,
      });
      expect(result.success, event).toBe(false);
    }
  });

  it('deve recusar postId zero, negativo ou fracionário', () => {
    for (const postId of [0, -1, 1.5]) {
      const result = wordpressWebhookEventSchema.safeParse({
        ...validEvent,
        postId,
      });
      expect(result.success, String(postId)).toBe(false);
    }
  });

  it('deve recusar url que não seja URL absoluta', () => {
    for (const url of [
      '/obra-no-centro/',
      'homolog.aznews.com.br/obra-no-centro/',
      '',
    ]) {
      const result = wordpressWebhookEventSchema.safeParse({
        ...validEvent,
        url,
      });
      expect(result.success, url).toBe(false);
    }
  });

  it('deve recusar url com protocolo javascript:', () => {
    for (const url of [
      'javascript:alert(1)',
      'ftp://arquivos.exemplo/materia.txt',
    ]) {
      const result = wordpressWebhookEventSchema.safeParse({
        ...validEvent,
        url,
      });
      expect(result.success, url).toBe(false);
    }
  });

  it('deve recusar title vazio', () => {
    const result = wordpressWebhookEventSchema.safeParse({
      ...validEvent,
      title: '',
    });

    expect(result.success).toBe(false);
  });

  it('deve recusar publishedAt que não seja data', () => {
    for (const publishedAt of [
      '',
      'ontem',
      '2026-11-25',
      '2026-11-25 12:00:00',
    ]) {
      const result = wordpressWebhookEventSchema.safeParse({
        ...validEvent,
        publishedAt,
      });
      expect(result.success, publishedAt).toBe(false);
    }
  });

  it('deve ignorar campo desconhecido', () => {
    const result = wordpressWebhookEventSchema.safeParse({
      ...validEvent,
      focusKeyword: 'obra',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validEvent);
      expect(result.data).not.toHaveProperty('focusKeyword');
    }
  });
});
