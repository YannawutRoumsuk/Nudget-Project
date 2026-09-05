<script lang="ts">
	import { ALL_CATEGORIES } from '$lib/categories';
	import { bangkokParts } from '$lib/utils/date';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(bangkokParts(data.item.occurredAt));
	const dateValue = $derived(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`);
	const timeValue = $derived(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
</script>

<svelte:head><title>แก้รายการ · Spendbot</title></svelte:head>
<section class="page-head"><p class="eyebrow">รายการ #{data.item.id}</p><h1>แก้ไขรายการ</h1></section>
<form method="POST" class="card form-card">
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	<label>ประเภท<select name="kind" value={data.item.kind}><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select></label>
	<label>จำนวนเงิน<input name="amount" type="number" min="0.01" step="0.01" value={data.item.amount} required /></label>
	<label>หมวด<select name="categoryId" required>{#each ALL_CATEGORIES as category}<option value={category.id} selected={category.id === data.item.categoryId}>{category.icon} {category.nameTh}</option>{/each}</select></label>
	<label>จ่ายด้วย<select name="paymentMethod" value={data.item.paymentMethod}><option value="bank">โอน/บัญชี</option><option value="cash">เงินสด</option><option value="credit_card">บัตรเครดิต</option><option value="wallet">วอลเล็ต</option></select></label>
	<label class="wide">รายละเอียด<input name="note" value={data.item.note} /></label>
	<label>วันที่<input name="date" type="date" value={dateValue} required /></label>
	<label>เวลา<input name="time" type="time" value={timeValue} required /></label>
	<div class="actions"><a href="/transactions">ยกเลิก</a><button type="submit">บันทึกการแก้ไข</button></div>
</form>

<style>
	.page-head{margin-bottom:var(--stack)} h1{font-size:var(--text-xl)}
	.form-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:1.25rem;max-width:46rem}
	label{display:grid;gap:.35rem;font-size:var(--text-sm);font-weight:600}.wide,.actions,.error{grid-column:1/-1}
	input,select{width:100%;padding:.7rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}
	.actions{display:flex;align-items:center;justify-content:flex-end;gap:1rem}.actions a{color:var(--ink-muted)}
	button{padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}.error{color:var(--out)}
	@media(max-width:600px){.form-card{grid-template-columns:1fr}.wide,.actions,.error{grid-column:1}}
</style>
