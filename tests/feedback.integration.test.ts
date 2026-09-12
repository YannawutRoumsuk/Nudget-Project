import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Status filtering, ordering and the resolvedAt stamp are SQL, not logic — a
 * mocked query builder would happily agree with a broken WHERE or ORDER BY.
 * These run against a real database and are skipped when none is configured,
 * matching tests/access.integration.test.ts:
 *
 *   docker compose up -d
 *   TEST_DATABASE_URL=postgres://spendbot:spendbot@localhost:5433/nudget_test bun run test:run
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

if (url) {
	process.env.DATABASE_URL = url;
}

suite('feedback storage', async () => {
	const {
		FEEDBACK_DAILY_LIMIT,
		FEEDBACK_MAX_LENGTH,
		createFeedback,
		listFeedback,
		setFeedbackStatus,
		countFeedbackSince,
		countFeedbackByStatus
	} = await import('../src/lib/server/db/feedback');
	const { closeDatabase, db } = await import('../src/lib/server/db');
	const { categories, feedback, users } = await import('../src/lib/server/db/schema');

	let userA = 0;
	let userB = 0;

	beforeEach(async () => {
		await db.delete(feedback);
		await db.delete(users);
		await db.insert(categories).values({
			id: 'food', nameTh: 'อาหาร', nameEn: 'Food', kind: 'expense', icon: '🍜', color: '#f00'
		}).onConflictDoNothing();

		const [a] = await db.insert(users).values({ lineUserId: 'Ufeedback-a', displayName: 'คนเอ' }).returning();
		const [b] = await db.insert(users).values({ lineUserId: 'Ufeedback-b', displayName: 'คนบี' }).returning();
		userA = a.id;
		userB = b.id;
	});

	afterAll(async () => {
		await closeDatabase();
	});

	it('exposes the shared limits the LINE side and the web side agree on', () => {
		expect(FEEDBACK_DAILY_LIMIT).toBe(5);
		expect(FEEDBACK_MAX_LENGTH).toBe(1000);
	});

	it('creates a row that starts as new with no resolvedAt', async () => {
		const row = await createFeedback({
			userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'ขอบคุณสำหรับบอทนี้ครับ'
		});
		expect(row.status).toBe('new');
		expect(row.resolvedAt).toBeNull();
	});

	it('stamps resolvedAt when moved to done, and clears it when moved back', async () => {
		const row = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'ฟีดแบ็ก' });

		const done = await setFeedbackStatus(row.id, 'done');
		expect(done?.status).toBe('done');
		expect(done?.resolvedAt).not.toBeNull();

		const reopened = await setFeedbackStatus(row.id, 'new');
		expect(reopened?.status).toBe('new');
		expect(reopened?.resolvedAt).toBeNull();
	});

	it('stamps nothing extra when only moving to read', async () => {
		const row = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'ฟีดแบ็ก' });
		const read = await setFeedbackStatus(row.id, 'read');
		expect(read?.status).toBe('read');
		expect(read?.resolvedAt).toBeNull();
	});

	it('lists newest first regardless of insert order', async () => {
		const first = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'อันแรก' });
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = await createFeedback({ userId: userB, lineUserId: 'Ufeedback-b', displayName: 'คนบี', message: 'อันสอง' });

		const rows = await listFeedback();
		expect(rows.map((row) => row.id)).toEqual([second.id, first.id]);
	});

	it('filters by status', async () => {
		const a = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'อันแรก' });
		const b = await createFeedback({ userId: userB, lineUserId: 'Ufeedback-b', displayName: 'คนบี', message: 'อันสอง' });
		await setFeedbackStatus(b.id, 'done');

		const newOnly = await listFeedback({ status: 'new' });
		expect(newOnly.map((row) => row.id)).toEqual([a.id]);

		const doneOnly = await listFeedback({ status: 'done' });
		expect(doneOnly.map((row) => row.id)).toEqual([b.id]);
	});

	it('carries the sender’s current display name alongside the snapshot taken at send time', async () => {
		const sent = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'ชื่อตอนส่ง', message: 'สวัสดี' });
		await db.update(users).set({ displayName: 'ชื่อใหม่' }).where(eq(users.id, userA));

		const [listed] = await listFeedback({ status: 'new' });
		expect(listed.id).toBe(sent.id);
		expect(listed.displayName).toBe('ชื่อตอนส่ง');
		expect(listed.currentDisplayName).toBe('ชื่อใหม่');
	});

	it('counts only the given user’s feedback since a cutoff, not everyone’s', async () => {
		const now = new Date();
		const longAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
		await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'วันนี้ 1' });
		await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'วันนี้ 2' });
		await createFeedback({ userId: userB, lineUserId: 'Ufeedback-b', displayName: 'คนบี', message: 'ของคนบี' });
		const [old] = await db.insert(feedback).values({
			userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'เก่ามาก', createdAt: longAgo
		}).returning();
		expect(old.id).toBeTypeOf('number');

		const since = new Date(now.getTime() - 1000 * 60 * 60 * 24);
		expect(await countFeedbackSince(userA, since)).toBe(2);
		expect(await countFeedbackSince(userB, since)).toBe(1);
	});

	it('counts every status even when a status has no rows yet', async () => {
		const a = await createFeedback({ userId: userA, lineUserId: 'Ufeedback-a', displayName: 'คนเอ', message: 'หนึ่ง' });
		await createFeedback({ userId: userB, lineUserId: 'Ufeedback-b', displayName: 'คนบี', message: 'สอง' });
		await setFeedbackStatus(a.id, 'read');

		const counts = await countFeedbackByStatus();
		expect(counts).toEqual({ new: 1, read: 1, done: 0 });
	});
});
