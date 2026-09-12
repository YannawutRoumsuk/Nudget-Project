import { describe, expect, it } from 'vitest';
import {
	buildComparison,
	buildMonthlyFacts,
	changeLabel,
	classifyChange,
	percentChange,
	totalSavings
} from '../src/lib/insights';

describe('percentChange', () => {
	it('returns null rather than Infinity when there is no baseline', () => {
		expect(percentChange(500, 0)).toBeNull();
		expect(percentChange(0, 0)).toBeNull();
	});
	it('reports growth and shrinkage against a real baseline', () => {
		expect(percentChange(120, 100)).toBeCloseTo(20);
		expect(percentChange(80, 100)).toBeCloseTo(-20);
	});
});

describe('buildMonthlyFacts', () => {
	it('summarises savings, bills, card spending and remaining plan without an LLM', () => {
		const facts = buildMonthlyFacts({
			income: 30000,
			expense: 18000,
			net: 12000,
			savings: 12000,
			savingsRate: 40,
			creditCardSpent: 4000,
			unpaidBills: 1500,
			remainingBudget: 2500,
			previousExpense: 20000,
			plan: { savingsGoal: 10000 }
		});

		expect(facts.highlights.join(' ')).toContain('ลดลง 2,000 บาท');
		expect(facts.highlights.join(' ')).toContain('40%');
		expect(facts.highlights.join(' ')).toContain('ถึงเป้าเงินเก็บ');
		expect(facts.attention.join(' ')).toContain('บัตรเครดิต 4,000 บาท');
		expect(facts.attention.join(' ')).toContain('บิลรอจ่าย 1,500 บาท');
	});

	it('flags overspending and works without a plan or income baseline', () => {
		const facts = buildMonthlyFacts({
			income: 0,
			expense: 900,
			net: -900,
			savings: 0,
			savingsRate: null,
			creditCardSpent: 0,
			unpaidBills: 0,
			remainingBudget: null,
			previousExpense: 0,
			plan: null
		});

		expect(facts.status).toContain('สูงกว่ารายรับ');
		expect(facts.attention.join(' ')).toContain('900 บาท');
	});
});

describe('classifyChange', () => {
	it('separates a brand new category from one that merely grew', () => {
		expect(classifyChange(500, 0)).toBe('new');
		expect(classifyChange(500, 400)).toBe('up');
	});
	it('separates a category that vanished from one that merely shrank', () => {
		expect(classifyChange(0, 400)).toBe('gone');
		expect(classifyChange(300, 400)).toBe('down');
	});
	it('treats sub-baht movement as no change', () => {
		expect(classifyChange(400.4, 400)).toBe('same');
	});
});

describe('changeLabel', () => {
	it('says the direction in words, never in colour alone', () => {
		expect(changeLabel('up', 12)).toBe('เพิ่มขึ้น 12%');
		expect(changeLabel('down', -8)).toBe('ลดลง 8%');
		expect(changeLabel('same', 0)).toBe('เท่าเดิม');
	});
	it('describes a category with no baseline instead of printing a percentage', () => {
		expect(changeLabel('new', null)).toBe('เพิ่งมีเดือนนี้');
		expect(changeLabel('gone', null)).toBe('เดือนนี้ไม่มี');
	});
	it('stops quoting a precise figure once it stops meaning anything', () => {
		expect(changeLabel('up', 5000)).toBe('เพิ่มขึ้นมาก');
	});
});

describe('buildComparison', () => {
	const rows = buildComparison([
		{ categoryId: 'food', current: 5000, previous: 4800, delta: 200 },
		{ categoryId: 'transport', current: 900, previous: 2400, delta: -1500 },
		{ categoryId: 'shopping', current: 700, previous: 0, delta: 700 }
	]);

	it('puts the biggest movement first, not the biggest amount', () => {
		expect(rows.map((row) => row.categoryId)).toEqual(['transport', 'shopping', 'food']);
	});
	it('scales each bar against the largest current amount', () => {
		expect(rows.find((row) => row.categoryId === 'food')?.share).toBe(1);
		expect(rows.find((row) => row.categoryId === 'transport')?.share).toBeCloseTo(0.18);
	});
	it('labels a category that did not exist last month', () => {
		expect(rows.find((row) => row.categoryId === 'shopping')?.kind).toBe('new');
		expect(rows.find((row) => row.categoryId === 'shopping')?.percent).toBeNull();
	});
	it('survives an empty month without dividing by zero', () => {
		expect(buildComparison([])).toEqual([]);
		const none = buildComparison([{ categoryId: 'food', current: 0, previous: 0, delta: 0 }]);
		expect(none[0].share).toBe(0);
	});
});

describe('totalSavings', () => {
	it('adds up what the ideas claim', () => {
		expect(totalSavings([{ monthlySaving: 300 }, { monthlySaving: 450 }])).toBe(750);
		expect(totalSavings([])).toBe(0);
	});
});
