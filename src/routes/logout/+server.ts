import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';
import { safeNext } from '$lib/server/redirect';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, url }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, `/login?next=${encodeURIComponent(safeNext(url.searchParams.get('next')) )}`);
};
