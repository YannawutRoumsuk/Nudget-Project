import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { ALL_CATEGORIES, EXPENSE_CATEGORIES } from '$lib/categories';
import { billDueDate } from '$lib/bills';
import { assertSelectableMonth, resolveMonthSelection } from '$lib/month';
import type { WhatIfChange } from '$lib/what-if';
import { requireUserId } from '$lib/server/auth';
import { listBills } from '$lib/server/db/bills';
import { getMonthClosure, previousMonthKey } from '$lib/server/db/month-close';
import { applyWhatIfPlan, getWhatIfScenario, listWhatIfScenarios, saveWhatIfScenario, deleteWhatIfScenario } from '$lib/server/db/scenarios';
import { getMonthlyCategoryBudgets, getMonthlyPlan } from '$lib/server/db/plans';
import { getByCategory, getPaymentMethodTotal, getTotals } from '$lib/server/db/queries';
import { bangkokMonthKey, bangkokParts } from '$lib/utils/date';
import { toNumber } from '$lib/utils/money';
import { calculateWhatIf } from '$lib/what-if';
import type { Actions, PageServerLoad } from './$types';

const Change = z.discriminatedUnion('type', [
	z.object({ id: z.string().uuid(), type: z.literal('transaction'), kind: z.enum(['expense', 'income']), amount: z.number().positive().max(1_000_000_000), categoryId: z.string().min(1), note: z.string().max(120) }),
	z.object({ id: z.string().uuid(), type: z.literal('savings'), amount: z.number().min(0).max(1_000_000_000) }),
	z.object({ id: z.string().uuid(), type: z.literal('categoryBudget'), categoryId: z.string().min(1), amount: z.number().positive().max(1_000_000_000) }),
	z.object({ id: z.string().uuid(), type: z.literal('postponeBill'), billId: z.number().int().positive(), days: z.number().int().min(1).max(31) })
]);
const Changes = z.array(Change).max(20);
type ChangeInput = z.infer<typeof Change>;

async function loadInputs(userId: number, month: ReturnType<typeof resolveMonthSelection>) {
	const range = { from: month.from, to: month.to };
	const [plan, totals, slices, bills, creditCardSpent, payLaterSpent, budgetRows, previousClosure] = await Promise.all([
		getMonthlyPlan(userId, month.key), getTotals(userId, range), getByCategory(userId, range, 'expense'),
		listBills(userId, month.from), getPaymentMethodTotal(userId, range, 'credit_card'),
		getPaymentMethodTotal(userId, range, 'shopee_paylater'), getMonthlyCategoryBudgets(userId, month.key),
		getMonthClosure(userId, previousMonthKey(month.key))
	]);
	const dueThisMonth = bills.filter((bill) => {
		const due = billDueDate(bill, month.from);
		return !bill.paid && due && bangkokMonthKey(due) <= month.key;
	});
	const unpaidBills = dueThisMonth.filter((bill) => !bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidCardBills = dueThisMonth.filter((bill) => bill.noExpenseOnPay).reduce((sum, bill) => sum + bill.amount, 0);
	const unpaidByCategory = new Map<string, number>();
	for (const bill of dueThisMonth.filter((item) => !item.noExpenseOnPay)) unpaidByCategory.set(bill.categoryId, (unpaidByCategory.get(bill.categoryId) ?? 0) + bill.amount);
	const budgets = new Map(budgetRows.map((row) => [row.categoryId, toNumber(row.amount)]));
	const spent = new Map(slices.map((row) => [row.categoryId, row.total]));
	const storedPlanValues = {
		expectedIncome: toNumber(plan?.expectedIncome ?? 0), savingsGoal: toNumber(plan?.savingsGoal ?? 0),
		foodDailyBudget: toNumber(plan?.foodDailyBudget ?? 0), commuteDailyBudget: toNumber(plan?.commuteDailyBudget ?? 0), commuteDays: plan?.commuteDays ?? 0
	};
	const carryoverAmount = toNumber(previousClosure?.carryoverAmount ?? 0);
	const carryoverSavings = previousClosure?.carryoverMode === 'savings' ? carryoverAmount : 0;
	const planValues = {
		...storedPlanValues,
		expectedIncome: storedPlanValues.expectedIncome,
		savingsGoal: storedPlanValues.savingsGoal
	};
	const currentDay = month.isCurrent ? bangkokParts(new Date()).day : month.daysInMonth;
	const foodSpent = spent.get('food') ?? 0;
	const inputs = {
		budget: {
			...planValues,
			expectedIncome: planValues.expectedIncome + (previousClosure?.carryoverMode === 'spendable' ? carryoverAmount : 0),
			savingsGoal: planValues.savingsGoal + carryoverSavings,
			expense: totals.expense,
			cashExpense: Math.max(0, totals.expense - creditCardSpent - payLaterSpent),
			unpaidBills, unpaidCardBills, foodSpent, commuteSpent: spent.get('transport') ?? 0,
			currentDay, daysInMonth: month.daysInMonth
		},
		savingsCarryover: carryoverSavings,
		categoryBudgets: EXPENSE_CATEGORIES.map((category) => ({
			categoryId: category.id, budget: budgets.get(category.id) ?? 0,
			spent: (spent.get(category.id) ?? 0) + (unpaidByCategory.get(category.id) ?? 0)
		})),
		bills: dueThisMonth.flatMap((bill) => {
			const dueDate = billDueDate(bill, month.from);
			return dueDate ? [{ id: bill.id, amount: bill.amount, categoryId: bill.categoryId, noExpenseOnPay: bill.noExpenseOnPay, dueDate }] : [];
		})
	};
	return { inputs, planValues, carryoverSavings, budgetRows, dueThisMonth };
}

function parseChanges(raw: FormDataEntryValue | null): WhatIfChange[] | null {
	if (typeof raw !== 'string') return null;
	try {
		const result = Changes.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch { return null; }
}

function validCategory(change: WhatIfChange): boolean {
	if (change.type === 'transaction') return ALL_CATEGORIES.some((category) => category.id === change.categoryId && category.kind === change.kind);
	if (change.type === 'categoryBudget') return EXPENSE_CATEGORIES.some((category) => category.id === change.categoryId);
	return true;
}

function compute(inputs: Awaited<ReturnType<typeof loadInputs>>['inputs'], changes: WhatIfChange[], month: ReturnType<typeof resolveMonthSelection>) {
	const currentDay = month.isCurrent ? bangkokParts(new Date()).day : month.daysInMonth;
	return calculateWhatIf(inputs, changes, currentDay, month.daysInMonth);
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = requireUserId(locals);
	const month = resolveMonthSelection(url.searchParams.get('month'), new Date());
	const draftId = Number(url.searchParams.get('draft'));
	const [loaded, saved, rawDraft] = await Promise.all([
		loadInputs(userId, month), listWhatIfScenarios(userId, month.key),
		Number.isInteger(draftId) && draftId > 0 ? getWhatIfScenario(draftId, userId) : Promise.resolve(null)
	]);
	const draft = rawDraft?.month === month.key ? rawDraft : null;
	const changes = draft ? parseChanges(JSON.stringify(draft.changes)) ?? [] : [];
	return {
		month, ...loaded, saved, draft, changes, categories: ALL_CATEGORIES,
		result: changes.length ? compute(loaded.inputs, changes, month) : null,
		applied: Number(url.searchParams.get('applied') ?? 0)
	};
};

export const actions: Actions = {
	addTransaction: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const changes = parseChanges(form.get('changes'));
		const kind = String(form.get('kind'));
		const categoryId = String(form.get('categoryId'));
		const amount = Number(form.get('amount'));
		const note = String(form.get('note') ?? '').trim();
		if (!changes || changes.length >= 20 || !['expense', 'income'].includes(kind) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || !ALL_CATEGORIES.some((item) => item.id === categoryId && item.kind === kind) || note.length > 120) {
			return fail(400, { message: 'ตรวจประเภท ยอดเงิน หมวด และรายละเอียดอีกครั้ง', changes });
		}
		const next: WhatIfChange[] = [...changes, { id: crypto.randomUUID(), type: 'transaction', kind: kind as 'expense' | 'income', amount, categoryId, note }];
		return actionState(userId, url, next);
	},
	addSavings: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const changes = parseChanges(form.get('changes'));
		const amount = Number(form.get('amount'));
		if (!changes || changes.length >= 20 || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return fail(400, { message: 'ยอดเป้าหมายออมหรือจำนวนสมมติฐานไม่ถูกต้อง', changes: changes ?? [] });
		return actionState(userId, url, [...changes, { id: crypto.randomUUID(), type: 'savings', amount }]);
	},
	addBudget: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const changes = parseChanges(form.get('changes'));
		const categoryId = String(form.get('categoryId'));
		const amount = Number(form.get('amount'));
		if (!changes || changes.length >= 20 || !EXPENSE_CATEGORIES.some((item) => item.id === categoryId) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return fail(400, { message: 'หมวด ยอดลดงบ หรือจำนวนสมมติฐานไม่ถูกต้อง', changes: changes ?? [] });
		return actionState(userId, url, [...changes, { id: crypto.randomUUID(), type: 'categoryBudget', categoryId, amount }]);
	},
	addPostpone: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const changes = parseChanges(form.get('changes'));
		const billId = Number(form.get('billId'));
		const days = Number(form.get('days'));
		const month = resolveMonthSelection(url.searchParams.get('month'), new Date());
		const { dueThisMonth } = await loadInputs(userId, month);
		if (!changes || changes.length >= 20 || !Number.isInteger(billId) || !dueThisMonth.some((bill) => bill.id === billId) || !Number.isInteger(days) || days < 1 || days > 31 || changes.some((change) => change.type === 'postponeBill' && change.billId === billId)) {
			return fail(400, { message: 'เลือกบิลค้างที่ยังไม่เลื่อน และระบุจำนวนวัน 1–31 วัน', changes: changes ?? [] });
		}
		return actionState(userId, url, [...changes, { id: crypto.randomUUID(), type: 'postponeBill', billId, days }]);
	},
	removeChange: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const changes = parseChanges(form.get('changes'));
		const id = String(form.get('changeId') ?? '');
		if (!changes || !changes.some((change) => change.id === id)) return fail(400, { message: 'ไม่พบสมมติฐานนี้', changes: changes ?? [] });
		return actionState(userId, url, changes.filter((change) => change.id !== id));
	},
	simulate: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const changes = parseChanges((await request.formData()).get('changes'));
		if (!changes || changes.some((change) => !validCategory(change))) return fail(400, { message: 'ข้อมูลสมมติฐานไม่ถูกต้อง', changes: changes ?? [] });
		return actionState(userId, url, changes);
	},
	saveDraft: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const month = String(form.get('month') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const changes = parseChanges(form.get('changes'));
		const draftId = form.get('draftId') ? Number(form.get('draftId')) : undefined;
		try { assertSelectableMonth(month); } catch { return fail(400, { message: 'เดือนไม่ถูกต้อง' }); }
		if (!name || name.length > 80 || !changes?.length || changes.some((change) => !validCategory(change)) || (draftId !== undefined && (!Number.isInteger(draftId) || draftId <= 0))) {
			return fail(400, { message: 'ตั้งชื่อฉบับร่างและตรวจสมมติฐานก่อนบันทึก (สูงสุด 20 ข้อ)', changes: changes ?? [] });
		}
		const saved = await saveWhatIfScenario(userId, month, name, changes, draftId);
		if (!saved) return fail(404, { message: 'ไม่พบฉบับร่างนี้ในบัญชีของคุณ' });
		redirect(303, `/what-if?month=${month}&draft=${saved.id}`);
	},
	deleteDraft: async ({ request, locals, url }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('draftId'));
		if (!Number.isInteger(id) || !await deleteWhatIfScenario(id, userId)) return fail(404, { message: 'ไม่พบฉบับร่างนี้ในบัญชีของคุณ' });
		const month = resolveMonthSelection(url.searchParams.get('month'), new Date());
		redirect(303, `/what-if?month=${month.key}`);
	},
	applySelected: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const draftId = Number(form.get('draftId'));
		const draft = Number.isInteger(draftId) && draftId > 0 ? await getWhatIfScenario(draftId, userId) : null;
		if (!draft) return fail(404, { message: 'บันทึกฉบับร่างก่อนนำไปใช้' });
		const changes = parseChanges(JSON.stringify(draft.changes));
		if (!changes) return fail(400, { message: 'ข้อมูลฉบับร่างไม่ถูกต้อง' });
		const selectedIds = new Set(form.getAll('applyId').map(String));
		const selected = changes.filter((change) => selectedIds.has(change.id) && change.type !== 'postponeBill');
		if (!selected.length) return fail(400, { message: 'เลือกอย่างน้อยหนึ่งส่วนที่จะนำไปใช้' });
		const [plan, budgetRows] = await Promise.all([getMonthlyPlan(userId, draft.month), getMonthlyCategoryBudgets(userId, draft.month)]);
		let expectedIncome = toNumber(plan?.expectedIncome ?? 0);
		let savingsGoal = toNumber(plan?.savingsGoal ?? 0);
		const budgetMap = new Map(budgetRows.map((row) => [row.categoryId, toNumber(row.amount)]));
		for (const change of selected) {
			if (change.type === 'transaction' && change.kind === 'income') expectedIncome += change.amount;
			else if (change.type === 'savings') savingsGoal = change.amount;
			else if (change.type === 'categoryBudget') budgetMap.set(change.categoryId, Math.max(0, (budgetMap.get(change.categoryId) ?? 0) - change.amount));
			else if (change.type === 'transaction' && change.kind === 'expense') budgetMap.set(change.categoryId, (budgetMap.get(change.categoryId) ?? 0) + change.amount);
		}
		await applyWhatIfPlan({
			userId, month: draft.month, expectedIncome: expectedIncome.toFixed(2), expectedIncomeDay: plan?.expectedIncomeDay ?? 1,
			savingsGoal: savingsGoal.toFixed(2), foodDailyBudget: plan?.foodDailyBudget ?? '0', commuteDailyBudget: plan?.commuteDailyBudget ?? '0',
			commuteDays: plan?.commuteDays ?? 0, budgetAlertsEnabled: plan?.budgetAlertsEnabled ?? true
		}, selected.some((change) => change.type === 'categoryBudget' || (change.type === 'transaction' && change.kind === 'expense'))
			? EXPENSE_CATEGORIES.map((category) => ({ categoryId: category.id, amount: (budgetMap.get(category.id) ?? 0).toFixed(2) }))
			: undefined);
		redirect(303, `/what-if?month=${draft.month}&draft=${draft.id}&applied=${selected.length}`);
	}
};

async function actionState(userId: number, url: URL, changes: WhatIfChange[]) {
	const month = resolveMonthSelection(url.searchParams.get('month'), new Date());
	const { inputs } = await loadInputs(userId, month);
	return { changes, result: compute(inputs, changes, month), message: null };
}
