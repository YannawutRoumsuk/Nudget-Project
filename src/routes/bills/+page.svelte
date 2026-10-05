<script lang="ts">
	import { page } from '$app/state';
	import BillForm from '$lib/components/BillForm.svelte';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { getCategory } from '$lib/categories';
	import { billDueDate } from '$lib/bills';
	import { formatThaiShortDate } from '$lib/utils/date';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const METHOD_LABELS: Record<string, string> = {
		bank: 'โอน/บัญชี',
		cash: 'เงินสด',
		credit_card: 'บัตรเครดิต',
		shopee_paylater: 'Shopee PayLater',
		wallet: 'วอลเล็ต'
	};

	function copyHref(id: number): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('copy', String(id));
		return `/bills?${params}#new-bill`;
	}

	function confirmDelete(event: SubmitEvent, name: string): void {
		if (!window.confirm(`ลบบิล “${name}” ใช่ไหม? ประวัติรายจ่ายที่บันทึกไว้จะยังอยู่`)) event.preventDefault();
	}
</script>

<svelte:head><title>บิล · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">รายการที่ต้องจ่าย</p>
	<h1>บิลและค่าใช้จ่ายล่วงหน้า</h1>
	<p class="lede">กรอกแค่ชื่อกับยอด แล้วเลือกว่าจ่ายทุกเดือนหรือครั้งเดียว</p>
</section>

<MonthNavigator month={data.month} />

{#if form?.message}<p class="notice">{form.message}</p>{/if}
{#if data.copyMissing}<p class="notice">ไม่พบบิลต้นฉบับในบัญชีนี้</p>{/if}

<details id="new-bill" class="card add" open={data.bills.length === 0 || Boolean(data.copy)}>
	<summary>{data.copy ? `คัดลอก “${data.copy.name}” เป็นบิลใหม่` : '＋ เพิ่มบิล'}</summary>
	<!-- A copy arrives without an id, so the form treats it as starting values
	     for a new bill rather than an edit of the one it came from. -->
	<BillForm
		action="?/create"
		submitLabel={data.copy ? 'สร้างบิลใหม่' : 'เพิ่มบิล'}
		bill={data.copy}
		month={data.month.key}
	/>
	{#if data.copy}<a class="cancel" href="/bills">ยกเลิกการคัดลอก</a>{/if}
</details>

{#snippet billCard(bill: PageData['bills'][number])}
	{@const due = billDueDate(bill, data.month.from)}
	<article class="card bill" class:inactive={!bill.active}>
		<header>
			<div>
				<span aria-hidden="true">{getCategory(bill.categoryId)?.icon}</span>
				<h2>{bill.name}</h2>
			</div>
			<div class="bill-heading-side">
				<strong class="num">฿{formatNumber(bill.amount)}</strong>
				<span class="status" class:paid={bill.paid}>{bill.paid ? 'จ่ายแล้ว' : 'รอจ่าย'}</span>
			</div>
		</header>
		<p class="due">
			{bill.recurrence === 'monthly' ? 'ทุกเดือน' : 'ครั้งเดียว'} · {due
				? `ครบ ${formatThaiShortDate(due)}`
				: 'ยังไม่กำหนดวัน'} · {METHOD_LABELS[bill.paymentMethod] ?? bill.paymentMethod}{bill.sourceTransactionId ? ' · สร้างอัตโนมัติ' : ''}
		</p>
		<div class="bill-actions">
			<form method="POST" action={bill.paid ? '?/unpaid' : '?/paid'} class="paid-form">
				<input type="hidden" name="id" value={bill.id} />
				<input type="hidden" name="month" value={data.month.key} />
				<button class:done={bill.paid} type="submit">
					{bill.paid ? '✓ จ่ายแล้ว — กดเพื่อย้อนกลับ' : 'ทำเครื่องหมายว่าจ่ายแล้ว'}
				</button>
			</form>
			<a class="copy" href={copyHref(bill.id)}>คัดลอก</a>
			<form method="POST" action="?/delete" class="delete-form" onsubmit={(event) => confirmDelete(event, bill.name)}>
				<input type="hidden" name="id" value={bill.id} />
				<input type="hidden" name="month" value={data.month.key} />
				<button type="submit">ลบบิล</button>
			</form>
		</div>
		<details>
			<summary>แก้ไข</summary>
			<BillForm action="?/update" submitLabel="บันทึก" {bill} month={data.month.key} />
		</details>
	</article>
{/snippet}

<section class="month-groups">
	{#each data.billGroups as group (group.key)}
		<section class="month-group" aria-labelledby={`month-${group.key}`}>
			<header class="month-heading">
				<div>
					<h2 id={`month-${group.key}`}>{group.label}</h2>
					<p>{group.unpaid.length} รอจ่าย · {group.paid.length} จ่ายแล้ว</p>
				</div>
			</header>
			{#if group.unpaid.length > 0}
				<section class="status-group" aria-label="รอจ่าย">
					<h3 class="status-title waiting">รอจ่าย <span>{group.unpaid.length}</span></h3>
					<div class="bill-list">{#each group.unpaid as bill (bill.id)}{@render billCard(bill)}{/each}</div>
				</section>
			{/if}
			{#if group.paid.length > 0}
				<section class="status-group" aria-label="จ่ายแล้ว">
					<h3 class="status-title completed">จ่ายแล้ว <span>{group.paid.length}</span></h3>
					<div class="bill-list">{#each group.paid as bill (bill.id)}{@render billCard(bill)}{/each}</div>
				</section>
			{/if}
		</section>
	{/each}
	{#if data.billGroups.length === 0}
		<p class="empty">ยังไม่มีบิล เพิ่มรายการแรกด้านบนได้เลย</p>
	{/if}
</section>

<style>
	.head {
		margin-bottom: var(--stack);
	}
	h1 {
		font-size: var(--text-xl);
	}
	.lede,
	.due {
		color: var(--ink-muted);
	}
	.month-groups {
		display: grid;
		gap: 1.6rem;
		margin-top: var(--stack-lg);
	}
	.month-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--rule-strong);
	}
	.month-heading h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.month-heading p {
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}
	.status-group {
		margin-top: 0.8rem;
	}
	.status-title {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0 0 0.5rem;
		font-size: var(--text-sm);
	}
	.status-title span {
		font-size: var(--text-xs);
		color: var(--ink-muted);
	}
	.status-title.waiting {
		color: var(--out);
	}
	.status-title.completed {
		color: var(--in);
	}
	.notice {
		margin-bottom: 1rem;
		color: var(--out);
	}
	.add {
		padding: 1rem;
		margin-bottom: var(--stack-lg);
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	.bill-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.bill {
		padding: 1rem;
	}
	.bill.inactive {
		opacity: 0.55;
	}
	.bill header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.bill header div {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.bill-heading-side {
		display: grid;
		justify-items: end;
		gap: 0.25rem;
	}
	.status {
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--out);
		background: var(--out-soft);
		white-space: nowrap;
	}
	.status.paid {
		color: var(--in);
		background: var(--in-soft);
	}
	.bill h2 {
		font-size: 1.1rem;
	}
	.due {
		margin: 0.35rem 0 0.8rem;
		font-size: var(--text-sm);
	}
	.bill-actions {
		display: flex;
		gap: 0.5rem;
	}
	.paid-form {
		flex: 1;
	}
	.cancel {
		display: inline-block;
		margin-top: 0.6rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
		text-decoration: underline;
	}
	.copy {
		display: grid;
		place-items: center;
		padding: 0.6rem 0.85rem;
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.copy:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.delete-form button {
		padding: 0.6rem 0.85rem;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		border: 1px solid var(--out);
		border-radius: var(--radius);
		background: transparent;
		color: var(--out);
		cursor: pointer;
	}
	.delete-form button:hover {
		background: var(--out);
		color: var(--paper-raised);
	}
	.paid-form button {
		width: 100%;
		padding: 0.6rem 0.85rem;
		font: inherit;
		font-weight: 600;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--paper-raised);
		cursor: pointer;
	}
	.paid-form button.done {
		background: var(--in);
	}
	.bill details {
		margin-top: 0.7rem;
	}
	.empty {
		color: var(--ink-faint);
	}
	@media (max-width: 650px) {
		.bill-list {
			grid-template-columns: 1fr;
		}
	}
</style>
