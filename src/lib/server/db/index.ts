import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '$lib/server/config';
import * as schema from './schema';

// postgres.js connects lazily. A non-routable fallback lets SvelteKit inspect
// server modules during a CI build; production startup still runs migrations
// first and fails fast when DATABASE_URL is missing.
const databaseUrl = config.databaseUrl || 'postgres://invalid:invalid@127.0.0.1:1/invalid';

// A small, short-lived pool lets Railway put the single-user web service to sleep.
const client = postgres(databaseUrl, {
	max: 3,
	idle_timeout: 20,
	connect_timeout: 10,
	onnotice: () => {}
});

export const db = drizzle(client, { schema, casing: 'snake_case' });
export const closeDatabase = () => client.end({ timeout: 5 });
export { schema };
