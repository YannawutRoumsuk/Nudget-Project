/** Only local paths; browsers normalize backslashes into network-path URLs. */
export function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(raw)) return '/';
	return raw;
}
