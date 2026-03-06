import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    // relative to ./web
    url: process.env.DATABASE_URL ?? '../data/app.db',
  },
} satisfies Config;
