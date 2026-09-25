<script lang="ts">
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { dayName } from '$lib/cashflow';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const weekdays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
	const plannedDayLabel = $derived(data.expectedIncomeDay ? `วันที่ ${data.expectedIncomeDay}` : 'ไม่ได้ตั้งแผนรับเงิน');
</script>

<svelte:head><title>กระแสเงินสด · Nudget</title></svelte:head>

<section class="head">
	<div><p class="eyebrow">{data.month.label}</p><h1>ปฏิทินกระแสเงินสด</h1><p>รายการเงินจริง บิลครบกำหนด และยอดคงเหลือที่คาดการณ์ แสดงแยกกัน</p></div>
	<MonthNavigator month={data.month} />
</section>

{#if data.previewBill}
	<section class="move-preview">
		<div><strong>ทดลองเลื่อนบิล · {data.previewBill.name}</strong><p>{data.previewBill.recurrence === 'monthly' ? 'ถ้ายืนยัน วันครบกำหนดใหม่นี้จะใช้กับบิลรายเดือนในรอบต่อ ๆ ไปด้วย' : 'เปลี่ยนเฉพาะบิลครั้งเดียวนี้'}</p></div>
		{#if data.previewActive}
			<p>ตัวอย่าง: ย้ายจากวันที่ {data.previewBill.originalDueDate} ไปเป็นวันที่ {data.previewBill.dueDate} ยอดเงินจริงยังไม่เปลี่ยน</p>
			<form method="POST" action="?/confirmMove"><input type="hidden" name="billId" value={data.previewBill.id} /><input type="hidden" name="month" value={data.month.key} /><input type="hidden" name="moveTo" value={data.previewBill.dueDate} /><button class="confirm">ยืนยันเลื่อนวัน</button><a href={`/cashflow?month=${data.month.key}`}>ยกเลิก</a></form>
		{:else}
			<form method="GET"><input type="hidden" name="month" value={data.month.key} /><input type="hidden" name="moveBill" value={data.previewBill.id} /><label>เลือกวันใหม่ <input type="date" name="moveTo" min={`${data.month.key}-01`} max={`${data.month.key}-${String(data.days.length).padStart(2, '0')}`} value={data.previewBill.dueDate} required /></label><button>ดูตัวอย่าง</button><a href={`/cashflow?month=${data.month.key}`}>ยกเลิก</a></form>
		{/if}
	</section>
{/if}

<section class="summary">
	<article class="card"><span>รายรับจริง</span><strong>฿{formatNumber(data.actualIncome)}</strong></article>
	<article class="card"><span>เงินสด/บัญชีจ่ายจริง</span><strong>฿{formatNumber(data.actualExpense)}</strong></article>
	<article class="card"><span>บิลค้างถึงเดือนนี้</span><strong>฿{formatNumber(data.unpaidTotal)}</strong><small>{data.unpaidCount} รายการ</small></article>
	<article class="card lowest"><span>วันที่คาดว่ายอดต่ำสุด</span><strong>{data.lowestDay ? `${dayName(data.lowestDay)} ${data.lowestDay.slice(-2)}` : '—'}</strong><small>{data.lowestDay ? `ยอดสุทธิ ฿${formatNumber(data.days.find((day) => day.key === data.lowestDay)?.endingBalance ?? 0)}` : 'ยังไม่มีข้อมูล'}</small></article>
</section>

<p class="assumption">
	ยอดรายวันเป็นกระแสเงินสุทธิของเดือน เริ่มต้นจากเงินยกมาที่บันทึกไว้{data.hasOpeningBalance ? ` ฿${formatNumber(data.carryover)}` : ' (ตั้งต้น 0 บาท เพราะยังไม่มีเงินยกมาจากเดือนก่อน)'}.
	{#if data.plannedIncome > 0} รายรับคาดการณ์คงเหลือ ฿{formatNumber(data.plannedIncome)} ตามแผน {plannedDayLabel}.{/if}
	รายการบัตรเครดิต/PayLater แสดงตอนจ่ายบิล ไม่ซ้ำตอนซื้อ และยอดนี้ไม่รวมเงินคงเหลือเปิดเดือนที่ยังไม่เคยบันทึกหรือรายจ่ายในอนาคตที่ยังไม่ทราบ
</p>

<div class="legend"><span><i class="actual"></i>เกิดขึ้นจริง</span><span><i class="forecast"></i>คาดการณ์</span><span>ยอดท้ายวันคือเงินสุทธิตั้งแต่ต้นเดือน</span></div>

<section class="calendar" aria-label={`ปฏิทินกระแสเงินสด ${data.month.label}`}>
	{#each weekdays as weekday}<div class="weekday">{weekday}</div>{/each}
	{#each Array(data.weekdayOffset) as _}<div class="day blank" aria-hidden="true"></div>{/each}
	{#each data.days as day (day.key)}
		{@const isLowest = day.key === data.lowestDay}
		{@const isToday = data.month.isCurrent && day.day === data.currentDay}
		<article class="day" class:lowest={isLowest} class:today={isToday}>
			<header><a href={`/transactions?month=${data.month.key}&day=${day.key}`}>{day.day}</a><span>{dayName(day.key)}</span></header>
			{#if day.events.length}
				<div class="events">
					{#each day.events.slice(0, 4) as event, i (`${day.key}-${i}-${event.title}`)}
						<div class="event-wrap">
							{#if event.href}
								<a class="event" class:forecast={event.status === 'forecast'} class:expense={event.type === 'expense'} class:income={event.type === 'income'} href={event.href} title={event.title}><span>{event.title}</span><strong>{event.type === 'expense' ? '−' : '+'}{formatNumber(event.amount)}</strong></a>
							{:else}
								<div class="event" class:forecast={event.status === 'forecast'} class:expense={event.type === 'expense'} class:income={event.type === 'income'} title={event.title}><span>{event.title}</span><strong>{event.type === 'expense' ? '−' : '+'}{formatNumber(event.amount)}</strong></div>
							{/if}
							{#if event.moveHref}<a class="move-link" href={event.moveHref}>ทดลองเลื่อนวัน</a>{/if}
						</div>
					{/each}
					{#if day.events.length > 4}<small>+ อีก {day.events.length - 4} รายการ</small>{/if}
				</div>
			{:else}<p class="empty">ไม่มีรายการ</p>{/if}
			<footer><span>ยอดสุทธิ</span><strong class:negative={day.endingBalance < 0}>฿{formatNumber(day.endingBalance)}</strong></footer>
		</article>
	{/each}
</section>

<style>
	.head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.assumption{color:var(--ink-muted)}
	.move-preview{display:grid;gap:.6rem;padding:1rem;margin-bottom:1rem;border:1px solid var(--accent);border-radius:var(--radius);background:var(--paper-raised)}.move-preview p{margin:.25rem 0;color:var(--ink-muted);font-size:var(--text-sm)}.move-preview form{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.move-preview label{display:flex;align-items:center;gap:.5rem}.move-preview button{padding:.55rem .8rem;border:1px solid var(--accent);border-radius:.5rem;background:var(--accent);color:white;font:inherit}.move-preview .confirm{background:var(--in);border-color:var(--in)}.move-preview a{color:var(--ink-muted);font-size:var(--text-sm)}
	.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}.summary article{padding:1rem;display:flex;flex-direction:column;gap:.2rem}.summary span,.summary small{font-size:var(--text-sm);color:var(--ink-muted)}.summary strong{font-size:1.25rem}.lowest{border-color:var(--out)}
	.assumption{padding:.8rem 1rem;border:1px solid var(--rule);border-radius:var(--radius);font-size:var(--text-sm);line-height:1.5}.legend{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0;color:var(--ink-muted);font-size:var(--text-sm)}.legend span{display:flex;align-items:center;gap:.35rem}.legend i{display:inline-block;width:.65rem;height:.65rem;border-radius:50%}.legend .actual{background:var(--accent)}.legend .forecast{background:var(--out)}
	.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.35rem}.weekday{text-align:center;padding:.4rem;color:var(--ink-muted);font-size:var(--text-sm);font-weight:700}.day{min-width:0;min-height:8rem;padding:.45rem;border:1px solid var(--rule);border-radius:var(--radius);background:var(--paper-raised);display:flex;flex-direction:column;gap:.4rem}.day.blank{visibility:hidden}.day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.day.lowest{border-color:var(--out);box-shadow:inset 0 0 0 1px var(--out)}.day header{display:flex;justify-content:space-between;align-items:center}.day header a{font-weight:700;color:var(--ink);text-decoration:none}.day header span{font-size:.7rem;color:var(--ink-muted)}.events{display:grid;gap:.2rem}.event-wrap{display:grid;gap:.1rem}.event{display:flex;justify-content:space-between;align-items:center;gap:.2rem;padding:.2rem .28rem;border-radius:.3rem;text-decoration:none;font-size:.68rem;line-height:1.25}.event span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.event strong{white-space:nowrap;font-size:.68rem}.event.income{background:color-mix(in oklch,var(--in) 10%,var(--paper));color:var(--in)}.event.expense{background:color-mix(in oklch,var(--out) 9%,var(--paper));color:var(--out)}.event.forecast{outline:1px dashed currentColor;outline-offset:-1px}.move-link{font-size:.62rem;color:var(--ink-muted)}.events small,.empty{color:var(--ink-faint);font-size:.68rem;margin:0}.day footer{margin-top:auto;padding-top:.3rem;border-top:1px solid var(--rule);display:grid;gap:.1rem}.day footer span{color:var(--ink-muted);font-size:.64rem}.day footer strong{font-size:.78rem}.negative{color:var(--out)}
	@media(max-width:900px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.day{min-height:7.2rem;padding:.35rem}.event,.event strong{font-size:.62rem}}
	@media(max-width:600px){.calendar{grid-template-columns:repeat(2,minmax(0,1fr))}.weekday{display:none}.day.blank{display:none}.day{min-height:6.2rem}.event,.event strong{font-size:.72rem}}
</style>
