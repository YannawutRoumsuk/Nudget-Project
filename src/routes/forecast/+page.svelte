<script lang="ts">
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const expense = $derived(data.forecast.totalExpense);
	const cash = $derived(data.forecast.cashRemaining);
	const money = (value: number | null | undefined) => value === null || value === undefined ? '—' : `฿${formatNumber(value)}`;
</script>

<svelte:head><title>คาดการณ์รายเดือน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">{data.month.label}</p><h1>คาดการณ์สิ้นเดือน</h1><p>{data.month.isCurrent ? `ข้อมูลถึงวันที่ ${data.forecast.elapsedDays} · เหลือ ${data.forecast.daysRemaining} วัน` : 'สรุปผลจริงของเดือนที่เลือก'}</p></div><MonthNavigator month={data.month} /></section>

{#if !data.hasPlan}<p class="notice">ยังไม่ได้ตั้งแผนรายรับของเดือนนี้ คาดการณ์ยอดเงินคงเหลืออาจยังไม่ครบ ไปตั้งรายรับที่ <a href="/plan">แผนเดือน</a></p>{/if}
{#if data.forecast.lowSample && data.forecast.daysRemaining > 0}<p class="notice">ข้อมูลย้อนหลังมีเพียง {data.forecast.historyMonths} เดือนจาก 3 เดือนที่ต้องการ จึงแสดงช่วงประมาณการกว้างขึ้น โปรดใช้เป็นแนวทาง</p>{/if}
{#if data.forecast.unknownVariableForecast}<p class="notice">ยังประเมินรายจ่ายประจำวันไม่ได้ เพราะไม่มีทั้งประวัติย้อนหลังและรายจ่ายปกติของเดือนนี้ ระบบแสดงเฉพาะยอดจริงและบิลที่ทราบ โดยไม่สมมติว่าเดือนที่เหลือจะใช้ 0 บาท</p>{/if}

<section class="summary">
	<article class="card main"><span>{data.month.isCurrent ? 'รายจ่ายรวมที่คาดถึงสิ้นเดือน' : 'รายจ่ายจริงและบิลที่ยังค้าง'}</span><strong>{expense ? money(expense.median) : 'ยังประมาณไม่ได้'}</strong>{#if expense}<small>ช่วงประมาณ {money(expense.low)} – {money(expense.high)}</small>{/if}</article>
	<article class="card main"><span>{data.month.isCurrent ? 'เงินสดที่คาดว่าเหลือสิ้นเดือน' : 'เงินสดคงเหลือโดยประมาณ'}</span><strong class:negative={cash && cash.median < 0}>{cash ? money(cash.median) : 'ยังประมาณไม่ได้'}</strong>{#if cash}<small>ช่วงประมาณ {money(cash.low)} – {money(cash.high)} · รวมยอดบัตรที่ต้องจ่าย {money(data.cardPayables)}</small>{/if}</article>
	<article class="card"><span>รายจ่ายพิเศษเดือนนี้</span><strong>{money(data.specialActual)}</strong><small>ยังอยู่ในยอดจริง แต่ออกจากฐานคาดการณ์ล่วงหน้า</small></article>
	<article class="card"><span>บิลที่ยังไม่จ่ายและรู้ยอดแล้ว</span><strong>{money(data.knownFixedBills + data.knownVariableBills)}</strong><small>ค่าใช้จ่ายตามบิลที่จะครบกำหนด</small></article>
	{#if data.forecast.budgetOver !== null}<article class="card"><span>เทียบงบรายหมวดรวม</span><strong class:negative={data.forecast.budgetOver > 0}>{data.forecast.budgetOver > 0 ? `เกิน ${money(data.forecast.budgetOver)}` : `เหลือ ${money(Math.abs(data.forecast.budgetOver))}`}</strong><small>เทียบกับงบที่ตั้งรวม ฿{formatNumber(data.forecast.totalExpense!.median - data.forecast.budgetOver)}</small></article>{/if}
	{#if data.forecast.savingsGoalGap !== null}<article class="card"><span>เทียบเป้าเงินออม</span><strong class:negative={data.forecast.savingsGoalGap > 0}>{data.forecast.savingsGoalGap > 0 ? `ยังขาด ${money(data.forecast.savingsGoalGap)}` : `เกินเป้า ${money(Math.abs(data.forecast.savingsGoalGap))}`}</strong><small>รวมเป้าหมายออมและเงินกันเข้าเป้าหมาย</small></article>{/if}
</section>

<section class="card breakdown">
	<h2>วิธีคำนวณ</h2>
	<div class="rows">
		<div><span>ค่าใช้จ่ายคงที่ที่บันทึกแล้ว</span><strong>{money(data.fixedActual)}</strong></div>
		<div><span>รายจ่ายปกติที่บันทึกแล้ว</span><strong>{money(data.variableActual)}</strong></div>
		<div><span>รายจ่ายพิเศษที่บันทึกแล้ว</span><strong>{money(data.specialActual)}</strong></div>
		<div><span>บิลที่ยังต้องจ่าย</span><strong>{money(data.knownFixedBills + data.knownVariableBills)}</strong></div>
		<div><span>รายจ่ายปกติที่คาดว่าจะเกิดอีก</span><strong>{data.forecast.variableRemaining ? `${money(data.forecast.variableRemaining.median)} (ช่วง ${money(data.forecast.variableRemaining.low)}–${money(data.forecast.variableRemaining.high)})` : 'ยังไม่มีข้อมูลพอ'}</strong></div>
	</div>
	<p>ฐานย้อนหลังใช้รายจ่ายปกติของ 3 เดือนก่อน แปลงเป็นค่าเฉลี่ยต่อวันและใช้ค่ากลาง ช่วงต่ำ–สูงมาจากการกระจายของเดือนเหล่านั้น แล้วปรับตามจังหวะใช้เงินจริงของเดือนนี้ รายการพิเศษยังรวมในยอดจริง แต่ไม่นำไปคาดว่าจะเกิดซ้ำ บิลบัตร/PayLater ไม่นับซ้ำเป็นรายจ่าย แต่หักเงินสดตามยอดที่ต้องชำระ</p>
</section>

<section class="card exceptions">
	<header><div><h2>เลือกธุรกรรมที่เป็นรายการพิเศษ</h2><p>รายการที่ทำเครื่องหมายพิเศษจะยังนับในยอดจริง แต่ไม่ใช้เป็นฐานคาดการณ์รายจ่ายประจำ</p></div><a href="/transactions?month={data.month.key}">ดูรายการทั้งหมด</a></header>
	{#if data.specialTransactions.length === 0}<p class="empty">ไม่มีธุรกรรมรายจ่ายให้แสดงในเดือนนี้</p>{:else}<ul>{#each data.specialTransactions as item (item.id)}<li><span><strong>{item.note}</strong><small>{item.category} · {new Date(item.occurredAt).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })}</small></span><span class="entry"><strong>{money(item.amount)}</strong><a href="/transactions/{item.id}">{item.excluded ? 'เอาออกจากรายการพิเศษ' : 'ทำเป็นรายการพิเศษ'}</a></span></li>{/each}</ul>{/if}
</section>

<style>
	.head{display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.card small,.breakdown p,.exceptions p{color:var(--ink-muted)}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:var(--stack) 0}.summary article{padding:1rem;display:flex;flex-direction:column;gap:.35rem}.summary span,.summary small{font-size:var(--text-sm);color:var(--ink-muted)}.summary strong{font-size:1.35rem}.summary .main{grid-column:span 1}.summary .main strong{font-size:1.65rem}.negative{color:var(--out)}.breakdown,.exceptions{padding:1.2rem;margin-bottom:var(--stack)}h2{font-size:1.15rem;margin:0 0 .6rem}.rows>div{display:flex;justify-content:space-between;gap:1rem;padding:.7rem 0;border-bottom:1px solid var(--rule)}.rows span{color:var(--ink-muted)}.breakdown p{font-size:var(--text-sm);line-height:1.6;margin-bottom:0}.exceptions header{display:flex;justify-content:space-between;align-items:start;gap:1rem}.exceptions header p{margin:0 0 .8rem}.exceptions header a,.entry a{color:var(--accent-ink);white-space:nowrap}.exceptions ul{list-style:none;margin:0;padding:0}.exceptions li{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--rule)}.exceptions li>span:first-child{display:grid}.exceptions li small{font-size:var(--text-sm);color:var(--ink-muted)}.entry{display:grid;text-align:right}.empty{color:var(--ink-muted)}
	@media(max-width:700px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary .main{grid-column:span 2}}@media(max-width:480px){.summary{grid-template-columns:1fr}.summary .main{grid-column:auto}.exceptions header{display:block}.rows>div{align-items:start}.exceptions li{align-items:start}}
</style>
