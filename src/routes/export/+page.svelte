<script lang="ts">
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const download = (format: string) => `/export/download?${data.selection.query}&format=${format}`;
</script>

<svelte:head><title>ส่งออกข้อมูล · Nudget</title></svelte:head>

<section class="head">
	<div>
		<p class="eyebrow">ข้อมูลของฉัน</p>
		<h1>ส่งออกข้อมูล</h1>
		<p>เก็บสำเนาหรือเปิดวิเคราะห์ต่อใน Excel และ Google Sheets ได้</p>
	</div>
</section>

{#if data.message}<p class="notice" role="alert">{data.message} — กลับมาแสดงเดือนปัจจุบันแล้ว</p>{/if}

<section class="card filters" aria-label="เลือกช่วงข้อมูล">
	<form method="GET" class="month-form">
		<input type="hidden" name="mode" value="month" />
		<label>เลือกเดือน<input type="month" name="month" value={data.selection.month} required /></label>
		<button type="submit">ดูเดือนนี้</button>
	</form>
	<div class="or" aria-hidden="true">หรือ</div>
	<form method="GET" class="range-form">
		<input type="hidden" name="mode" value="range" />
		<label>ตั้งแต่<input type="date" name="from" value={data.selection.from} required /></label>
		<label>ถึง<input type="date" name="to" value={data.selection.to} required /></label>
		<button type="submit">ดูช่วงวันที่</button>
	</form>
</section>

<section class="summary" aria-label="สรุปข้อมูลที่จะส่งออก">
	<article class="card"><span>รายการ</span><strong class="num">{data.summary.transactionCount}</strong></article>
	<article class="card"><span>รายรับ</span><strong class="num in">฿{formatNumber(Number(data.summary.income))}</strong></article>
	<article class="card"><span>รายจ่าย</span><strong class="num out">฿{formatNumber(Number(data.summary.expense))}</strong></article>
	<article class="card"><span>บิลที่บันทึกไว้</span><strong class="num">{data.summary.billCount}</strong></article>
</section>

<section class="downloads">
	<article class="card download-card">
		<div><p class="eyebrow">Spreadsheet</p><h2>รายการรับจ่าย CSV</h2><p>เฉพาะรายการที่เกิดในช่วง {data.selection.from} ถึง {data.selection.to}</p></div>
		<a class="download" href={download('transactions.csv')}>ดาวน์โหลด CSV</a>
	</article>
	<article class="card download-card">
		<div><p class="eyebrow">Spreadsheet</p><h2>บิล CSV</h2><p>บิลทั้งหมด {data.summary.billCount} รายการ เพื่อเก็บตารางจ่ายประจำไว้ครบ</p></div>
		<a class="download" href={download('bills.csv')}>ดาวน์โหลด CSV</a>
	</article>
	<article class="card download-card featured">
		<div><p class="eyebrow">สำเนาโครงสร้างเต็ม</p><h2>ข้อมูล JSON</h2><p>รวมรายการ บิล การชำระ {data.paymentCount} รายการ และแผนรายเดือน {data.planCount} เดือน โดยตัด LINE ID และข้อความดิบออก</p></div>
		<a class="download" href={download('json')}>ดาวน์โหลด JSON</a>
	</article>
</section>

<p class="privacy">ไฟล์สร้างเมื่อกดดาวน์โหลดและไม่ถูกเก็บเป็นไฟล์สาธารณะ วันเวลาใช้ Asia/Bangkok และ CSV มี UTF-8 BOM สำหรับภาษาไทย</p>

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.download-card p,.privacy{color:var(--ink-muted)}
	.notice{margin-bottom:var(--stack);padding:.65rem .85rem;color:var(--out);background:var(--accent-soft);border-radius:var(--radius)}
	.filters{display:flex;align-items:end;gap:1rem;padding:1rem;margin-bottom:var(--stack-lg)}
	.filters form{display:flex;align-items:end;gap:.65rem;flex:1}.filters label{display:grid;gap:.25rem;flex:1;font-size:var(--text-xs);font-weight:600}
	.filters input{width:100%;min-width:0;padding:.55rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}
	.filters button,.download{display:inline-flex;justify-content:center;align-items:center;min-height:2.6rem;padding:.55rem .85rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);font-weight:600;cursor:pointer;white-space:nowrap}
	.or{padding-bottom:.7rem;color:var(--ink-faint);font-size:var(--text-sm)}
	.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-bottom:var(--stack-lg)}.summary article{display:grid;gap:.25rem;padding:1rem}.summary span{font-size:var(--text-sm);color:var(--ink-muted)}.summary strong{font-size:1.35rem}.in{color:var(--in)}.out{color:var(--out)}
	.downloads{display:grid;gap:.8rem}.download-card{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.15rem}.download-card h2{font-size:1.08rem}.download-card p:last-child{margin-top:.25rem;font-size:var(--text-sm)}.featured{border-color:color-mix(in oklch,var(--accent) 35%,var(--rule))}.featured .download{background:var(--accent)}
	.privacy{margin-top:1rem;font-size:var(--text-xs)}
	@media(max-width:800px){.filters{align-items:stretch;flex-direction:column}.or{padding:0;align-self:center}.summary{grid-template-columns:repeat(2,1fr)}}
	@media(max-width:560px){.filters form,.download-card{align-items:stretch;flex-direction:column}.range-form{display:grid!important;grid-template-columns:1fr 1fr}.range-form button{grid-column:1/-1}.summary{grid-template-columns:1fr 1fr}}
</style>
