import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Vite, so `.env` is not loaded for us.
try {
	process.loadEnvFile('.env');
} catch {
	// Fine when the vars are already exported into the environment.
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — copy .env.example to .env first');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url },
	casing: 'snake_case'
});
