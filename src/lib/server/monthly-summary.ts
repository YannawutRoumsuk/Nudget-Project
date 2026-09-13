import { config } from '$lib/server/config';
import { getCachedInsight, INSIGHT_DAILY_LIMIT, saveInsight } from '$lib/server/db/insights';
import { claimLlmCall, releaseLlmCall } from '$lib/server/db/quota';
import { buildInsightInput, fingerprintInput, generateInsight } from '$lib/server/insights';
import type { InsightInput } from '$lib/server/insights';
import { formatNumber } from '$lib/utils/money';

export interface MonthlySummaryResult {
	text: string;
	hasData: boolean;
	usedAi: boolean;
}

export async function buildMonthlyLineSummary(
	userId: number,
	month: string,
	now = new Date(),
	options: { claimQuota?: boolean } = {}
): Promise<MonthlySummaryResult> {
	const input = await buildInsightInput(userId, month, now);
	if (input.transactionCount === 0) {
		return { text: `🗓 สรุป${input.monthLabel}\n\nเดือนนี้ยังไม่มีรายการ`, hasData: false, usedAi: false };
	}

	let insight = null;
	let quotaExhausted = false;
	if (config.llm.provider !== 'none') {
		const fingerprint = fingerprintInput(input);
		insight = (await getCachedInsight(userId, input.month, fingerprint))?.insight ?? null;
		if (!insight) {
			const shouldClaim = options.claimQuota !== false;
			const claimed = !shouldClaim || await claimLlmCall(userId, INSIGHT_DAILY_LIMIT, now, 'insights');
			if (claimed) {
				insight = await generateInsight(input, userId);
				if (insight) {
					try {
						await saveInsight(userId, input.month, fingerprint, insight, config.llm.insightModel);
					} catch (error) {
						console.error('[monthly-summary] could not cache analysis:', error);
					}
				} else if (shouldClaim) {
					await releaseLlmCall(userId, now, 'insights');
				}
			} else quotaExhausted = true;
		}
	}

	return {
		text: formatMonthlyLineSummary(input, insight, quotaExhausted),
		hasData: true,
		usedAi: Boolean(insight)
	};
}

export function formatMonthlyLineSummary(
	input: InsightInput,
	insight: { headline: string; summary: string; observations: string[]; savings: Array<{ title: string; detail: string; monthlySaving: number }> } | null,
	quotaExhausted = false
): string {
	const deferred = input.creditCardSpent + input.payLaterSpent;
	const lines = [
		`🗓 สรุป${input.monthLabel}`,
		'',
		`รายรับ ${money(input.income)} · รายจ่ายรวม ${money(input.expense)}`,
		`คงเหลือ ${money(input.net)}`,
		'',
		`🍽 เงินใช้ชีวิต ${money(input.regularExpense)} · เฉลี่ย ${money(input.regularDailyAverage)}/วัน`,
		`• อาหาร ${money(input.foodExpense)} · ${money(input.foodDailyAverage)}/วัน`,
		`• เดินทาง ${money(input.transportExpense)} · ${money(input.transportDailyAverage)}/วัน`,
		`• อื่นๆ ${money(input.otherExpense)} · ${money(input.otherDailyAverage)}/วัน`,
		`🏠 ค่าเช่าและบิลที่จ่ายแล้ว ${money(input.fixedExpense)}`,
		`📌 ภาระเดือนหน้า ${money(input.nextMonthBills)}`
	];
	if (deferred > 0) lines.push(`ในนั้นมาจากบัตร/PayLater เดือนนี้ ${money(deferred)}`);
	if (insight) {
		lines.push('', `🤖 ${insight.headline}`, insight.summary);
		for (const observation of insight.observations.slice(0, 3)) lines.push(`• ${observation}`);
		for (const idea of insight.savings.slice(0, 2)) {
			lines.push(`💡 ${idea.title}${idea.monthlySaving > 0 ? ` · ลดได้ราว ${money(idea.monthlySaving)}` : ''}`);
		}
	} else if (quotaExhausted) {
		lines.push('', `AI วันนี้ใช้ครบ ${INSIGHT_DAILY_LIMIT} ครั้งแล้ว ตัวเลขสรุปยังใช้ได้ตามปกติ`);
	}
	return lines.join('\n');
}

function money(value: number): string {
	return `${formatNumber(value)} บาท`;
}
