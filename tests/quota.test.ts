import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The claim is what stands between one member and an unbounded model bill, so
 * these tests are about the decision it returns, not the SQL it emits. The stub
 * stands in for Postgres' own atomicity: the upsert hands back the total after
 * the increment, which is the only number the guard is allowed to look at.
 */
const mocks = vi.hoisted(() => ({
	returning: vi.fn(),
	updateSet: vi.fn(),
	selectRows: vi.fn()
}));

vi.mock('../src/lib/server/db/index', () => ({
	db: {
		insert: () => ({
			values: () => ({
				onConflictDoUpdate: () => ({ returning: mocks.returning })
			})
		}),
		update: () => ({
			set: (values: unknown) => {
				mocks.updateSet(values);
				return { where: async () => undefined };
			}
		}),
		select: () => ({ from: () => ({ where: mocks.selectRows }) })
	}
}));

const { claimLlmCall, llmCallsUsed, releaseLlmCall } = await import('../src/lib/server/db/quota');

const noon = new Date('2026-09-12T05:00:00Z');

/** The literal fragments of a drizzle `sql` template, without its table refs. */
function sqlText(value: unknown): string {
	const chunks = (value as { queryChunks?: unknown[] })?.queryChunks ?? [];
	return chunks
		.map((chunk) =>
			chunk && typeof chunk === 'object' && 'value' in chunk
				? String((chunk as { value: unknown }).value)
				: ''
		)
		.join(' ');
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe('claimLlmCall', () => {
	it('allows the call that lands exactly on the ceiling', async () => {
		mocks.returning.mockResolvedValue([{ used: 10 }]);
		expect(await claimLlmCall(1, 10, noon)).toBe(true);
	});

	it('refuses the one past it', async () => {
		mocks.returning.mockResolvedValue([{ used: 11 }]);
		expect(await claimLlmCall(1, 10, noon)).toBe(false);
	});

	// Two overlapping requests see different totals because the increment and
	// the comparison are the same statement; a read-then-write would hand both
	// of them the same number and let both through.
	it('gives overlapping requests different totals, so only one can be last', async () => {
		mocks.returning.mockResolvedValueOnce([{ used: 10 }]).mockResolvedValueOnce([{ used: 11 }]);
		const [first, second] = await Promise.all([claimLlmCall(1, 10, noon), claimLlmCall(1, 10, noon)]);
		expect([first, second]).toEqual([true, false]);
	});

	it('refuses rather than allows when the database returns nothing', async () => {
		mocks.returning.mockResolvedValue([]);
		expect(await claimLlmCall(1, 10, noon)).toBe(false);
	});
});

describe('releaseLlmCall', () => {
	it('floors the refund at zero so it cannot hand out free calls', async () => {
		await releaseLlmCall(1, noon);
		expect(sqlText(mocks.updateSet.mock.calls[0][0].used)).toContain('greatest');
	});
});

describe('llmCallsUsed', () => {
	it('reads nothing as none used', async () => {
		mocks.selectRows.mockResolvedValue([]);
		expect(await llmCallsUsed(1, noon)).toBe(0);
	});
	it('reports what the day has spent', async () => {
		mocks.selectRows.mockResolvedValue([{ used: 4 }]);
		expect(await llmCallsUsed(1, noon)).toBe(4);
	});
});
