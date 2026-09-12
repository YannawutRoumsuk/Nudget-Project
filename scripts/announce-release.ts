import { closeDatabase } from '../src/lib/server/db';
import { listUsersMissingRelease, recordReleaseDelivery } from '../src/lib/server/db/releases';
import { findRelease, latestRelease } from '../src/lib/releases';
import { pushText } from '../src/lib/server/line/client';
import { noReleaseText, releaseNotesText } from '../src/lib/server/line/messages';
import type { User } from '../src/lib/server/db/schema';

/** Stays comfortably under LINE's per-second push rate limit. */
const DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Announces one release to every active user who has not received it yet.
 * Safe to re-run: `listUsersMissingRelease` already excludes anyone with a
 * delivery row, and the delivery is only recorded after the push succeeds, so
 * a crash mid-run just leaves the remaining recipients for the next run.
 *
 * Best-effort per recipient, matching `runReminderCheck` — one unreachable
 * user must not abort the announcement for everyone else.
 */
export async function announceRelease(version: string, options: { dryRun?: boolean } = {}): Promise<void> {
	const release = findRelease(version);
	if (!release) throw new Error(`[release] unknown version ${version}`);

	const recipients = await listUsersMissingRelease(version);
	if (options.dryRun) {
		console.log(`[release] dry run for ${version}: would notify ${recipients.length} user(s)`);
		for (const user of recipients) console.log(`[release]   - user ${user.id} (${user.lineUserId})`);
		return;
	}

	const text = releaseNotesText(release);
	let sent = 0;
	let failed = 0;
	for (const user of recipients) {
		if (await announceToUser(user, version, text)) sent++;
		else failed++;
		await sleep(DELAY_MS);
	}
	console.log(`[release] ${version}: sent ${sent}, failed ${failed} of ${recipients.length} recipient(s)`);
}

/**
 * Pushes to one recipient and records the delivery only once LINE confirms
 * the push, so a failure here can never look like a successful send on the
 * next run. Returns whether the push succeeded.
 */
async function announceToUser(user: User, version: string, text: string): Promise<boolean> {
	try {
		const ok = await pushText(user.lineUserId, text);
		if (!ok) {
			console.error(`[release] push to user ${user.id} was rejected by LINE`);
			return false;
		}
		await recordReleaseDelivery(user.id, version);
		return true;
	} catch (error) {
		console.error(`[release] user ${user.id} failed:`, error);
		return false;
	}
}

function resolveVersion(): string {
	const arg = process.argv[2];
	if (arg && arg !== '--dry-run') return arg;
	return latestRelease().version;
}

async function main() {
	const version = resolveVersion();
	try {
		if (!findRelease(version)) {
			console.error(`[release] unknown version ${version}`);
			console.error(noReleaseText());
			process.exitCode = 1;
			return;
		}

		const dryRun = process.argv.includes('--dry-run');
		await announceRelease(version, { dryRun });
		console.log(`[release] announce complete for ${version}`);
	} finally {
		await closeDatabase();
	}
}

// Guarded so importing this module (tests) never fires a real announce run —
// only running it directly with `bun run scripts/announce-release.ts` does.
if (import.meta.main) await main();
