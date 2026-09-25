import { buildReportCategories, summarizeReportBudgets } from '$lib/monthly-report';
import { resolveMonthSelection } from '$lib/month';
import { requireUserId } from '$lib/server/auth';
import { getCachedInsight } from '$lib/server/db/insights';
import { getMonthlyCategoryBudgets } from '$lib/server/db/plans';
import { getByCategory } from '$lib/server/db/queries';
import { buildInsightInput, fingerprintInput } from '$lib/server/insights';
import type { PageServerLoad } from './$types';

/** Loads aggregates only; notes, merchants, and individual transactions never enter a report. */
export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const month = resolveMonthSelection(url.searchParams.get('month'));
	const privacyMode = url.searchParams.get('privacy') !== '0';
	const [input, slices, budgets] = await Promise.all([
		buildInsightInput(userId, month.key),
		getByCategory(userId, month, 'expense'),
		getMonthlyCategoryBudgets(userId, month.key)
	]);
	const categories = buildReportCategories(slices, budgets, privacyMode);
	const { total: budgetTotal, over: budgetOver } = summarizeReportBudgets(slices, budgets);
	const insight = privacyMode ? null : await getCachedInsight(userId, month.key, fingerprintInput(input));
	return {
		month, input, privacyMode, categories,
		budgetTotal, budgetOver,
		insight
	};
};
