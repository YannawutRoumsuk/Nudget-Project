<script lang="ts">
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const cash = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${formatNumber(value)} บาท`;
	const detailHref = $derived(`/report?month=${encodeURIComponent(data.month.key)}&privacy=${data.privacyMode ? '0' : '1'}`);
	const categories = $derived(data.categories);

	function downloadPng() {
		const width = 1080;
		const categoryHeight = categories.length ? 130 + categories.length * 100 : 0;
		const insightHeight = data.insight ? 260 : 0;
		const canvas = document.createElement('canvas');
		const metrics: Array<[string, string]> = [
			['รายรับ', cash(data.input.income)], ['รายจ่าย', cash(data.input.expense)],
			['เงินคงเหลือ', cash(data.input.net)], ['อัตราเงินเหลือ', data.input.savingsRate === null ? '—' : `${Math.round(data.input.savingsRate)}%`],
			['เงินออมที่เหลือหลังจ่าย', cash(data.input.savings)],
			['ค่าเช่าและบิลที่จ่ายแล้ว', cash(data.input.fixedExpense)], ['เงินใช้ชีวิต', cash(data.input.regularExpense)],
			['อาหาร · เฉลี่ย/วัน', `${cash(data.input.foodExpense)} · ${cash(data.input.foodDailyAverage)}`],
			['เดินทาง · เฉลี่ย/วัน', `${cash(data.input.transportExpense)} · ${cash(data.input.transportDailyAverage)}`],
			['บิลค้างจ่ายเดือนนี้', cash(data.input.unpaidBills)], ['ภาระบิลเดือนหน้า', cash(data.input.nextMonthBills)],
			['ใช้บัตรเครดิตเดือนนี้', cash(data.input.creditCardSpent)], ['ใช้ Shopee PayLater', cash(data.input.payLaterSpent)],
			['งบตามแผนรวม', cash(data.budgetTotal)], ['เกินงบรายหมวดรวม', data.budgetOver === null ? 'ยังไม่มีงบรายหมวด' : cash(data.budgetOver)]
		];
		const height = 300 + Math.ceil(metrics.length / 2) * 156 + categoryHeight + insightHeight + 100;
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#f5f1e8'; ctx.fillRect(0, 0, width, height);
		ctx.fillStyle = '#173f38'; ctx.fillRect(0, 0, width, 22);
		ctx.fillStyle = '#173f38'; ctx.font = '700 56px system-ui, sans-serif'; ctx.fillText('Nudget', 72, 112);
		ctx.fillStyle = '#63716a'; ctx.font = '32px system-ui, sans-serif'; ctx.fillText(`รายงานสรุปการเงิน · ${data.month.label}`, 72, 166);
		ctx.fillStyle = '#75817a'; ctx.font = '24px system-ui, sans-serif'; ctx.fillText(data.privacyMode ? 'โหมดความเป็นส่วนตัว · แสดงเฉพาะยอดรวม' : 'รายงานส่วนตัว · แสดงยอดรวมและหมวดรายจ่าย', 72, 210);
		let y = 250;
		for (let index = 0; index < metrics.length; index++) {
			const column = index % 2;
			const row = Math.floor(index / 2);
			const x = 64 + column * 486;
			const top = y + row * 156;
			roundCard(ctx, x, top, 450, 132);
			ctx.fillStyle = '#75817a'; ctx.font = '25px system-ui, sans-serif'; ctx.fillText(metrics[index][0], x + 26, top + 42);
			ctx.fillStyle = '#202d28'; ctx.font = '700 32px system-ui, sans-serif'; ctx.fillText(metrics[index][1], x + 26, top + 94, 395);
		}
		y += Math.ceil(metrics.length / 2) * 156 + 14;

		if (categories.length) {
			roundCard(ctx, 64, y, 952, categoryHeight - 24);
			ctx.fillStyle = '#202d28'; ctx.font = '700 34px system-ui, sans-serif'; ctx.fillText('หมวดรายจ่ายเด่น', 96, y + 58);
			const max = Math.max(1, ...categories.map((row) => row.amount));
			categories.forEach((row, index) => {
				const top = y + 110 + index * 100;
				ctx.fillStyle = '#34463d'; ctx.font = '26px system-ui, sans-serif'; ctx.fillText(row.label, 96, top + 5, 350);
				ctx.textAlign = 'right'; ctx.fillText(`${formatNumber(row.amount)} บาท`, 980, top + 5); ctx.textAlign = 'left';
				ctx.fillStyle = '#e4e9e1'; ctx.fillRect(96, top + 24, 884, 16);
				ctx.fillStyle = '#386c5a'; ctx.fillRect(96, top + 24, Math.max(8, 884 * row.amount / max), 16);
				ctx.fillStyle = '#75817a'; ctx.font = '20px system-ui, sans-serif';
				ctx.fillText(row.budget === null ? 'ยังไม่ได้ตั้งงบหมวดนี้' : `งบ ${formatNumber(row.budget)} บาท`, 96, top + 70);
			});
			y += categoryHeight;
		}
		if (data.insight) {
			roundCard(ctx, 64, y, 952, insightHeight - 24);
			ctx.fillStyle = '#202d28'; ctx.font = '700 32px system-ui, sans-serif'; ctx.fillText(`คำแนะนำจาก AI · ${data.insight.insight.headline}`, 96, y + 58, 860);
			ctx.fillStyle = '#56645d'; ctx.font = '25px system-ui, sans-serif';
			wrapCanvasText(ctx, data.insight.insight.summary, 96, y + 110, 880, 38);
		}
		ctx.fillStyle = '#75817a'; ctx.font = '22px system-ui, sans-serif'; ctx.fillText('สร้างจากยอดรวมใน Nudget · ตรวจสอบข้อมูลก่อนใช้ประกอบการตัดสินใจ', 72, height - 45);
		canvas.toBlob((blob) => {
			if (!blob) return;
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl; link.download = `nudget-${data.month.key}.png`; link.click();
			setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
		}, 'image/png');
	}

	function roundCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
		ctx.fillStyle = '#fffefa'; ctx.strokeStyle = '#e3e0d7'; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
	}

	function wrapCanvasText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, lineHeight: number) {
		let line = '';
		for (const word of value.split(/\s+/)) {
			const next = line ? `${line} ${word}` : word;
			if (ctx.measureText(next).width > maxWidth && line) { ctx.fillText(line, x, y); y += lineHeight; line = word; }
			else line = next;
		}
		if (line) ctx.fillText(line, x, y);
	}
</script>

<svelte:head><title>รายงานประจำเดือน · Nudget</title><meta name="description" content="รายงานการเงินส่วนตัว ดาวน์โหลดเป็น PDF หรือรูปภาพ" /></svelte:head>

<section class="head controls"><div><p class="eyebrow">รายงานส่วนตัว · ไม่บันทึกไฟล์ขึ้นที่สาธารณะ</p><h1>รายงานประจำเดือน</h1></div><MonthNavigator month={data.month} /></section>

<section class="toolbar card controls"><div><strong>{data.privacyMode ? 'โหมดความเป็นส่วนตัวเปิดอยู่' : 'โหมดรายละเอียดเปิดอยู่'}</strong><p>{data.privacyMode ? 'ซ่อนหมวดรายจ่ายและคำแนะนำ AI เหลือเฉพาะยอดรวม' : 'แสดงหมวดรายจ่ายและคำแนะนำ AI ที่มี cache แล้ว โดยไม่แสดงร้านค้า หมายเหตุ หรือรายการดิบ'}</p></div><a class="secondary" href={detailHref}>{data.privacyMode ? 'แสดงรายละเอียด' : 'ซ่อนรายละเอียด'}</a></section>

<div class="actions controls"><button type="button" onclick={() => window.print()}>พิมพ์ / บันทึก PDF</button><button type="button" class="secondary" onclick={downloadPng}>ดาวน์โหลดรูป PNG</button></div>
<p class="print-hint controls">สำหรับ PDF เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์ รูป PNG จะสร้างในเบราว์เซอร์และดาวน์โหลดลงอุปกรณ์โดยตรง</p>

<article class="report card" aria-label={`รายงาน Nudget เดือน ${data.month.label}`}>
	<header class="report-head"><div><p class="eyebrow">Nudget · สรุปการเงิน</p><h2>{data.month.label}</h2></div><span>{data.privacyMode ? '🔒 ยอดรวมเท่านั้น' : 'รายงานส่วนตัว'}</span></header>
	<section class="metrics" aria-label="ยอดรวม">
		<div><span>รายรับ</span><strong>{cash(data.input.income)}</strong></div><div class="expense"><span>รายจ่ายรวม</span><strong>{cash(data.input.expense)}</strong></div>
		<div><span>เงินคงเหลือ</span><strong>{cash(data.input.net)}</strong></div><div><span>เงินออมที่เหลือหลังจ่าย</span><strong>{cash(data.input.savings)}</strong></div>
		<div><span>อัตราเงินเหลือ</span><strong>{data.input.savingsRate === null ? '—' : `${Math.round(data.input.savingsRate)}%`}</strong></div>
	</section>
	<section class="submetrics">
		<div><span>ค่าเช่าและบิลที่จ่ายแล้ว</span><strong>{cash(data.input.fixedExpense)}</strong></div><div><span>เงินใช้ชีวิตปกติ</span><strong>{cash(data.input.regularExpense)}</strong></div>
		<div><span>อาหาร · รวม / เฉลี่ยต่อวัน</span><strong>{cash(data.input.foodExpense)} <small>· {cash(data.input.foodDailyAverage)}/วัน</small></strong></div>
		<div><span>เดินทาง · รวม / เฉลี่ยต่อวัน</span><strong>{cash(data.input.transportExpense)} <small>· {cash(data.input.transportDailyAverage)}/วัน</small></strong></div>
		<div><span>อื่น ๆ · รวม / เฉลี่ยต่อวัน</span><strong>{cash(data.input.otherExpense)} <small>· {cash(data.input.otherDailyAverage)}/วัน</small></strong></div>
		<div><span>บิลค้างเดือนนี้</span><strong>{cash(data.input.unpaidBills)}</strong></div>
		<div><span>ภาระบิลเดือนหน้า</span><strong>{cash(data.input.nextMonthBills)}</strong></div>
		<div><span>ใช้บัตรเครดิตเดือนนี้</span><strong>{cash(data.input.creditCardSpent)}</strong></div>
		<div><span>ใช้ Shopee PayLater เดือนนี้</span><strong>{cash(data.input.payLaterSpent)}</strong></div>
	</section>

	<section class="budget"><h3>งบเทียบกับที่ใช้จริง</h3>{#if data.budgetTotal === null}<p>ยังไม่ได้ตั้งงบรายหมวดสำหรับเดือนนี้</p>{:else}<div><span>งบรายหมวดรวม</span><strong>{cash(data.budgetTotal)}</strong></div><div><span>ยอดเกินงบรวมเฉพาะหมวดที่เกิน</span><strong class:negative={data.budgetOver! > 0}>{cash(data.budgetOver)}</strong></div>{/if}</section>

	{#if !data.privacyMode && categories.length}
		<section class="category-section"><h3>หมวดรายจ่ายเด่น</h3><ul>{#each categories as category (category.id)}<li><div class="category-row"><span>{category.label}</span><strong>{cash(category.amount)}</strong></div><div class="bar"><span style={`width:${Math.max(2, category.amount / categories[0].amount * 100)}%`}></span></div><small>{category.budget === null ? 'ยังไม่ได้ตั้งงบหมวดนี้' : `งบ ${cash(category.budget)}${category.amount > category.budget ? ` · เกิน ${cash(category.amount - category.budget)}` : ''}`}</small></li>{/each}</ul></section>
	{/if}

	{#if !data.privacyMode && data.insight}
		<section class="ai"><p class="eyebrow">บทวิเคราะห์ที่บันทึกไว้ · {data.insight.model}</p><h3>{data.insight.insight.headline}</h3><p>{data.insight.insight.summary}</p>
			{#if data.insight.insight.observations.length}<ul>{#each data.insight.insight.observations as observation}<li>{observation}</li>{/each}</ul>{/if}
			{#if data.insight.insight.savings.length}<h4>แนวทางประหยัด</h4><ul>{#each data.insight.insight.savings as idea}<li>{idea.title} — {idea.detail}{#if idea.monthlySaving > 0} · ประมาณ {cash(idea.monthlySaving)}/เดือน{/if}</li>{/each}</ul>{/if}
			<small>ข้อความ AI เป็นการคาดคะเนจากยอดรวม ไม่ใช่ข้อมูลธุรกรรมดิบ</small>
		</section>
	{:else if !data.privacyMode}
		<section class="ai"><h3>ยังไม่มีบทวิเคราะห์ที่บันทึกไว้</h3><p>รายงานไม่เรียก AI เพิ่ม คุณสามารถวิเคราะห์จากหน้า <a href={`/insights?month=${data.month.key}`}>วิเคราะห์</a> ก่อน แล้วกลับมาสร้างรายงานได้</p></section>
	{/if}
	<footer>สร้างจากข้อมูลยอดรวมใน Nudget · ตรวจสอบบิลและยอดจริงก่อนใช้ประกอบการตัดสินใจ</footer>
</article>

<style>
	.head{display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem;margin-bottom:.8rem}.toolbar p,.print-hint{margin:.25rem 0 0;color:var(--ink-muted);font-size:var(--text-sm)}.secondary{display:inline-block;padding:.6rem .9rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:transparent;color:var(--ink);font:inherit;white-space:nowrap}.actions{display:flex;gap:.6rem;flex-wrap:wrap}.actions button{padding:.7rem 1rem;background:var(--ink);color:var(--paper-raised);border:0;border-radius:var(--radius);font:inherit;font-weight:600;cursor:pointer}.actions .secondary{font-weight:500}.print-hint{margin:0 0 var(--stack)}.report{max-width:58rem;margin:0 auto;padding:clamp(1.1rem,4vw,2.5rem);background:#fffefa;color:#202d28;box-shadow:0 8px 35px #1b322015}.report-head{display:flex;justify-content:space-between;align-items:start;gap:1rem;padding-bottom:1.2rem;border-bottom:2px solid #e8e6df}.report-head h2{font-size:1.65rem;margin:.15rem 0}.report-head>span{font-size:var(--text-sm);color:#65716b}.eyebrow{font-size:var(--text-sm);color:#617169;margin:0}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin:1.2rem 0}.metrics>div,.submetrics>div{display:grid;gap:.35rem;padding:1rem;background:#f5f3ed;border-radius:var(--radius)}.metrics span,.submetrics span{font-size:var(--text-sm);color:#627068}.metrics strong{font-size:1.35rem}.metrics .expense strong,.negative{color:#ad4839}.submetrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.submetrics strong{font-size:var(--text-sm)}.submetrics small{font-size:.8rem;font-weight:400}.budget,.category-section,.ai{margin-top:1.4rem;padding-top:1.1rem;border-top:1px solid #e8e6df}h3{font-size:1.05rem;margin:0 0 .8rem}.budget>div{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0}.budget p{color:#627068}.category-section ul,.ai ul{list-style:none;padding:0;margin:0}.category-section li{padding:.65rem 0;border-bottom:1px solid #eeece6}.category-row{display:flex;justify-content:space-between;gap:1rem}.bar{height:8px;background:#e7ece6;border-radius:8px;margin:.45rem 0}.bar span{display:block;height:100%;background:#386c5a;border-radius:8px}.category-section small,.ai small{font-size:.8rem;color:#68756e}.ai{line-height:1.65}.ai h3{font-size:1.2rem;margin:.2rem 0}.ai h4{margin:.8rem 0 .2rem}.ai li{padding:.25rem 0}.ai a{color:#245e4c}.report footer{margin-top:1.5rem;padding-top:.8rem;border-top:1px solid #e8e6df;color:#68756e;font-size:.8rem}
	@media(max-width:500px){.toolbar{align-items:start;flex-direction:column}.metrics strong{font-size:1.1rem}.report-head h2{font-size:1.3rem}}
	@media print{@page{size:A4;margin:12mm}:global(body){background:#fff!important;color:#111!important}:global(.masthead),:global(.shell>main>.controls){display:none!important}:global(.shell){max-width:none!important;padding:0!important}.report{max-width:none;margin:0;padding:0;box-shadow:none;border:0!important}.metrics>div,.submetrics>div{-webkit-print-color-adjust:exact;print-color-adjust:exact}.category-section,.budget,.ai{break-inside:avoid}.report footer{position:fixed;bottom:0;left:0;right:0}}
</style>
