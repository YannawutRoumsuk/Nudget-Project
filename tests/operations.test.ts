import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), execute: vi.fn() }));
vi.mock('../src/lib/server/db/index', () => ({
	db: {
		insert: mocks.insert,
		execute: mocks.execute
	}
}));

import { databaseReady, recordSystemEvent } from '../src/lib/server/operations';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.insert.mockReturnValue({ values: mocks.values });
	mocks.values.mockResolvedValue(undefined);
	mocks.execute.mockResolvedValue([{ '?column?': 1 }]);
});

describe('operational instrumentation', () => {
	it('stores only a short safe error code, never an error message', async () => {
		await recordSystemEvent('webhook', false, 'invalid_signature');
		expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'webhook', success: false, errorCode: 'invalid_signature' }));

		await recordSystemEvent('ocr_failure', false, 'secret OCR contents with account 123');
		expect(mocks.values).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode: 'other' }));
	});

	it('does not let unavailable metrics storage break the service', async () => {
		mocks.values.mockRejectedValueOnce(new Error('database unavailable'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(recordSystemEvent('line_push', true)).resolves.toBeUndefined();
		expect(log).toHaveBeenCalledWith('[ops] could not record line_push metric');
		log.mockRestore();
	});

	it('exposes database readiness as a boolean without details', async () => {
		await expect(databaseReady()).resolves.toBe(true);
		mocks.execute.mockRejectedValueOnce(new Error('postgres://secret'));
		await expect(databaseReady()).resolves.toBe(false);
	});
});
