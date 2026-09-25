export interface HealthBudget {
	budget: number;
	spent: number;
}

export interface FinancialHealthInput {
	income: number | null;
	expense: number | null;
	budgets: HealthBudget[] | null;
	monthlyBills: number | null;
	emergencyBalance: number | null;
	averageMonthlyExpense: number | null;
	recordedDays: number | null;
	elapsedDays: number;
}

export interface HealthFactor {
	id: 'savings' | 'budget' | 'bills' | 'reserve' | 'recording';
	label: string;
	weight: number;
	score: number | null;
	reason: string;
	href: string;
}

const FACTORS = [
	{ id: 'savings', label: 'อัตราเงินเหลือ', weight: 25, href: '/transactions' },
	{ id: 'budget', label: 'การคุมงบ', weight: 25, href: '/plan' },
	{ id: 'bills', label: 'ภาระบิล', weight: 20, href: '/bills' },
	{ id: 'reserve', label: 'เงินสำรองฉุกเฉิน', weight: 20, href: '/goals' },
	{ id: 'recording', label: 'ความสม่ำเสมอในการจด', weight: 10, href: '/transactions' }
] as const;

/** A deterministic tracker score, explicitly not a credit score or financial grade. */
export function calculateFinancialHealth(input: FinancialHealthInput) {
	const factors: HealthFactor[] = FACTORS.map((factor) => {
		let score: number | null = null;
		let reason: string;
		switch (factor.id) {
			case 'savings': {
				if (input.income !== null && input.income > 0 && input.expense !== null) {
					const rate = (input.income - input.expense) / input.income;
					score = clamp(rate / 0.2 * 100);
					reason = `รายรับ ฿${money(input.income)} − รายจ่าย ฿${money(input.expense)} · เหลือ ${percent(rate * 100)}% (เต็มคะแนนเมื่อเหลืออย่างน้อย 20%)`;
				} else reason = 'ยังไม่มีข้อมูลรายรับและรายจ่ายพอคำนวณ';
				break;
			}
			case 'budget': {
				const rows = input.budgets?.filter((row) => row.budget > 0) ?? [];
				if (rows.length) {
					const budget = rows.reduce((sum, row) => sum + row.budget, 0);
					const over = rows.reduce((sum, row) => sum + Math.max(0, row.spent - row.budget), 0);
					score = clamp(100 - over / budget * 150);
					reason = over > 0 ? `เกินงบที่ตั้งรวม ฿${money(over)} จากงบ ฿${money(budget)}` : `ยังไม่เกินงบที่ตั้งไว้ ${rows.length} หมวด`;
				} else reason = 'ยังไม่ได้ตั้งงบรายหมวด';
				break;
			}
			case 'bills': {
				if (input.monthlyBills !== null && input.income !== null && input.income > 0) {
					const burden = input.monthlyBills / input.income;
					score = clamp(100 - Math.max(0, burden - 0.15) / 0.35 * 100);
					reason = `บิลที่ทราบ ฿${money(input.monthlyBills)} คิดเป็น ${percent(burden * 100)}% ของรายรับ · ช่วงไม่เกิน 15% ได้คะแนนเต็ม`;
				} else reason = 'ยังไม่มีข้อมูลรายรับหรือบิลที่บันทึกไว้';
				break;
			}
			case 'reserve': {
				if (input.emergencyBalance !== null && input.averageMonthlyExpense !== null && input.averageMonthlyExpense > 0) {
					const months = input.emergencyBalance / input.averageMonthlyExpense;
					score = clamp(months / 3 * 100);
					reason = `เงินสำรอง ฿${money(input.emergencyBalance)} รองรับรายจ่ายเฉลี่ยได้ ${months.toFixed(1)} เดือน · เป้าหมายคือ 3 เดือน`;
				} else reason = 'กำหนดเป้าหมายประเภทเงินสำรองและมีรายจ่ายย้อนหลังอย่างน้อยหนึ่งเดือนเพื่อคำนวณ';
				break;
			}
			case 'recording': {
				if (input.recordedDays !== null && input.elapsedDays > 0) {
					const targetDays = Math.max(1, Math.ceil(input.elapsedDays / 7));
					score = clamp(input.recordedDays / targetDays * 100);
					reason = `จดรายการ ${input.recordedDays} วันใน ${input.elapsedDays} วันที่ผ่านไป · วัดจากการบันทึกอย่างน้อยสัปดาห์ละครั้ง`;
				} else reason = 'ยังไม่มีรายการให้วัดความสม่ำเสมอ';
				break;
			}
		}
		return { ...factor, score: score === null ? null : Math.round(score), reason };
	});
	const known = factors.filter((factor) => factor.score !== null);
	const totalWeight = known.reduce((sum, factor) => sum + factor.weight, 0);
	const score = totalWeight ? Math.round(known.reduce((sum, factor) => sum + factor.score! * factor.weight, 0) / totalWeight) : null;
	const recommendations = [...known]
		.filter((factor) => factor.score! < 75)
		.sort((a, b) => a.score! - b.score! || b.weight - a.weight)
		.slice(0, 3)
		.map((factor) => suggestion(factor.id));
	return { score, knownFactors: known.length, factors, recommendations };
}

function suggestion(id: HealthFactor['id']): { text: string; href: string } {
	switch (id) {
		case 'savings': return { text: 'ทบทวนรายจ่ายที่เลื่อนได้และปรับเป้าเงินออมให้เข้ากับรายรับ', href: '/plan' };
		case 'budget': return { text: 'ตรวจหมวดที่เกินงบ แล้วลดงบหรือปรับการใช้จ่ายเดือนนี้', href: '/plan' };
		case 'bills': return { text: 'ทบทวนบิลประจำและยกเลิกบริการที่ไม่ค่อยได้ใช้', href: '/bills' };
		case 'reserve': return { text: 'ตั้งหรือเพิ่มเงินเข้าเป้าหมายเงินสำรองฉุกเฉิน', href: '/goals' };
		case 'recording': return { text: 'บันทึกรายรับรายจ่ายให้สม่ำเสมอขึ้น เพื่อให้ภาพรวมเดือนนี้แม่นขึ้น', href: '/transactions' };
	}
}

function clamp(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function money(value: number): string {
	return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value);
}

function percent(value: number): string {
	return `${Math.round(value)}%`;
}
