import { fail, redirect } from '@sveltejs/kit';
import { buildBreakdown, fillDailySeries } from '$lib/analytics';
import { isFixedExpenseCategory } from '$lib/categories';
import { resolveMonthSelection } from '$lib/month';
import { isOwner } from '$lib/server/access';
import { requireUserId } from '$lib/server/auth';
import { config, describeLlmSetup } from '$lib/server/config';
import {
	INSIGHT_DAILY_LIMIT,
	getCachedInsight,
	getLatestInsight,
	saveInsight
} from '$lib/server/db/insights';
import { claimLlmCall, llmCallsUsed, releaseLlmCall } from '$lib/server/db/quota';
import { getByCategory, getDailySeries, updateTransaction } from '$lib/server/db/queries';
import { buildInsightInput, fingerprintInput, generateInsight } from '$lib/server/insights';
import { buildMultiMonthComparison, resolveBaselineKind } from '$lib/server/insights/comparison';
import type { ComparisonSort } from '$lib/insights';
import { addDays, bangkokDayKey, bangkokMonthKey } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

/**
 * Opening the page must never cost a model call: it loads the charts and only
 * whatever analysis was already paid for. The button is the only thing that
 * spends money, which is also what keeps a refresh from billing twice.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const now = new Date();
	const month = resolveMonthSelection(url.searchParams.get('month'), now);
	const baseline = resolveBaselineKind(url.searchParams.get('baseline'));
	const comparisonSort: ComparisonSort = url.searchParams.get('sort') === 'percent' ? 'percent' : 'amount';
	const input = await buildInsightInput(userId, month.key, now);
	const [expenseSlices, series, used, comparison] = await Promise.all([
		getByCategory(userId, month, 'expense'),
		getDailySeries(userId, month, { excludeFixed: true }),
		llmCallsUsed(userId, now),
		buildMultiMonthComparison(userId, month, input, baseline)
	]);

	const fingerprint = fingerprintInput(input);
	// `getLatestInsight` rather than only the exact match: an analysis written
	// before today's entries is still worth showing, as long as the page says so.
	const [exact, latest] = await Promise.all([
		getCachedInsight(userId, month.key, fingerprint),
		getLatestInsight(userId, month.key)
	]);
	const stored = exact ?? latest;

	return {
		month,
		input,
		comparison,
		comparisonSort,
		fingerprint,
		analysis: stored
			? {
					insight: stored.insight,
					createdAt: stored.createdAt,
					model: stored.model,
					stale: !exact
				}
			: null,
		llmEnabled: config.llm.provider !== 'none',
		// Shown to the owner only: the page otherwise says the assistant is off
		// without saying which setting is missing, which is exactly the question
		// someone has when they have just added a key and nothing changed.
		llmSetup: isOwner(locals.lineUserId ?? '') ? describeLlmSetup() : null,
		analysesLeft: Math.max(0, INSIGHT_DAILY_LIMIT - used),
		breakdown: buildBreakdown(expenseSlices.filter((slice) => !isFixedExpenseCategory(slice.categoryId))),
		fixedBreakdown: buildBreakdown(expenseSlices.filter((slice) => isFixedExpenseCategory(slice.categoryId))),
		days: fillDailySeries(series, month.from, addDays(month.to, -1), bangkokDayKey(now)),
		isCurrentMonth: month.key === bangkokMonthKey(now)
	};
};

export const actions: Actions = {
	analyze: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const month = String((await request.formData()).get('month') ?? '');
		const selection = resolveMonthSelection(month);

		if (config.llm.provider === 'none') {
			return fail(503, { message: 'ยังไม่ได้ตั้งค่าผู้ช่วยวิเคราะห์' });
		}

		const input = await buildInsightInput(userId, selection.key);
		if (input.transactionCount === 0) {
			return fail(400, { message: 'เดือนนี้ยังไม่มีรายการให้วิเคราะห์' });
		}

		// Claimed before the call, not counted after it: two submissions that
		// overlap would otherwise both read the same total and both spend money.
		if (!(await claimLlmCall(userId, INSIGHT_DAILY_LIMIT))) {
			return fail(429, {
				message: `วิเคราะห์ได้วันละ ${INSIGHT_DAILY_LIMIT} ครั้ง พรุ่งนี้ค่อยลองใหม่ ตัวเลขและกราฟด้านล่างยังถูกต้องตามปกติ`
			});
		}

		const insight = await generateInsight(input, userId);
		if (!insight) {
			// Nothing was billed, so the claim goes back rather than costing
			// someone one of the few analyses they get today.
			await releaseLlmCall(userId);
			return fail(502, {
				message: 'ตอนนี้ยังวิเคราะห์ให้ไม่ได้ ลองใหม่อีกครั้งได้ ตัวเลขและกราฟด้านล่างยังถูกต้องตามปกติ'
			});
		}

		// The call is already paid for, so a failed cache write must not turn into
		// a 500 that loses the paragraph. Worst case it is written again next time.
		try {
			await saveInsight(userId, selection.key, fingerprintInput(input), insight, config.llm.insightModel);
		} catch (error) {
			console.error('[insights] could not store the analysis:', error);
		}
		return { insight };
	},
	dismissAnomaly: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'รายการไม่ถูกต้อง' });
		const updated = await updateTransaction(id, requireUserId(locals), { anomalyDismissed: true });
		if (!updated) return fail(404, { message: 'ไม่พบรายการนี้' });
		redirect(303, comparisonUrl(form));
	},
	markSpecial: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'รายการไม่ถูกต้อง' });
		const updated = await updateTransaction(id, requireUserId(locals), {
			excludeFromBaseline: true,
			anomalyDismissed: true
		});
		if (!updated) return fail(404, { message: 'ไม่พบรายการนี้' });
		redirect(303, comparisonUrl(form));
	}
};

function comparisonUrl(form: FormData): string {
	const month = resolveMonthSelection(String(form.get('month') ?? '')).key;
	const baseline = resolveBaselineKind(String(form.get('baseline') ?? ''));
	const sort: ComparisonSort = form.get('sort') === 'percent' ? 'percent' : 'amount';
	return `/insights?month=${encodeURIComponent(month)}&baseline=${baseline}&sort=${sort}`;
}
