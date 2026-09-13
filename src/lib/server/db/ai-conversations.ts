import { desc, eq } from 'drizzle-orm';
import { db } from './index';
import { aiConversations, users } from './schema';

export interface AiConversationView {
	id: number;
	userId: number;
	displayName: string;
	userMessage: string;
	assistantMessage: string;
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	createdAt: Date;
}

export async function createAiConversation(values: typeof aiConversations.$inferInsert) {
	const [row] = await db.insert(aiConversations).values(values).returning();
	return row;
}

/** Only recent turns are sent back to the model, keeping follow-ups useful and cheap. */
export async function recentAiConversations(userId: number, limit = 3) {
	const rows = await db
		.select()
		.from(aiConversations)
		.where(eq(aiConversations.userId, userId))
		.orderBy(desc(aiConversations.createdAt), desc(aiConversations.id))
		.limit(limit);
	return rows.reverse();
}

/** Cross-user view. Callers must enforce owner access before invoking this. */
export async function listAiConversations(limit = 200): Promise<AiConversationView[]> {
	const rows = await db
		.select({
			id: aiConversations.id,
			userId: aiConversations.userId,
			displayName: users.displayName,
			userMessage: aiConversations.userMessage,
			assistantMessage: aiConversations.assistantMessage,
			provider: aiConversations.provider,
			model: aiConversations.model,
			inputTokens: aiConversations.inputTokens,
			outputTokens: aiConversations.outputTokens,
			createdAt: aiConversations.createdAt
		})
		.from(aiConversations)
		.innerJoin(users, eq(users.id, aiConversations.userId))
		.orderBy(desc(aiConversations.createdAt), desc(aiConversations.id))
		.limit(limit);
	return rows;
}
