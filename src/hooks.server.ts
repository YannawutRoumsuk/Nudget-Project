import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifySessionToken } from '$lib/server/auth';
import { building } from '$app/environment';
import { config } from '$lib/server/config';
import { startReminderWorker } from '$lib/server/reminders';

const runtime = globalThis as typeof globalThis & { __spendbotReminderWorkerStarted?: boolean };
if (!building && process.env.NODE_ENV !== 'test' && config.reminders.mode === 'timer' && config.databaseUrl && config.line.accessToken && config.line.allowedUserId && !runtime.__spendbotReminderWorkerStarted) {
	runtime.__spendbotReminderWorkerStarted = true;
	startReminderWorker();
}

/** The webhook authenticates with LINE's signature, not with the dashboard session. */
const PUBLIC_PREFIXES = ['/login', '/api/line', '/api/auth/line'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.lineUserId = verifySessionToken(event.cookies.get(SESSION_COOKIE));
	event.locals.authed = Boolean(event.locals.lineUserId);

	const isPublic = PUBLIC_PREFIXES.some((prefix) => event.url.pathname.startsWith(prefix));
	if (!isPublic && !event.locals.authed) {
		const next = event.url.pathname + event.url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
