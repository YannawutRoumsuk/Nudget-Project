const USER_ACTIVITY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/** Authenticated page visits and changes count; static files and API probes do not. */
export function isUserActivityRequest(method: string, pathname: string): boolean {
	return USER_ACTIVITY_METHODS.has(method.toUpperCase()) &&
		!pathname.startsWith('/_app/') &&
		!pathname.startsWith('/api/') &&
		pathname !== '/favicon.ico';
}
