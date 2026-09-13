import { error } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { listAiConversations } from '$lib/server/db/ai-conversations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับแอดมินเท่านั้น');
	return { conversations: await listAiConversations() };
};
