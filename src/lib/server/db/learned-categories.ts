import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { extractLearningKeyword, learnedKeywordMatches, normalizeLearnedText } from '$lib/learned-categories';
import { db } from './index';
import { categories, userCategoryRules } from './schema';
import type { TxKind } from './schema';
import type { DbExecutor } from './queries';

export async function rememberCategoryFromEdit(userId: number, categoryId: string, note: string, rawText = '', executor: DbExecutor = db): Promise<void> {
	const keyword = extractLearningKeyword(note, rawText);
	if (!keyword) return;
	await upsertRule(userId, keyword, categoryId, executor);
}

export async function findLearnedCategory(userId: number, text: string, kind?: TxKind): Promise<{ id: number; keyword: string; categoryId: string; kind: TxKind } | null> {
	const rows = await db.select({ id: userCategoryRules.id, keyword: userCategoryRules.keyword, categoryId: userCategoryRules.categoryId, kind: categories.kind })
		.from(userCategoryRules).innerJoin(categories, eq(categories.id, userCategoryRules.categoryId))
		.where(eq(userCategoryRules.userId, userId))
		.orderBy(desc(sql`length(${userCategoryRules.keyword})`), asc(userCategoryRules.id));
	const match = rows.find((row) => (!kind || row.kind === kind) && learnedKeywordMatches(row.keyword, text, row.kind, row.kind));
	return match ?? null;
}

export async function recordLearnedCategoryMatch(id: number, userId: number, savedLlmCall: boolean, executor: DbExecutor = db): Promise<void> {
	await executor.update(userCategoryRules).set({
		matchCount: sql`${userCategoryRules.matchCount} + 1`,
		savedLlmCalls: savedLlmCall ? sql`${userCategoryRules.savedLlmCalls} + 1` : userCategoryRules.savedLlmCalls,
		lastMatchedAt: new Date(), updatedAt: new Date()
	}).where(and(eq(userCategoryRules.id, id), eq(userCategoryRules.userId, userId)));
}

export async function listLearnedCategories(userId: number) {
	return db.select({
		id: userCategoryRules.id, keyword: userCategoryRules.keyword, categoryId: userCategoryRules.categoryId,
		categoryName: categories.nameTh, kind: categories.kind, matchCount: userCategoryRules.matchCount,
		savedLlmCalls: userCategoryRules.savedLlmCalls, lastMatchedAt: userCategoryRules.lastMatchedAt,
		updatedAt: userCategoryRules.updatedAt
	}).from(userCategoryRules).innerJoin(categories, eq(categories.id, userCategoryRules.categoryId))
		.where(eq(userCategoryRules.userId, userId)).orderBy(desc(userCategoryRules.savedLlmCalls), desc(userCategoryRules.updatedAt));
}

export async function updateLearnedCategory(userId: number, id: number, keyword: string, categoryId: string): Promise<boolean> {
	const normalizedKeyword = normalizeLearnedText(keyword);
	if (!normalizedKeyword || normalizedKeyword.length > 64) return false;
	const [current] = await db.select({ kind: categories.kind }).from(userCategoryRules)
		.innerJoin(categories, eq(categories.id, userCategoryRules.categoryId))
		.where(and(eq(userCategoryRules.id, id), eq(userCategoryRules.userId, userId))).limit(1);
	const [category] = await db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId)).limit(1);
	if (!current || !category || current.kind !== category.kind) return false;
	const rows = await db.update(userCategoryRules).set({ keyword: normalizedKeyword, categoryId, updatedAt: new Date() })
		.where(and(eq(userCategoryRules.id, id), eq(userCategoryRules.userId, userId))).returning({ id: userCategoryRules.id });
	return rows.length > 0;
}

export async function deleteLearnedCategory(userId: number, id: number): Promise<boolean> {
	const rows = await db.delete(userCategoryRules).where(and(eq(userCategoryRules.id, id), eq(userCategoryRules.userId, userId))).returning({ id: userCategoryRules.id });
	return rows.length > 0;
}

async function upsertRule(userId: number, keyword: string, categoryId: string, executor: DbExecutor): Promise<void> {
	await executor.insert(userCategoryRules).values({ userId, keyword, categoryId })
		.onConflictDoUpdate({
			target: [userCategoryRules.userId, userCategoryRules.keyword],
			set: { categoryId, updatedAt: new Date() }
		});
}
