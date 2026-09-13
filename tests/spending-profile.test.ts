import { describe, expect, it } from 'vitest';
import { buildSpendingProfile } from '../src/lib/analytics';

describe('buildSpendingProfile', () => {
	it('keeps rent and bills outside everyday averages', () => {
		const result = buildSpendingProfile([
			{ categoryId: 'rent', total: 7000, count: 1 },
			{ categoryId: 'bills', total: 1200, count: 2 },
			{ categoryId: 'food', total: 3000, count: 20 },
			{ categoryId: 'transport', total: 1000, count: 10 },
			{ categoryId: 'shopping', total: 500, count: 1 }
		], 10);
		expect(result).toMatchObject({ total: 12700, fixed: 8200, regular: 4500, food: 3000, transport: 1000, other: 500 });
		expect(result.regularPerDay).toBe(450);
		expect(result.foodPerDay).toBe(300);
	});
});
