<script lang="ts">
	import { EXPENSE_CATEGORIES, getCategory } from '$lib/categories';
	import { billDueDate } from '$lib/bills';
	import { bangkokDayKey, formatThaiShortDate } from '$lib/utils/date';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const methods = [{id:'bank',label:'โอน/บัญชี'},{id:'cash',label:'เงินสด'},{id:'credit_card',label:'บัตรเครดิต'},{id:'wallet',label:'วอลเล็ต'}];
</script>
<svelte:head><title>บิล · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">รายการที่ต้องจ่าย</p><h1>บิลและค่าใช้จ่ายล่วงหน้า</h1><p>รองรับทั้งรายเดือน จ่ายครั้งเดียว และยอดบัตรเครดิต</p></div></section>
{#if form?.message}<p class="notice">{form.message}</p>{/if}
<details class="card add" open={data.bills.length === 0}>
	<summary>＋ เพิ่มบิล</summary>
	<form method="POST" action="?/create" class="bill-form">
		<label>ชื่อบิล<input name="name" placeholder="เช่น ค่าเน็ต หรือบัตรเครดิต" required /></label>
		<label>ยอด<input name="amount" type="number" min="0.01" step="0.01" required /></label>
		<label>หมวด<select name="categoryId">{#each EXPENSE_CATEGORIES as c}<option value={c.id} selected={c.id === 'bills'}>{c.icon} {c.nameTh}</option>{/each}</select></label>
		<label>วิธีจ่าย<select name="paymentMethod">{#each methods as m}<option value={m.id}>{m.label}</option>{/each}</select></label>
		<label>รูปแบบ<select name="recurrence"><option value="monthly">ทุกเดือน</option><option value="once">ครั้งเดียว</option></select></label>
		<label>วันที่จ่ายทุกเดือน<input name="dueDay" type="number" min="1" max="31" value="1" /></label>
		<label>หรือวันที่จ่ายครั้งเดียว<input name="dueDate" type="date" /></label>
		<input type="hidden" name="active" value="true" /><button type="submit">เพิ่มบิล</button>
	</form>
</details>

<section class="bill-list">
	{#each data.bills as bill (bill.id)}
		{@const due = billDueDate(bill, new Date())}
		<article class="card bill" class:inactive={!bill.active}>
			<header><div><span>{getCategory(bill.categoryId)?.icon}</span><h2>{bill.name}</h2></div><strong class="num">฿{formatNumber(bill.amount)}</strong></header>
			<p class="due">{bill.recurrence === 'monthly' ? 'ทุกเดือน' : 'ครั้งเดียว'} · {due ? `ครบ ${formatThaiShortDate(due)}` : 'ยังไม่กำหนดวัน'} · {methods.find((m)=>m.id===bill.paymentMethod)?.label}</p>
			<form method="POST" action={bill.paid ? '?/unpaid' : '?/paid'} class="paid-form"><input type="hidden" name="id" value={bill.id} /><button class:done={bill.paid} type="submit">{bill.paid ? '✓ จ่ายแล้ว — กดเพื่อย้อนกลับ' : 'ทำเครื่องหมายว่าจ่ายแล้ว'}</button></form>
			<details><summary>แก้ไข</summary><form method="POST" action="?/update" class="bill-form compact">
				<input type="hidden" name="id" value={bill.id} />
				<label>ชื่อ<input name="name" value={bill.name} required /></label><label>ยอด<input name="amount" type="number" min="0.01" step="0.01" value={bill.amount} required /></label>
				<label>หมวด<select name="categoryId">{#each EXPENSE_CATEGORIES as c}<option value={c.id} selected={c.id===bill.categoryId}>{c.icon} {c.nameTh}</option>{/each}</select></label>
				<label>วิธีจ่าย<select name="paymentMethod">{#each methods as m}<option value={m.id} selected={m.id===bill.paymentMethod}>{m.label}</option>{/each}</select></label>
				<label>รูปแบบ<select name="recurrence"><option value="monthly" selected={bill.recurrence==='monthly'}>ทุกเดือน</option><option value="once" selected={bill.recurrence==='once'}>ครั้งเดียว</option></select></label>
				<label>วันที่ทุกเดือน<input name="dueDay" type="number" min="1" max="31" value={bill.dueDay ?? 1} /></label>
				<label>วันที่ครั้งเดียว<input name="dueDate" type="date" value={bill.dueDate ? bangkokDayKey(bill.dueDate) : ''} /></label>
				<label class="check"><input name="active" type="checkbox" checked={bill.active} /> ใช้งานอยู่</label><button type="submit">บันทึก</button>
			</form></details>
		</article>
	{/each}
	{#if data.bills.length === 0}<p class="empty">ยังไม่มีบิล เพิ่มรายการแรกด้านบนได้เลย</p>{/if}
</section>
<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.due{color:var(--ink-muted)}.notice{margin-bottom:1rem;color:var(--out)}
	.add{padding:1rem;margin-bottom:var(--stack-lg)}summary{cursor:pointer;font-weight:600}.bill-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}.bill-form label{display:grid;gap:.25rem;font-size:var(--text-xs);font-weight:600}.bill-form input,.bill-form select{min-width:0;padding:.55rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}button{padding:.6rem .85rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}.bill-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.bill{padding:1rem}.bill.inactive{opacity:.55}.bill header{display:flex;justify-content:space-between;gap:1rem}.bill header div{display:flex;align-items:center;gap:.5rem}.bill h2{font-size:1.1rem}.due{margin:.35rem 0 .8rem;font-size:var(--text-sm)}.paid-form button{width:100%;background:var(--accent)}.paid-form button.done{background:var(--in)}.bill details{margin-top:.7rem}.compact{grid-template-columns:repeat(2,minmax(0,1fr))}.check{display:flex!important;align-items:center;flex-direction:row}.check input{width:auto}.empty{color:var(--ink-faint)}
	@media(max-width:800px){.bill-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.bill-list,.bill-form,.compact{grid-template-columns:1fr}}
</style>
