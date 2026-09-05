import { describe, expect, it } from 'vitest';
import { shouldRemind } from '../src/lib/server/reminders';
import { fromBangkok } from '../src/lib/utils/date';

describe('bill reminders', () => {
	it('matches the Bangkok calendar day exactly', () => {
		const due = fromBangkok(2026, 9, 10, 9);
		expect(shouldRemind(due, fromBangkok(2026, 9, 7, 8), 3)).toBe(true);
		expect(shouldRemind(due, fromBangkok(2026, 9, 8, 0), 3)).toBe(false);
	});
});
