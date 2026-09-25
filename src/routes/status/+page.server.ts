import { error } from '@sveltejs/kit';
import { isOwner } from '$lib/server/access';
import { getOperationsDashboard } from '$lib/server/operations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.lineUserId || !isOwner(locals.lineUserId)) error(403, 'หน้านี้สำหรับเจ้าของบอทเท่านั้น');
	return { status: await getOperationsDashboard() };
};
