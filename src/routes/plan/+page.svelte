<script lang="ts">
	import { enhance } from '$app/forms';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { getCategory } from '$lib/categories';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statusText = $derived(!data.month.isCurrent ? 'ผลจริงเทียบแผน' : data.analysis.status === 'setup' ? 'กรอกรายรับเพื่อเริ่มวิเคราะห์' : data.analysis.status === 'over' ? 'เงินที่วางแผนไว้ไม่พอสำหรับรายจ่ายและบิลที่เหลือ' : data.analysis.status === 'tight' ? 'ช่วงนี้ควรชะลอรายจ่ายที่เลื่อนได้' : 'งบเดือนนี้ยังอยู่ในแผน');
</script>
<svelte:head><title>แผนเดือน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">{data.month.label}</p><h1>แผนใช้เงินรายเดือน</h1><p>{statusText}</p></div><MonthNavigator month={data.month} /></section>
<section class="analysis">
	<article class="card"><span>รายรับจริง</span><strong class="num">฿{formatNumber(data.income)}</strong><small>ตั้งใจมี ฿{formatNumber(data.values.expectedIncome)}</small></article>
	<article class="card"><span>รายจ่ายที่บันทึก</span><strong class="num">฿{formatNumber(data.expense)}</strong><small>รวมยอดซื้อบัตรและ PayLater แล้ว</small></article>
	<article class="card"><span>บิลค้างที่ถึงกำหนดเดือนนี้</span><strong class="num">฿{formatNumber(data.unpaidBills + data.unpaidCardBills)}</strong><small>บิลทั่วไป ฿{formatNumber(data.unpaidBills)} · บัตร/ผ่อน ฿{formatNumber(data.unpaidCardBills)}</small></article>
	<article class="card"><span>{data.month.isCurrent ? 'เงินเหลือใช้ได้จริง' : 'เงินเหลือตามแผน'}</span><strong class="num" class:negative={data.analysis.remaining < 0}>{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.analysis.remaining)}`}</strong><small>หักเงินออมและเงินที่ต้องกันจ่ายแล้ว</small></article>
	<article class="card"><span>{data.month.isCurrent ? 'ใช้ได้เฉลี่ยต่อวัน' : 'รายจ่ายเฉลี่ยต่อวัน'}</span><strong class="num">{data.analysis.status === 'setup' ? '—' : `฿${formatNumber(data.month.isCurrent ? data.analysis.safeDaily : data.expense / data.month.daysInMonth)}`}</strong><small>{data.month.isCurrent ? `อีก ${data.analysis.daysRemaining} วัน` : 'คิดจากจำนวนวันในเดือน'}</small></article>
	<article class="card"><span>ค่าใช้บัตรเครดิตเดือนนี้</span><strong class="num">฿{formatNumber(data.creditCardSpent + data.payLaterSpent)}</strong><small>นับเป็นรายจ่ายเดือนที่ซื้อ ไม่ซ้ำตอนจ่ายบิล</small></article>
	<article class="card"><span>เงินกันเข้าเป้าหมาย</span><strong class="num">฿{formatNumber(data.goalReserve)}</strong><small><a href="/goals">{data.goalCount} เป้าหมายที่กำลังทำ · ดูและแก้ไข</a></small></article>
	{#if data.carryover && data.carryover.amount > 0}<article class="card carryover"><span>เงินยกมาจาก {data.carryover.fromMonth}</span><strong class="num">฿{formatNumber(data.carryover.amount)}</strong><small>{data.carryover.mode === 'savings' ? 'กันไว้เป็นเงินออม' : data.carryover.mode === 'spendable' ? 'เพิ่มในเงินใช้ได้ของแผน' : 'ไม่ได้รวมในแผนใช้เงิน'}</small></article>{/if}
	<article class="card"><span>{data.month.isCurrent ? 'งบอาหารที่เหลือต่อวัน' : 'อาหารเฉลี่ยต่อวัน'}</span><strong class="num">฿{formatNumber(data.month.isCurrent ? data.analysis.foodSafeDaily : data.foodSpent / data.month.daysInMonth)}</strong><small>{data.month.isCurrent ? `จากงบ ฿${formatNumber(data.values.foodDailyBudget)} ต่อวัน` : 'ตามรายการที่บันทึก'}</small></article>
	<article class="card"><span>{data.month.isCurrent ? 'งบเดินทางต่อวันทำงาน' : 'เดินทางเฉลี่ยต่อวันทำงาน'}</span><strong class="num">฿{formatNumber(data.month.isCurrent ? data.analysis.commuteSafeDaily : data.values.commuteDays ? data.commuteSpent / data.values.commuteDays : 0)}</strong><small>{data.month.isCurrent ? `จาก ${data.analysis.daysRemaining} วันทั่วไปที่เหลือ` : `จาก ${data.values.commuteDays} วันทำงาน`}</small></article>
</section>
<p class="formula">คำนวณเงินใช้ได้จริงจากรายรับที่คาดไว้ − เป้าออม − เงินกันเข้าเป้าหมาย − รายจ่ายจากเงินสด/บัญชี − บิลทั่วไปค้างจ่าย − ยอดบัตรหรือ PayLater ที่ถึงกำหนดเดือนนี้ เงินกันเข้าเป้าหมายเป็นการจัดสรรเงิน ไม่ใช่รายจ่ายจริง</p>
{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="card budgets">
	<header class="budget-head"><div><h2>งบประมาณรายหมวด</h2><p class="hint">รายการซื้อจริงรวมยอดบัตรตามเดือนที่ซื้อ ส่วนบิลทั่วไปที่ยังไม่จ่ายจะกันงบไว้ตามเดือนครบกำหนด</p></div>
		{#if data.month.previous}<form method="POST" action="?/copyBudgets"><input type="hidden" name="month" value={data.month.key} /><button class="secondary" type="submit">คัดลอกจากเดือนก่อน</button></form>{/if}
	</header>
	<form method="POST" action="?/budgets" class="category-editor">
		<input type="hidden" name="month" value={data.month.key} />
		{#each data.categoryProgress as row (row.categoryId)}
			{@const category = getCategory(row.categoryId)}
			<label>{category?.icon} {category?.nameTh ?? row.categoryId}<input name={`budget_${row.categoryId}`} type="number" min="0" step="0.01" value={row.budget || ''} placeholder="ยังไม่ตั้ง" /></label>
		{/each}
		<button type="submit">บันทึกงบทุกหมวด</button>
	</form>
	<div class="category-progress">
		{#each data.categoryProgress.filter((row) => row.budget > 0) as row (row.categoryId)}
			{@const category = getCategory(row.categoryId)}
			<article class="category-row">
				<div class="category-title"><strong>{category?.icon} {category?.nameTh}</strong><span>{row.usedPercent}% ใช้แล้ว · {row.elapsedPercent}% ของเดือนผ่านไป</span></div>
				<progress max="100" value={Math.min(100, row.usedPercent)} aria-label={`ใช้งบ${category?.nameTh} ${row.usedPercent}%`}></progress>
				<div class="category-numbers"><span>ตั้ง ฿{formatNumber(row.budget)}</span><span>ใช้/กันไว้ ฿{formatNumber(row.spent)}</span><strong class:negative={row.remaining < 0}>เหลือ ฿{formatNumber(row.remaining)}</strong></div>
				<p class="pace" class:negative={row.forecastOverBudget}>{row.forecastOverBudget ? `ถ้าใช้เท่านี้ต่อไป คาดว่าจะเกินงบเป็น ฿${formatNumber(row.projectedSpend)}` : 'แนวโน้มยังไม่เกินงบ'}</p>
				<a href={`/transactions?range=month&month=${data.month.key}&kind=expense&category=${row.categoryId}`}>ดูรายการในหมวดนี้ →</a>
			</article>
		{/each}
		{#if data.categoryProgress.every((row) => row.budget === 0)}<p class="hint">ยังไม่ได้ตั้งงบรายหมวด ใส่ยอดด้านบนเพื่อดูยอดคงเหลือและแนวโน้ม</p>{/if}
	</div>
</section>
<form method="POST" use:enhance class="card plan-form">
	<input type="hidden" name="month" value={data.month.key} />
	<h2>ตัวเลขตั้งต้น</h2><p class="hint">แก้เมื่อไรก็ได้ ผลวิเคราะห์จะคำนวณใหม่จากรายการจริงและบิลที่ยังไม่จ่าย</p>
	<label>เงินที่คาดว่าจะมีเดือนนี้<input name="expectedIncome" type="number" min="0" step="0.01" value={data.values.expectedIncome} required /></label>
	<label>คาดว่าจะได้รับวันที่<input name="expectedIncomeDay" type="number" min="1" max="31" step="1" value={data.values.expectedIncomeDay} required /></label>
	<label>อยากเก็บออม<input name="savingsGoal" type="number" min="0" step="0.01" value={data.values.savingsGoal} required /></label>
	<label>ค่าอาหารต่อวัน<input name="foodDailyBudget" type="number" min="0" step="0.01" value={data.values.foodDailyBudget} required /></label>
	<label>ค่าเดินทางต่อวันทำงาน<input name="commuteDailyBudget" type="number" min="0" step="0.01" value={data.values.commuteDailyBudget} required /></label>
	<label>จำนวนวันเดินทางไปทำงาน<input name="commuteDays" type="number" min="0" max="31" step="1" value={data.values.commuteDays} required /></label>
	<label class="toggle"><input name="budgetAlertsEnabled" type="checkbox" checked={data.values.budgetAlertsEnabled} /> รับการแจ้งเตือนงบหมวดเมื่อใช้ถึง 50%, 80% และ 100%</label>
	<div class="save"><button type="submit">บันทึกและคำนวณใหม่</button></div>
</form>
{#if data.month.next}
	<section class="card close-panel">
		<div class="close-heading"><div><p class="eyebrow">ปิดเดือน {data.month.key}</p><h2>ทบทวนแล้วเตรียมเดือน {data.month.next}</h2><p>ยอดจริงคำนวณใหม่จากรายการปัจจุบัน บิลประจำจะต่อเนื่องเองอยู่แล้ว จึงไม่สร้างซ้ำ</p></div></div>
		<div class="close-summary">
			<div><span>รายรับจริง</span><strong>฿{formatNumber(data.income)}</strong><small>แผน ฿{formatNumber(data.values.expectedIncome)}</small></div>
			<div><span>รายจ่ายจริง</span><strong>฿{formatNumber(data.expense)}</strong><small>หักจากเงินสดเมื่อคำนวณยอดยกไป</small></div>
			<div><span>บิลยังไม่จ่าย</span><strong>฿{formatNumber(data.unpaidBills + data.unpaidCardBills)}</strong><small>ทั่วไป ฿{formatNumber(data.unpaidBills)} · บัตร/ผ่อน ฿{formatNumber(data.unpaidCardBills)}</small></div>
			<div><span>ยอดคงเหลือจริงโดยประมาณ</span><strong class:negative={data.actualRemaining < 0}>฿{formatNumber(data.actualRemaining)}</strong><small>หลังหักรายจ่ายเงินสดและบิลที่ยังไม่จ่าย</small></div>
		</div>
		{#if data.closure}
			<p class="notice">ปิดครั้งแรกเมื่อ {new Date(data.closure.closedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · สรุปคำนวณล่าสุด {new Date(data.closure.snapshot.refreshedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · กดอีกครั้งจะปรับเฉพาะสรุป ไม่คัดลอกแผนหรือเลื่อนบิลซ้ำ · ยอดยกไป ฿{formatNumber(Number(data.closure.carryoverAmount))}</p>
			<form method="POST" action="?/closeMonth" class="refresh-form"><input type="hidden" name="month" value={data.month.key} /><input type="hidden" name="carryoverMode" value={data.closure.carryoverMode} /><button type="submit">ปรับสรุปเดือนนี้ใหม่</button></form>
		{:else}
			<form method="POST" action="?/closeMonth" class="close-form">
				<input type="hidden" name="month" value={data.month.key} />
				<p class="hint destination">เดือนหน้า{data.nextPlanExists ? 'มีแผนอยู่แล้วและตัวเลขที่เลือกจะเขียนทับ' : 'ยังไม่มีแผน'} · {data.nextBudgetCount ? `มีงบ ${data.nextBudgetCount} หมวดอยู่แล้วและงบที่เลือกจะเขียนทับ` : 'ยังไม่มีงบรายหมวด'} · ตรวจรายการด้านล่างก่อนยืนยัน</p>
				<label><input type="checkbox" name="copyPlan" checked={!!data.values.expectedIncome || !!data.values.savingsGoal} />คัดลอกตัวเลขแผนเดือนนี้ไปเดือนหน้า</label>
				<label><input type="checkbox" name="copyBudgets" checked={data.categoryProgress.some((row) => row.budget > 0)} />คัดลอกงบรายหมวด</label>
				<label><input type="checkbox" name="carryBills" checked />เลื่อนบิลครั้งเดียวที่ค้างจ่ายไปเป็นเดือนหน้า</label>
				<p class="hint">บิลรายเดือนจะปรากฏเดือนหน้าตามเดิม · บิลบัตรและผ่อนที่นับเป็นยอดซื้อแล้วจะไม่ถูกสร้างเป็นรายการซ้ำ</p>
				<label class="carry-label">ยอดบวกที่เหลือจะไปอยู่ตรงไหน
					<select name="carryoverMode"><option value="spendable">เพิ่มเงินใช้ได้ของเดือนหน้า</option><option value="savings">กันเป็นเป้าออมของเดือนหน้า</option><option value="none">ไม่ยกยอด</option></select>
				</label>
				<button type="submit">ปิดเดือนและเตรียมแผนถัดไป</button>
			</form>
		{/if}
	</section>
{/if}
<style>
	.head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.hint{color:var(--ink-muted)}
	.analysis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:var(--stack) 0}.analysis article{padding:1rem;display:flex;flex-direction:column;gap:.2rem}.analysis span,.analysis small{color:var(--ink-muted);font-size:var(--text-sm)}.analysis strong{font-size:1.45rem}.negative{color:var(--out)}.formula{color:var(--ink-muted);font-size:var(--text-sm);margin-bottom:var(--stack)}
	.budgets{padding:1.25rem;margin-bottom:var(--stack)}.budget-head{display:flex;justify-content:space-between;gap:1rem;align-items:start}.budget-head h2,.plan-form h2{margin:0}.budget-head p{margin:.35rem 0}.secondary{padding:.6rem .8rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:transparent;color:var(--ink);font:inherit;cursor:pointer}
	.category-editor{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;padding:1rem 0;border-bottom:1px solid var(--rule)}.category-editor label{display:grid;gap:.3rem;font-size:var(--text-sm);font-weight:600}.category-editor input,.plan-form input[type=number]{padding:.65rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}
	.category-editor button,.plan-form button{justify-self:start;padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}
	.category-progress{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding-top:1rem}.category-row{border:1px solid var(--rule);border-radius:var(--radius);padding:.85rem}.category-title,.category-numbers{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap}.category-title span,.category-row .pace,.category-row a{font-size:var(--text-sm);color:var(--ink-muted)}.category-row progress{width:100%;height:.7rem;margin:.7rem 0;accent-color:var(--in)}.category-numbers strong.negative,.category-row .pace.negative{color:var(--out)}.category-row .pace{margin:.45rem 0}.category-row a{color:var(--accent-ink)}
	.plan-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:1.25rem;max-width:52rem}.plan-form h2,.plan-form .hint,.save{grid-column:1/-1}.plan-form label{display:grid;gap:.35rem;font-size:var(--text-sm);font-weight:600}.plan-form .toggle{display:flex;align-items:center;gap:.5rem}.save{display:flex;align-items:center;justify-content:flex-end;gap:1rem;color:var(--in)}
	.carryover{border-color:var(--accent)}.close-panel{padding:1.25rem;margin-top:var(--stack)}.close-heading h2{margin:0}.close-heading p:last-child{color:var(--ink-muted)}.close-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:1rem 0}.close-summary>div{display:grid;gap:.2rem;padding:.8rem;border:1px solid var(--rule);border-radius:var(--radius)}.close-summary span,.close-summary small{font-size:var(--text-sm);color:var(--ink-muted)}.close-summary strong{font-size:1.2rem}.close-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem 1rem}.close-form>label:not(.carry-label){display:flex;align-items:flex-start;gap:.55rem;font-size:var(--text-sm)}.close-form input[type=checkbox]{accent-color:var(--accent)}.close-form p,.carry-label{grid-column:1/-1}.carry-label{display:grid;gap:.35rem}.carry-label select{max-width:28rem;padding:.65rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised);color:var(--ink)}.close-form button{justify-self:start;grid-column:1/-1;padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--accent);color:var(--paper-raised);font:inherit;font-weight:600;cursor:pointer}.refresh-form{margin-top:.8rem}.refresh-form button{padding:.6rem .8rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:transparent;color:var(--ink);font:inherit;cursor:pointer}
	@media(max-width:800px){.analysis,.close-summary{grid-template-columns:repeat(2,1fr)}.category-editor{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.analysis,.plan-form,.category-editor,.category-progress,.close-summary,.close-form{grid-template-columns:1fr}.budget-head{flex-direction:column}.plan-form h2,.plan-form .hint,.save,.close-form p,.carry-label,.close-form button{grid-column:1}}
</style>
