<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statusText = $derived(data.analysis.status === 'setup' ? 'กรอกรายรับเพื่อเริ่มวิเคราะห์' : data.analysis.status === 'over' ? 'รายจ่ายรวมเกินงบแล้ว' : data.analysis.status === 'tight' ? 'ช่วงนี้ควรชะลอรายจ่าย' : 'งบเดือนนี้ยังอยู่ในแผน');
</script>
<svelte:head><title>แผนเดือน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">{data.month}</p><h1>แผนใช้เงินเดือนนี้</h1><p>{statusText}</p></div></section>
<section class="analysis">
	<article class="card"><span>เหลือหลังหักบิล</span><strong class="num" class:negative={data.analysis.remaining < 0}>{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.analysis.remaining)}`}</strong></article>
	<article class="card"><span>ใช้ได้เฉลี่ยต่อวัน</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.analysis.safeDaily)}`}</strong><small>อีก {data.analysis.daysRemaining} วัน</small></article>
	<article class="card"><span>ค่าอาหารเฉลี่ยที่ยังใช้ได้</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.analysis.foodSafeDaily)}`}</strong><small>ต่อวัน</small></article>
	<article class="card"><span>ค่าเดินทางวันที่ไปทำงาน</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.analysis.commuteSafeDaily)}`}</strong><small>ต่อวันทำงานที่เหลือ</small></article>
	<article class="card"><span>ใช้ผ่านบัตรเครดิตแล้ว</span><strong class="num">฿{formatNumber(data.creditCardSpent)}</strong><small>รวมในรายจ่ายเดือนนี้แล้ว</small></article>
</section>
<form method="POST" use:enhance class="card plan-form">
	<input type="hidden" name="month" value={data.month} />
	<h2>ตัวเลขตั้งต้น</h2><p class="hint">แก้เมื่อไรก็ได้ ผลวิเคราะห์จะคำนวณใหม่จากรายการจริงและบิลที่ยังไม่จ่าย</p>
	<label>เงินที่คาดว่าจะมีเดือนนี้<input name="expectedIncome" type="number" min="0" step="0.01" value={data.values.expectedIncome} required /></label>
	<label>อยากเก็บออม<input name="savingsGoal" type="number" min="0" step="0.01" value={data.values.savingsGoal} required /></label>
	<label>ค่าอาหารต่อวัน<input name="foodDailyBudget" type="number" min="0" step="0.01" value={data.values.foodDailyBudget} required /></label>
	<label>ค่าเดินทางต่อวันทำงาน<input name="commuteDailyBudget" type="number" min="0" step="0.01" value={data.values.commuteDailyBudget} required /></label>
	<label>จำนวนวันเดินทางไปทำงาน<input name="commuteDays" type="number" min="0" max="31" step="1" value={data.values.commuteDays} required /></label>
	<div class="save"><span>{form?.message ?? ''}</span><button type="submit">บันทึกและคำนวณใหม่</button></div>
</form>
<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child{color:var(--ink-muted)}
	.analysis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:var(--stack-lg)}.analysis article{padding:1rem;display:flex;flex-direction:column}.analysis span,.analysis small{color:var(--ink-muted);font-size:var(--text-sm)}.analysis strong{font-size:1.6rem}.negative{color:var(--out)}
	.plan-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:1.25rem;max-width:52rem}.plan-form h2,.hint,.save{grid-column:1/-1}.hint{color:var(--ink-muted)}label{display:grid;gap:.35rem;font-size:var(--text-sm);font-weight:600}input{padding:.7rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}.save{display:flex;align-items:center;justify-content:flex-end;gap:1rem;color:var(--in)}button{padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}
	@media(max-width:800px){.analysis{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.analysis,.plan-form{grid-template-columns:1fr}.plan-form h2,.hint,.save{grid-column:1}}
</style>
