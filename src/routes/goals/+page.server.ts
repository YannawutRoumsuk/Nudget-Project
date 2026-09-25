import { fail } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { monthlyGoalReserve } from '$lib/savings-goals';
import { addSavingsGoalContribution, createSavingsGoal, listGoalContributions, listSavingsGoals, setSavingsGoalStatus, updateSavingsGoal } from '$lib/server/db/savings-goals';
import type { Actions, PageServerLoad } from './$types';

const MAX_AMOUNT = 1_000_000_000;
function amount(form: FormData, key: string, fallback?: number): number {
	const raw = form.get(key);
	return raw === null && fallback !== undefined ? fallback : Number(raw);
}
function validDate(value: string): Date | null | undefined {
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const date = new Date(`${value}T12:00:00.000Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}
function fields(form: FormData) {
	const name = String(form.get('name') ?? '').trim().slice(0, 80);
	const goalType = String(form.get('goalType') ?? 'planned');
	const targetAmount = amount(form, 'targetAmount');
	const currentAmount = amount(form, 'currentAmount', 0);
	const monthlyContribution = amount(form, 'monthlyContribution', 0);
	const priority = amount(form, 'priority', 3);
	const targetDate = validDate(String(form.get('targetDate') ?? ''));
	if (!name || !['emergency', 'planned'].includes(goalType) || !Number.isFinite(targetAmount) || targetAmount <= 0 || targetAmount > MAX_AMOUNT ||
		!Number.isFinite(currentAmount) || currentAmount < 0 || currentAmount > targetAmount ||
		!Number.isFinite(monthlyContribution) || monthlyContribution < 0 || monthlyContribution > MAX_AMOUNT ||
		!Number.isInteger(priority) || priority < 1 || priority > 5 || targetDate === undefined) return null;
	return { name, goalType: goalType as 'emergency' | 'planned', targetAmount: targetAmount.toFixed(2), currentAmount: currentAmount.toFixed(2), targetDate,
		monthlyContribution: monthlyContribution.toFixed(2), priority };
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUserId(locals);
	const [goals, contributions] = await Promise.all([listSavingsGoals(userId), listGoalContributions(userId)]);
	return { goals: goals.map((goal) => {
		const normalized = { ...goal, targetAmount: Number(goal.targetAmount), currentAmount: Number(goal.currentAmount), monthlyContribution: Number(goal.monthlyContribution) };
		return { ...normalized, monthlyReserve: goal.status === 'active' ? monthlyGoalReserve(normalized) : 0 };
	}), contributions };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const value = fields(await request.formData());
		if (!value) return fail(400, { message: 'ตรวจชื่อ ยอดเป้าหมาย ยอดปัจจุบัน วันเป้าหมาย และความสำคัญอีกครั้ง' });
		await createSavingsGoal({ userId, ...value });
		return { message: 'เพิ่มเป้าหมายแล้ว' };
	},
	update: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const value = fields(form);
		const id = Number(form.get('id'));
		if (!value || !Number.isInteger(id) || id < 1) {
			return fail(400, { message: 'ตรวจข้อมูลเป้าหมายอีกครั้ง โดยยอดเป้าหมายต้องไม่น้อยกว่ายอดที่เก็บแล้ว' });
		}
		const [updated] = await updateSavingsGoal(userId, id, { name: value.name, goalType: value.goalType, targetAmount: value.targetAmount,
			targetDate: value.targetDate, monthlyContribution: value.monthlyContribution, priority: value.priority });
		return updated ? { message: 'บันทึกการแก้ไขแล้ว' } : fail(404, { message: 'เป้าหมายนี้แก้ไขไม่ได้หรือไม่พบข้อมูล' });
	},
	status: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const status = String(form.get('status'));
		if (!Number.isInteger(id) || id < 1 || !['active', 'paused', 'closed'].includes(status)) return fail(400, { message: 'ข้อมูลสถานะไม่ถูกต้อง' });
		const [updated] = await setSavingsGoalStatus(userId, id, status as 'active' | 'paused' | 'closed');
		return updated ? { message: status === 'active' ? 'เปิดเป้าหมายต่อแล้ว' : status === 'paused' ? 'พักเป้าหมายแล้ว' : 'ปิดเป้าหมายแล้ว' } : fail(404, { message: 'ไม่พบเป้าหมายนี้' });
	},
	contribute: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const value = Number(form.get('amount'));
		if (!Number.isInteger(id) || id < 1 || !Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return fail(400, { message: 'ยอดเติมเงินไม่ถูกต้อง' });
		const saved = await addSavingsGoalContribution(userId, id, value.toFixed(2));
		return saved ? { message: 'บันทึกเงินเข้าเป้าหมายแล้ว ไม่ได้นับเป็นรายจ่าย' } : fail(400, { message: 'ไม่พบเป้าหมายที่กำลังดำเนินการ หรือยอดใหม่เกินเป้าหมาย' });
	}
};
