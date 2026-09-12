import { and, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { releaseDeliveries, users } from './schema';
import type { DbExecutor } from './queries';
import type { User } from './schema';

/**
 * Idempotent so a re-run of the announce script after a crash never double
 * counts — and, paired with the primary key on (user_id, version), never
 * double-sends either.
 */
export async function recordReleaseDelivery(userId: number, version: string, executor: DbExecutor = db): Promise<void> {
	await executor.insert(releaseDeliveries).values({ userId, version }).onConflictDoNothing();
}

/**
 * Active users with no delivery row for this version yet. A left join against
 * the deliveries table (keyed on this version) filtered to the unmatched side
 * is one set-based query instead of a delivered-check per user, so the
 * announce script scales with the member list, not with round trips.
 */
export async function listUsersMissingRelease(version: string, executor: DbExecutor = db): Promise<User[]> {
	const rows = await executor
		.select({ user: users })
		.from(users)
		.leftJoin(
			releaseDeliveries,
			and(eq(releaseDeliveries.userId, users.id), eq(releaseDeliveries.version, version))
		)
		.where(and(eq(users.active, true), isNull(releaseDeliveries.userId)));

	return rows.map((row) => row.user);
}
