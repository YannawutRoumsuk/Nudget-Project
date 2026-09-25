import { json } from '@sveltejs/kit';
import { databaseReady } from '$lib/server/operations';
import type { RequestHandler } from './$types';

/** Railway readiness requires a live process and a queryable PostgreSQL database. */
export const GET: RequestHandler = async () => {
	if (!await databaseReady()) return json({ ok: false }, { status: 503 });
	return json({ ok: true });
};
