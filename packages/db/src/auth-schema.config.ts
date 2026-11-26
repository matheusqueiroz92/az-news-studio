import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

// Só a CLI do Better Auth lê este arquivo, para gerar src/schema/auth.ts.
// A instância que autentica o Studio fica em apps/web.
export const auth = betterAuth({
  database: drizzleAdapter(
    {},
    {
      provider: 'pg',
      usePlural: true,
    },
  ),
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'editor',
        input: false,
      },
      active: {
        type: 'boolean',
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true,
      sendMagicLink() {
        return Promise.resolve();
      },
    }),
  ],
});
