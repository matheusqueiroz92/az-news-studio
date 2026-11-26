import { z } from 'zod';

export const wordpressWebhookEventSchema = z.object({
  event: z.literal('post.published'),
  postId: z.int().positive(),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().nonempty(),
  // AZ Bridge grava publishedAt com o formato `c` do PHP (`+00:00`), além de `Z`.
  publishedAt: z.iso.datetime({ offset: true }),
});

export type WordPressWebhookEvent = z.infer<
  typeof wordpressWebhookEventSchema
>;
