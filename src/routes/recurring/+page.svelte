<script lang="ts">
	import { formatNumber } from '$lib/utils/money';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const money = (value: number) => `฿${formatNumber(value)}`;
</script>

<svelte:head><title>รายการประจำ · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">วิเคราะห์จากธุรกรรมของบัญชีคุณเท่านั้น</p><h1>รายการประจำที่พบ</h1><p>ระบบใช้ชื่อรายการ ยอด และช่วงห่างของวันที่เพื่อหาความเป็นไปได้ บิลจะไม่ถูกสร้างจนกว่าคุณจะยืนยัน</p></div></section>
{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="totals">
	<article class="card"><span>บิลประจำที่ยืนยันแล้ว</span><strong>{data.confirmed.length} รายการ</strong></article>
	<article class="card"><span>ยอดประจำต่อเดือน</span><strong>{money(data.monthlyTotal)}</strong></article>
	<article class="card"><span>ประมาณการต่อปี</span><strong>{money(data.yearlyTotal)}</strong><small>ยอดรายเดือน × 12</small></article>
</section>

<section class="suggestions">
	<h2>รอยืนยัน</h2>
	{#if data.suggestions.length === 0}<p class="empty card">ยังไม่พบรายการรายเดือนที่เข้าเกณฑ์ ต้องพบอย่างน้อย 3 ครั้ง ยอดใกล้เคียงกัน และเว้นช่วงราว 25–35 วัน</p>{/if}
	{#each data.suggestions as candidate (candidate.merchantKey)}
		<article class="card candidate">
			<header><div><p class="eyebrow">พบ {candidate.occurrences} ครั้ง · เกิดทุกประมาณ {candidate.cycleDays} วัน</p><h2>{candidate.name}</h2></div><span class="frequency">รายเดือน</span></header>
			<div class="facts"><div><small>ยอดต่อรอบ</small><strong>{money(candidate.amount)}</strong></div><div><small>ประมาณต่อปี</small><strong>{money(candidate.yearlyTotal)}</strong></div><div><small>วันที่จ่ายที่แนะนำ</small><strong>วันที่ {candidate.dueDay}</strong></div><div><small>หมวดที่พบ</small><strong>{candidate.categoryName}</strong></div></div>
			<p class="meta">พบตั้งแต่ {new Date(candidate.firstSeen).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })} ถึง {new Date(candidate.lastSeen).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })} · ใช้วิธีค่ากลางของ 3 รายการล่าสุด · สร้างบิลแล้วปรับยอด/วัน/หมวดได้ที่ <a href="/bills">บิล</a></p>
			<div class="actions"><form method="POST" action="?/accept"><input type="hidden" name="merchantKey" value={candidate.merchantKey} /><button type="submit">ยืนยันและสร้างบิลประจำ</button></form><form method="POST" action="?/dismiss"><input type="hidden" name="merchantKey" value={candidate.merchantKey} /><input type="hidden" name="status" value="dismissed" /><button class="secondary" type="submit">ซ่อนคำแนะนำ</button></form><form method="POST" action="?/dismiss"><input type="hidden" name="merchantKey" value={candidate.merchantKey} /><input type="hidden" name="status" value="not_recurring" /><button class="quiet" type="submit">ไม่ใช่รายการประจำ</button></form></div>
		</article>
	{/each}
</section>

{#if data.confirmed.length}
	<section class="card confirmed"><h2>บิลที่ยืนยันแล้ว</h2><ul>{#each data.confirmed as bill (bill.id)}<li><span>{bill.name}<small>บิลประจำที่กำลังเปิดใช้งาน</small></span><strong>{money(bill.amount)} / เดือน</strong></li>{/each}</ul><a href="/bills">จัดการบิลทั้งหมด</a></section>
{/if}

{#if data.hidden.length}
	<details class="card hidden"><summary>คำแนะนำที่ซ่อนหรือระบุว่าไม่ใช่รายการประจำ ({data.hidden.length})</summary><ul>{#each data.hidden as item (item.merchantKey)}<li><span>{item.merchantKey}<small>{item.status === 'dismissed' ? 'ซ่อนคำแนะนำ' : 'ระบุว่าไม่ใช่รายการประจำ'}</small></span><form method="POST" action="?/restore"><input type="hidden" name="merchantKey" value={item.merchantKey} /><button class="secondary" type="submit">เปิดคำแนะนำอีกครั้ง</button></form></li>{/each}</ul></details>
{/if}

<p class="privacy">ไม่มีการเรียก Gemini สำหรับการตรวจจับนี้ ข้อมูลและการตัดสินใจถูกแยกตามบัญชีของผู้ใช้</p>

<style>
	.head{margin:var(--stack) 0}h1{font-size:var(--text-xl)}.head p:last-child,.meta,.privacy,small{color:var(--ink-muted)}.totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-bottom:var(--stack)}.totals article{padding:1rem;display:grid;gap:.3rem}.totals span,.totals small,.facts small{font-size:var(--text-sm);color:var(--ink-muted)}.totals strong{font-size:1.35rem}.suggestions{margin-bottom:var(--stack)}.suggestions>h2,.confirmed h2{font-size:1.2rem}.candidate,.confirmed,.hidden{padding:1.2rem;margin-bottom:1rem}.candidate header{display:flex;justify-content:space-between;gap:1rem}.candidate header h2{margin:0;font-size:1.2rem}.eyebrow{font-size:var(--text-sm);color:var(--ink-muted);margin:0 0 .3rem}.frequency{align-self:start;padding:.25rem .55rem;border-radius:999px;background:var(--in-soft, #e8f6ee);color:var(--in);font-size:var(--text-sm)}.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;margin:.8rem 0}.facts div{display:grid;padding:.65rem;border:1px solid var(--rule);border-radius:var(--radius);gap:.3rem}.facts strong{font-size:1rem}.meta{font-size:var(--text-sm)}.meta a,.confirmed>a{color:var(--accent-ink)}.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.8rem}.actions button,.secondary,.quiet{padding:.6rem .8rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);font:inherit;cursor:pointer}.actions .secondary,.secondary{border:1px solid var(--rule-strong);background:transparent;color:var(--ink)}.quiet{background:transparent;color:var(--ink-muted)}.confirmed ul,.hidden ul{list-style:none;padding:0;margin:.5rem 0}.confirmed li,.hidden li{display:flex;justify-content:space-between;gap:1rem;padding:.7rem 0;border-bottom:1px solid var(--rule)}.confirmed li span,.hidden li span{display:grid}.confirmed small,.hidden small{font-size:var(--text-sm)}.hidden summary{cursor:pointer;font-weight:600}.hidden form{align-self:center}.privacy{font-size:var(--text-sm)}.empty{padding:1rem;color:var(--ink-muted)}
	@media(max-width:650px){.facts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:450px){.totals{grid-template-columns:1fr}.candidate header{display:block}.confirmed li,.hidden li{align-items:start}}
</style>
