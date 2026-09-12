<script lang="ts">
	import { enhance } from '$app/forms';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statusText = $derived(!data.month.isCurrent ? 'ผลจริงเทียบแผนของเดือนนี้' : data.analysis.status === 'setup' ? 'กรอกรายรับเพื่อเริ่มวิเคราะห์' : data.analysis.status === 'over' ? 'รายจ่ายรวมเกินงบแล้ว' : data.analysis.status === 'tight' ? 'ช่วงนี้ควรชะลอรายจ่าย' : 'งบเดือนนี้ยังอยู่ในแผน');
</script>
<svelte:head><title>แผนเดือน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">{data.month.label}</p><h1>แผนใช้เงินรายเดือน</h1><p>{statusText}</p></div><MonthNavigator month={data.month} /></section>
<section class="analysis">
	<article class="card"><span>{data.month.isCurrent ? 'เหลือหลังหักบิล' : 'รายจ่ายจริง'}</span><strong class="num" class:negative={data.month.isCurrent && data.analysis.remaining < 0}>{data.month.isCurrent && data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.month.isCurrent ? data.analysis.remaining : data.expense)}`}</strong></article>
	<article class="card"><span>{data.month.isCurrent ? 'ใช้ได้เฉลี่ยต่อวัน' : 'เหลือตามแผนสิ้นเดือน'}</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.month.isCurrent ? data.analysis.safeDaily : data.analysis.remaining)}`}</strong><small>{data.month.isCurrent ? `อีก ${data.analysis.daysRemaining} วัน` : 'หลังหักบิลค้าง'}</small></article>
	<article class="card"><span>{data.month.isCurrent ? 'ค่าอาหารเฉลี่ยที่ยังใช้ได้' : 'งบอาหารคงเหลือ'}</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.month.isCurrent ? data.analysis.foodSafeDaily : data.analysis.foodRemaining)}`}</strong><small>{data.month.isCurrent ? 'ต่อวัน' : 'เมื่อปิดเดือน'}</small></article>
	<article class="card"><span>{data.month.isCurrent ? 'ค่าเดินทางวันที่ไปทำงาน' : 'งบเดินทางคงเหลือ'}</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.month.isCurrent ? data.analysis.commuteSafeDaily : data.analysis.commuteRemaining)}`}</strong><small>{data.month.isCurrent ? 'ต่อวันทำงานที่เหลือ' : 'เมื่อปิดเดือน'}</small></article>
	<article class="card"><span>ใช้ผ่านบัตรเครดิตแล้ว</span><strong class="num">฿{formatNumber(data.creditCardSpent)}</strong><small>รวมในรายจ่ายเดือนนี้แล้ว</small></article>
</section>
<form method="POST" use:enhance class="card plan-form">
	<input type="hidden" name="month" value={data.month.key} />
	<h2>ตัวเลขตั้งต้น</h2><p class="hint">แก้เมื่อไรก็ได้ ผลวิเคราะห์จะคำนวณใหม่จากรายการจริงและบิลที่ยังไม่จ่าย</p>
	<label>เงินที่คาดว่าจะมีเดือนนี้<input name="expectedIncome" type="number" min="0" step="0.01" value={data.values.expectedIncome} required /></label>
	<label>อยากเก็บออม<input name="savingsGoal" type="number" min="0" step="0.01" value={data.values.savingsGoal} required /></label>
	<label>ค่าอาหารต่อวัน<input name="foodDailyBudget" type="number" min="0" step="0.01" value={data.values.foodDailyBudget} required /></label>
	<label>ค่าเดินทางต่อวันทำงาน<input name="commuteDailyBudget" type="number" min="0" step="0.01" value={data.values.commuteDailyBudget} required /></label>
	<label>จำนวนวันเดินทางไปทำงาน<input name="commuteDays" type="number" min="0" max="31" step="1" value={data.values.commuteDays} required /></label>
	<div class="save"><span>{form?.message ?? ''}</span><button type="submit">บันทึกและคำนวณใหม่</button></div>
</form>
<style>
	.head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child{color:var(--ink-muted)}
	.analysis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:var(--stack-lg)}.analysis article{padding:1rem;display:flex;flex-direction:column}.analysis span,.analysis small{color:var(--ink-muted);font-size:var(--text-sm)}.analysis strong{font-size:1.6rem}.negative{color:var(--out)}
	.plan-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:1.25rem;max-width:52rem}.plan-form h2,.hint,.save{grid-column:1/-1}.hint{color:var(--ink-muted)}label{display:grid;gap:.35rem;font-size:var(--text-sm);font-weight:600}input{padding:.7rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}.save{display:flex;align-items:center;justify-content:flex-end;gap:1rem;color:var(--in)}button{padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}
	@media(max-width:800px){.analysis{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.analysis,.plan-form{grid-template-columns:1fr}.plan-form h2,.hint,.save{grid-column:1}}
</style>
