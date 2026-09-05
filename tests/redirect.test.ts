import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/server/redirect';

describe('login return path', () => {
	it.each([null, '', 'https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\n/example.com'])('rejects unsafe path %j', (input) => {
		expect(safeNext(input)).toBe('/');
	});
	it('preserves a local path and filters', () => {
		expect(safeNext('/transactions?range=month&category=food')).toBe('/transactions?range=month&category=food');
	});
});
