import { isOwner } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

/** The members link is an owner tool; everyone else should not see it exists. */
export const load: LayoutServerLoad = ({ locals }) => ({
	isOwner: Boolean(locals.lineUserId && isOwner(locals.lineUserId))
});
