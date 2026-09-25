<script lang="ts">
	import { EXPENSE_CATEGORIES } from '$lib/categories';
	import { billDueDate } from '$lib/bills';
	import { addMonths, bangkokDayKey, formatThaiShortDate } from '$lib/utils/date';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const now = new Date();
	const METHOD_TEXT = (card: { name: string }) => card.name;
	const today = new Date();
	const dueDateValue = bangkokDayKey(today);
	const firstDueDateValue = bangkokDayKey(addMonths(today, 1));

	function openStatements(cardId: number) {
		const groups = new Map<string, { date: Date; total: number; count: number }>();
		for (const bill of data.bills.filter((item) => item.creditCardId === cardId && item.noExpenseOnPay && !item.paid)) {
			const date = billDueDate(bill, now);
			if (!date) continue;
			const key = date.toISOString().slice(0, 10);
			const group = groups.get(key) ?? { date, total: 0, count: 0 };
			group.total += bill.amount;
			group.count += 1;
			groups.set(key, group);
		}
		return [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
	}
</script>

<svelte:head><title>บัตรเครดิต · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">ยอดใช้วันนี้ · ภาระชำระข้างหน้า</p>
	<h1>บัตรเครดิตและรายการผ่อน</h1>
	<p class="lede">การซื้อยังนับเป็นรายจ่ายในวันที่ซื้อ ส่วนยอดชำระบัตรเป็นภาระที่ติดตามแยก ไม่ถูกนับซ้ำเป็นรายจ่าย</p>
</section>

{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="cards">
	{#each data.cards.filter((card) => card.active) as card (card.id)}
		{@const statements = openStatements(card.id)}
		<article class="card account">
			<header><div><p class="eyebrow">{card.isDefault ? 'บัตรหลัก' : 'บัญชีบัตร'}</p><h2>{METHOD_TEXT(card)}</h2></div><strong>ตัดรอบวันที่ {card.closingDay}</strong></header>
			<div class="cycle"><span>ยอดใช้ในรอบนี้</span><strong class="num">฿{formatNumber(data.cycleSpend[card.id] ?? 0)}</strong></div>
			<p class="muted">ครบกำหนดชำระทุกวันที่ {card.dueDay}{card.creditLimit ? ` · วงเงิน ฿${formatNumber(Number(card.creditLimit))}` : ''}</p>
			{#if statements.length}
				<div class="statements">
					<h3>ยอดรอชำระตามรอบ</h3>
					{#each statements as statement (statement.date.toISOString())}
						<p><span>ครบ {formatThaiShortDate(statement.date)} · {statement.count} รายการ</span><strong class="num">฿{formatNumber(statement.total)}</strong></p>
					{/each}
				</div>
			{:else}<p class="muted">ยังไม่มียอดในรอบที่รอชำระ</p>{/if}
			<details>
				<summary>แก้ไขข้อมูลบัตร</summary>
				<form method="POST" action="?/saveCard" class="form-grid">
					<input type="hidden" name="id" value={card.id} />
					<label>ชื่อบัตร<input name="name" value={card.name} maxlength="80" required /></label>
					<label>วันตัดรอบ<input name="closingDay" type="number" min="1" max="31" value={card.closingDay} required /></label>
					<label>วันครบกำหนด<input name="dueDay" type="number" min="1" max="31" value={card.dueDay} required /></label>
					<label>วงเงิน (ไม่บังคับ)<input name="creditLimit" type="number" min="0.01" step="0.01" value={card.creditLimit ?? ''} /></label>
					<label class="check"><input name="isDefault" type="checkbox" checked={card.isDefault} /> ใช้เป็นบัตรหลักสำหรับรายการที่พิมพ์ผ่าน LINE</label>
					<button type="submit">บันทึกบัตร</button>
				</form>
				<form method="POST" action="?/deactivateCard" onsubmit={(event) => !confirm('ปิดการใช้งานบัตรนี้หรือไม่? รายการเก่าจะยังเก็บไว้') && event.preventDefault()}>
					<input type="hidden" name="id" value={card.id} /><button class="quiet" type="submit">ปิดบัตร</button>
				</form>
			</details>
		</article>
	{/each}
</section>

<details class="card panel" open={data.cards.filter((card) => card.active).length === 0}>
	<summary>＋ เพิ่มบัตรเครดิต</summary>
	<p class="muted">เก็บเฉพาะชื่อบัตรและวันตัดรอบ/ครบกำหนด ไม่ต้องกรอกเลขบัตร</p>
	<form method="POST" action="?/saveCard" class="form-grid">
		<label>ชื่อบัตร<input name="name" placeholder="เช่น บัตรธนาคารหลัก" maxlength="80" required /></label>
		<label>วันตัดรอบ<input name="closingDay" type="number" min="1" max="31" placeholder="25" required /></label>
		<label>วันครบกำหนด<input name="dueDay" type="number" min="1" max="31" placeholder="15" required /></label>
		<label>วงเงิน (ไม่บังคับ)<input name="creditLimit" type="number" min="0.01" step="0.01" /></label>
		<label class="check"><input name="isDefault" type="checkbox" /> ใช้เป็นบัตรหลักสำหรับรายการที่พิมพ์ผ่าน LINE</label>
		<button type="submit">เพิ่มบัตร</button>
	</form>
</details>

{#if data.cards.some((card) => card.active)}
	<details class="card panel">
		<summary>＋ บันทึกรายการผ่อน</summary>
		<p class="muted">ระบบบันทึกยอดซื้อเต็มจำนวนวันนี้ และสร้างบิลผ่อนรายเดือนที่ไม่ถูกนับเป็นรายจ่ายซ้ำเมื่อจ่ายแล้ว</p>
		<form method="POST" action="?/createInstallment" class="form-grid">
			<label>บัตร<select name="creditCardId" required>{#each data.cards.filter((card) => card.active) as card}<option value={card.id}>{card.name}</option>{/each}</select></label>
			<label>ชื่อรายการ<input name="name" maxlength="120" required /></label>
			<label>หมวด<select name="categoryId">{#each EXPENSE_CATEGORIES as category}<option value={category.id}>{category.icon} {category.nameTh}</option>{/each}</select></label>
			<label>ยอดซื้อรวม<input name="totalAmount" type="number" min="0.01" step="0.01" required /></label>
			<label>จำนวนงวด<input name="installmentCount" type="number" min="2" max="60" value="6" required /></label>
			<label>วันที่ซื้อ<input name="purchaseDate" type="date" value={dueDateValue} required /></label>
			<label>วันครบกำหนดงวดแรก<input name="firstDueDate" type="date" value={firstDueDateValue} required /></label>
			<button type="submit">บันทึกรายการผ่อน</button>
		</form>
	</details>
{/if}

{#if data.installments.length}
	<section class="card panel">
		<h2>รายการผ่อน</h2>
		<div class="plans">
			{#each data.installments as plan (plan.id)}
				<p><span>{plan.name}<small>{data.cards.find((card) => card.id === plan.creditCardId)?.name ?? 'ปิดบัตรแล้ว'} · จ่ายแล้ว {plan.paidInstallments}/{plan.totalInstallments} งวด</small></span><strong class="num">฿{formatNumber(plan.remainingAmount)}</strong></p>
			{/each}
		</div>
	</section>
{/if}

{#if data.cards.some((card) => !card.active)}
	<details class="muted"><summary>ดูบัตรที่ปิดแล้ว</summary>{#each data.cards.filter((card) => !card.active) as card}<p>{card.name} · ตัดรอบ {card.closingDay} · ครบกำหนด {card.dueDay}</p>{/each}</details>
{/if}

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}h2{font-size:1.15rem}.lede,.muted{color:var(--ink-muted)}
	.notice{padding:.65rem .9rem;margin-bottom:var(--stack);background:var(--in-soft);border-radius:var(--radius)}
	.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:var(--stack)}.account,.panel{padding:1rem}
	.account header{display:flex;align-items:center;justify-content:space-between;gap:1rem}.account header strong{font-size:var(--text-sm);color:var(--ink-muted)}
	.cycle{display:flex;justify-content:space-between;align-items:baseline;padding:1rem 0 .45rem}.cycle strong{font-size:1.35rem}.account p{margin:.3rem 0}
	.statements{margin-top:.9rem;border-top:1px solid var(--rule);padding-top:.7rem}.statements h3{font-size:var(--text-sm);margin-bottom:.35rem}.statements p,.plans p{display:flex;justify-content:space-between;gap:.8rem;padding:.4rem 0;border-bottom:1px solid var(--rule)}
	details{margin-top:.8rem}summary{cursor:pointer;font-weight:600}.panel{margin-bottom:var(--stack)}.panel>summary{padding-bottom:.5rem}
	.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin-top:.7rem}.form-grid label{display:grid;gap:.3rem;font-size:var(--text-sm);font-weight:600}.form-grid input,.form-grid select{width:100%;padding:.65rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}
	.form-grid .check{display:flex;align-items:center;gap:.5rem;font-weight:500}.form-grid .check input{width:auto}.form-grid button,.quiet{justify-self:start;padding:.6rem .9rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);font:inherit;cursor:pointer}.quiet{margin-top:.6rem;background:transparent;color:var(--out);border:1px solid var(--rule-strong)}
	.plans small{display:block;color:var(--ink-muted);font-size:var(--text-sm)}
	@media(max-width:700px){.cards{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}}
</style>
