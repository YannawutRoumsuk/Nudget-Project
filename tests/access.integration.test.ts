import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Membership and the member list are SQL, not logic — an upsert that stops
 * reactivating, or a join that starts multiplying rows, would sail past a
 * mocked test. These run against a real database and are skipped when none is
 * configured, so `bun run test:run` still works with nothing installed.
 *
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgres://spendbot:spendbot@localhost:5433/nudget_test bun run test:run
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

if (url) {
	process.env.DATABASE_URL = url;
	process.env.LINE_ALLOWED_USER_ID = 'Uowner';
}

suite('membership against a real database', async () => {
	const { admit, isOwner, resolveMember } = await import('../src/lib/server/access');
	const { listMembers, setUserActive, getUserByLineId } = await import('../src/lib/server/db/users');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { categories, transactions, users } = await import('../src/lib/server/db/schema');

	beforeEach(async () => {
		await db.delete(transactions);
		await db.delete(users);
		await db.insert(categories).values({
			id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00'
		}).onConflictDoNothing();
	});

	afterAll(async () => {
		await closeDatabase();
	});

	it('opens an account for a newcomer and recognises them afterwards', async () => {
		const first = await admit('Uguest', async () => 'เพื่อน');
		expect(first.status).toBe('joined');

		const second = await admit('Uguest');
		expect(second.status).toBe('member');
		expect(second.status === 'member' && second.user.id).toBe(first.status === 'joined' && first.user.id);
		expect((await getUserByLineId('Uguest'))?.displayName).toBe('เพื่อน');
	});

	it('keeps a revoked account out until an owner switches it back on', async () => {
		const joined = await admit('Uguest');
		const id = joined.status === 'joined' ? joined.user.id : 0;

		await setUserActive(id, false);
		expect(await resolveMember('Uguest')).toBeNull();
		expect((await admit('Uguest')).status).toBe('revoked');

		await setUserActive(id, true);
		expect((await resolveMember('Uguest'))?.id).toBe(id);
	});

	it('lets an owner in before any row exists and cannot be locked out by the flag', async () => {
		expect(isOwner('Uowner')).toBe(true);
		const owner = await resolveMember('Uowner');
		expect(owner?.lineUserId).toBe('Uowner');

		// An owner is defined by configuration, so the row follows the config
		// rather than the other way round — otherwise nobody could undo it.
		await setUserActive(owner!.id, false);
		expect((await resolveMember('Uowner'))?.id).toBe(owner!.id);
	});

	it('reports who joined, how much they recorded and when they were last active', async () => {
		const guest = await admit('Uguest', async () => 'เพื่อน');
		const guestId = guest.status === 'joined' ? guest.user.id : 0;
		await admit('Uquiet', async () => 'คนเงียบ');

		await db.insert(transactions).values([
			{ userId: guestId, kind: 'expense', amount: '60.00', categoryId: 'food', note: 'ข้าว', occurredAt: new Date('2026-09-01T05:00:00Z'), source: 'line', parsedBy: 'rule' },
			{ userId: guestId, kind: 'expense', amount: '80.00', categoryId: 'food', note: 'กาแฟ', occurredAt: new Date('2026-09-05T05:00:00Z'), source: 'line', parsedBy: 'rule' }
		]);

		const members = await listMembers();
		const active = members.find((member) => member.lineUserId === 'Uguest');
		const quiet = members.find((member) => member.lineUserId === 'Uquiet');

		expect(members).toHaveLength(2);
		expect(active?.displayName).toBe('เพื่อน');
		expect(active?.transactionCount).toBe(2);
		expect(active?.lastActivityAt).toEqual(new Date('2026-09-05T05:00:00Z'));
		// Someone who never recorded anything must still appear, not be joined away.
		expect(quiet?.transactionCount).toBe(0);
		expect(quiet?.lastActivityAt).toBeNull();
	});

	it('lists a revoked member so the owner can see and undo it', async () => {
		const joined = await admit('Uguest');
		await setUserActive(joined.status === 'joined' ? joined.user.id : 0, false);
		const members = await listMembers();
		expect(members.find((member) => member.lineUserId === 'Uguest')?.active).toBe(false);
	});
});
