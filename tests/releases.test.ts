import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listUsersMissingRelease: vi.fn(),
	recordReleaseDelivery: vi.fn(),
	pushText: vi.fn(),
	closeDatabase: vi.fn(),
	releaseNotesText: vi.fn(),
	noReleaseText: vi.fn()
}));

vi.mock('../src/lib/server/db', () => ({ closeDatabase: mocks.closeDatabase }));
vi.mock('../src/lib/server/db/releases', () => ({
	listUsersMissingRelease: mocks.listUsersMissingRelease,
	recordReleaseDelivery: mocks.recordReleaseDelivery
}));
vi.mock('../src/lib/server/line/client', () => ({ pushText: mocks.pushText }));
vi.mock('../src/lib/server/line/messages', () => ({
	releaseNotesText: mocks.releaseNotesText,
	noReleaseText: mocks.noReleaseText
}));

import { announceRelease } from '../scripts/announce-release';
import { findRelease, latestRelease, releases } from '../src/lib/releases';

const SEMVER_ISH = /^\d+\.\d+\.\d+$/;

function user(id: number, lineUserId: string) {
	return { id, lineUserId, displayName: '', active: true, createdAt: new Date(), updatedAt: new Date() };
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.releaseNotesText.mockReturnValue('release text');
	mocks.noReleaseText.mockReturnValue('no release text');
	mocks.pushText.mockResolvedValue(true);
	mocks.recordReleaseDelivery.mockResolvedValue(undefined);
});

describe('release notes data', () => {
	it('latestRelease returns the newest entry', () => {
		expect(latestRelease()).toBe(releases[0]);
	});

	it('findRelease returns undefined for an unknown version', () => {
		expect(findRelease('9.9.9')).toBeUndefined();
	});

	it('every release has a title, at least one highlight, and a semver-ish version', () => {
		expect(releases.length).toBeGreaterThan(0);
		for (const release of releases) {
			expect(release.title.trim().length).toBeGreaterThan(0);
			expect(release.highlights.length).toBeGreaterThan(0);
			for (const highlight of release.highlights) expect(highlight.trim().length).toBeGreaterThan(0);
			expect(release.version).toMatch(SEMVER_ISH);
		}
	});
});

describe('announceRelease', () => {
	it('does not send twice to the same person across runs', async () => {
		// A tiny in-memory stand-in for the release_deliveries table, so the test
		// exercises the same "already delivered users are excluded" contract the
		// real set-based query provides.
		const delivered = new Set<number>();
		mocks.listUsersMissingRelease.mockImplementation(async () =>
			[user(1, 'owner'), user(2, 'partner')].filter((u) => !delivered.has(u.id))
		);
		mocks.recordReleaseDelivery.mockImplementation(async (userId: number) => {
			delivered.add(userId);
		});

		await announceRelease(latestRelease().version);
		expect(mocks.pushText).toHaveBeenCalledTimes(2);

		mocks.pushText.mockClear();
		await announceRelease(latestRelease().version);
		expect(mocks.pushText).not.toHaveBeenCalled();
	});

	it('records the delivery only once per successful push', async () => {
		mocks.listUsersMissingRelease.mockResolvedValue([user(1, 'owner')]);
		await announceRelease(latestRelease().version);
		expect(mocks.recordReleaseDelivery).toHaveBeenCalledTimes(1);
		expect(mocks.recordReleaseDelivery).toHaveBeenCalledWith(1, latestRelease().version);
	});

	it('does not record a delivery when the push fails', async () => {
		mocks.listUsersMissingRelease.mockResolvedValue([user(1, 'owner'), user(2, 'partner')]);
		mocks.pushText.mockImplementation(async (to: string) => to !== 'owner');

		await announceRelease(latestRelease().version);

		expect(mocks.recordReleaseDelivery).not.toHaveBeenCalledWith(1, expect.anything());
		expect(mocks.recordReleaseDelivery).toHaveBeenCalledWith(2, latestRelease().version);
	});

	it('does not record a delivery when the push throws', async () => {
		mocks.listUsersMissingRelease.mockResolvedValue([user(1, 'owner')]);
		mocks.pushText.mockRejectedValue(new Error('LINE down'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		await announceRelease(latestRelease().version);

		expect(mocks.recordReleaseDelivery).not.toHaveBeenCalled();
		log.mockRestore();
	});

	it('keeps announcing to other recipients when one push fails', async () => {
		mocks.listUsersMissingRelease.mockResolvedValue([user(1, 'owner'), user(2, 'partner')]);
		mocks.pushText.mockImplementation(async (to: string) => {
			if (to === 'owner') throw new Error('LINE down');
			return true;
		});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		await announceRelease(latestRelease().version);

		expect(mocks.pushText).toHaveBeenCalledWith('partner', 'release text');
		expect(mocks.recordReleaseDelivery).toHaveBeenCalledWith(2, latestRelease().version);
		log.mockRestore();
	});

	it('dry run reports recipients without pushing or recording', async () => {
		mocks.listUsersMissingRelease.mockResolvedValue([user(1, 'owner')]);
		await announceRelease(latestRelease().version, { dryRun: true });
		expect(mocks.pushText).not.toHaveBeenCalled();
		expect(mocks.recordReleaseDelivery).not.toHaveBeenCalled();
	});

	it('throws for an unknown version before touching users or LINE', async () => {
		await expect(announceRelease('9.9.9')).rejects.toThrow();
		expect(mocks.listUsersMissingRelease).not.toHaveBeenCalled();
		expect(mocks.pushText).not.toHaveBeenCalled();
	});
});
