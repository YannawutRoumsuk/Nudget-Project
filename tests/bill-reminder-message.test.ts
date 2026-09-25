import { describe, expect, it } from 'vitest';
import { billReminderStage, buildBillReminderMessages } from '../src/lib/server/bill-reminder-message';

describe('bill reminders', () => {
	it('selects upcoming, due, and overdue stages from the per-user lead time', () => {
		expect(billReminderStage(5, 5)).toBe('upcoming');
		expect(billReminderStage(6, 5)).toBeNull();
		expect(billReminderStage(0, 5)).toBe('due');
		expect(billReminderStage(-1, 5)).toBe('overdue');
		expect(billReminderStage(1, 0)).toBeNull();
	});

	it('groups bill cards into Flex carousels with owner-scoped actions', () => {
		const items = Array.from({ length: 13 }, (_, index) => ({
			id: index + 1,
			name: `บิล ${index + 1}`,
			amount: 300,
			period: '2026-09',
			dueDate: new Date('2026-09-25T02:00:00Z'),
			stage: 'overdue' as const
		}));
		const messages = buildBillReminderMessages(items, 'https://nudget.example/bills');

		expect(messages).toHaveLength(2);
		expect((messages[0].contents as { contents: unknown[] }).contents).toHaveLength(12);
		const text = JSON.stringify(messages[0].contents);
		expect(text).toContain('bill:pay:1:2026-09');
		expect(text).toContain('bill:snooze:1:2026-09');
		expect(text).toContain('https://nudget.example/bills');
		expect(messages[1].altText).toContain('บิล 13');
	});
});
