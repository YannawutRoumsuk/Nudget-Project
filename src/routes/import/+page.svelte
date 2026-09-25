<script lang="ts">
	import { page } from '$app/state';
	import { IMPORT_FIELDS } from '$lib/csv-import';
	import type { ImportField, ImportMapping, ImportRowResult } from '$lib/csv-import';
	import type { PageData, ActionData } from './$types';

	interface DisplayRow extends ImportRowResult { duplicate?: boolean }
	interface StageData {
		stage?: 'mapping' | 'preview' | 'error';
		message?: string;
		csvText?: string;
		fileName?: string;
		headers?: string[];
		mapping?: ImportMapping;
		rows?: DisplayRow[];
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const state = $derived((form as StageData | null) ?? {});
	const labels: Record<ImportField, string> = {
		date: 'วันที่ *', amount: 'ยอดเงิน *', kind: 'ประเภท *', note: 'รายละเอียด', paymentMethod: 'วิธีจ่าย', category: 'หมวดหมู่ *'
	};
	const required = new Set<ImportField>(['date', 'amount', 'kind', 'category']);
	const fields = IMPORT_FIELDS;
	const successes = $derived(state.rows?.filter((row) => row.transaction).length ?? 0);
	const invalid = $derived(state.rows?.filter((row) => !row.transaction).length ?? 0);
	const duplicates = $derived(state.rows?.filter((row) => row.duplicate).length ?? 0);
	const imported = $derived(Number(page.url.searchParams.get('inserted') ?? 0));
	const skipped = $derived(Number(page.url.searchParams.get('duplicates') ?? 0));
	const mappingValue = (field: ImportField) => state.mapping?.[field] === undefined ? '' : String(state.mapping[field]);
</script>

<svelte:head><title>นำเข้า CSV · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">จัดการข้อมูล</p>
	<h1>นำเข้ารายการจาก CSV</h1>
	<p class="lede">อัปโหลด → จับคู่คอลัมน์ → ตรวจรายการ → ยืนยันนำเข้า ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะกดยืนยัน</p>
</section>

{#if page.url.searchParams.has('inserted')}
	<p class="notice success">นำเข้าแล้ว {imported} รายการ{#if skipped} · ข้ามรายการซ้ำ {skipped} รายการ{/if}</p>
{/if}
{#if state.message}<p class="notice error" role="alert">{state.message}</p>{/if}

<section class="card upload">
	<h2>1. เลือกไฟล์</h2>
	<p>รองรับ CSV UTF-8 ขนาดไม่เกิน 256 KB และไม่เกิน 500 รายการต่อครั้ง</p>
	<form method="POST" action="?/upload" enctype="multipart/form-data">
		<label for="file">ไฟล์ .csv</label>
		<input id="file" name="file" type="file" accept=".csv,text/csv" required />
		<button class="primary" type="submit">อ่านหัวตาราง</button>
	</form>
	<a href="/import/template">ดาวน์โหลดไฟล์ตัวอย่าง CSV</a>
	<p class="format">รูปแบบวันที่: <code>YYYY-MM-DD</code> หรือ <code>DD/MM/YYYY</code> · ประเภท: <code>expense</code>/<code>income</code> · หมวดใช้รหัสหรือชื่อหมวด</p>
</section>

{#if state.stage === 'mapping' || state.stage === 'preview'}
	<section class="card flow">
		<h2>2. จับคู่คอลัมน์ใน {state.fileName}</h2>
		{#if state.stage === 'mapping'}<p>เลือกว่าคอลัมน์ไหนเก็บข้อมูลแต่ละแบบ ระบบเลือกให้เบื้องต้นจากชื่อหัวตาราง</p>{/if}
		<form method="POST" action="?/preview" enctype="multipart/form-data">
			<input type="hidden" name="csvText" value={state.csvText ?? ''} />
			<input type="hidden" name="fileName" value={state.fileName ?? ''} />
			<div class="mapping">
				{#each fields as field (field)}
					<label>
						<span>{labels[field]}</span>
						<select name={`mapping_${field}`} required={required.has(field)} value={mappingValue(field)}>
							<option value="">{required.has(field) ? 'เลือกคอลัมน์' : 'ไม่ระบุ'}</option>
							{#each state.headers ?? [] as header, index (`${field}-${index}`)}
								<option value={index}>{header || `คอลัมน์ ${index + 1}`}</option>
							{/each}
						</select>
					</label>
				{/each}
			</div>
			<button class="primary" type="submit">{state.stage === 'preview' ? 'อัปเดตตัวอย่าง' : 'ตรวจสอบรายการ'}</button>
			{#if state.stage === 'preview'}
				<div class="summary" aria-live="polite">
					<strong>ผ่าน {successes}</strong><span>ผิดรูปแบบ {invalid}</span><span>ซ้ำ {duplicates}</span>
				</div>
				{#if duplicates > 0}
					<label class="include"><input type="checkbox" name="includeDuplicates" /> นำรายการซ้ำเข้ามาด้วย</label>
					<p class="hint">ค่าเริ่มต้นจะข้ามรายการที่ตรงกับข้อมูลเดิม การเลือกนี้จะนำรายการซ้ำเข้าเพิ่มอย่างชัดเจน</p>
				{/if}
				<div class="table-wrap">
					<table>
						<thead><tr><th>แถว</th><th>วันที่</th><th>รายการ</th><th>ยอด</th><th>สถานะ</th></tr></thead>
						<tbody>
							{#each state.rows ?? [] as row (row.rowNumber)}
								<tr class:bad={!row.transaction}>
									<td>{row.rowNumber}</td>
									{#if row.transaction}
										<td>{row.transaction.day}</td>
										<td>{data.categories.find((item) => item.id === row.transaction?.categoryId)?.nameTh} · {row.transaction.note || 'ไม่มีรายละเอียด'}</td>
										<td>{row.transaction.amount}</td>
										<td>{row.duplicate ? 'ซ้ำ' : 'พร้อม'}</td>
									{:else}
										<td colspan="3">{row.error}</td><td>แก้ไข</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<button class="primary" formaction="?/import" type="submit" disabled={successes === 0 || invalid > 0}>
					ยืนยันนำเข้ารายการที่ผ่าน {successes} รายการ
				</button>
			{/if}
		</form>
	</section>
{/if}

<section class="card guide">
	<h2>คอลัมน์ที่ใช้</h2>
	<p>ต้องมีวันที่, ยอดเงิน, ประเภท และหมวดหมู่ ส่วนรายละเอียดกับวิธีจ่ายเลือกเว้นได้ (จะใช้ “ไม่ระบุ” และ “โอน/บัญชี”)</p>
	<p>ตัวอย่าง: <code>2026-09-25,120,expense,"ข้าวกลางวัน",cash,food</code></p>
	<p>หมวดหมู่ใช้รหัส เช่น <code>food</code> หรือชื่อไทย เช่น <code>อาหาร</code>; วิธีจ่ายใช้ <code>bank</code>, <code>cash</code>, <code>credit_card</code>, <code>shopee_paylater</code>, <code>wallet</code></p>
</section>

<style>
	.head { margin-bottom: var(--stack); }
	h1 { font-size: var(--text-xl); }
	.lede, .upload p, .flow > p, .guide p, .hint, .format { color: var(--ink-muted); }
	.card { padding: 1.15rem; margin-bottom: var(--stack); }
	h2 { font-size: var(--text-lg); margin-bottom: .55rem; }
	.upload form { display: flex; align-items: end; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
	.upload form label { display: grid; gap: .35rem; }
	input, select, button { font: inherit; }
	input[type=file], select { min-height: 2.6rem; padding: .45rem; border: 1px solid var(--rule); border-radius: .55rem; background: var(--paper-raised); color: var(--ink); }
	button { min-height: 2.6rem; padding: .5rem .9rem; border: 1px solid var(--rule); border-radius: .55rem; background: var(--paper-raised); color: var(--ink); cursor: pointer; }
	button.primary { color: white; background: var(--accent); border-color: var(--accent); font-weight: 650; }
	button:disabled { opacity: .5; cursor: not-allowed; }
	.mapping { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; margin: 1rem 0; }
	.mapping label { display: grid; gap: .35rem; }
	.summary { display: flex; gap: 1.1rem; flex-wrap: wrap; margin: 1.2rem 0 .65rem; }
	.include { display: flex; align-items: center; gap: .5rem; margin-top: .8rem; }
	.table-wrap { max-height: 28rem; overflow: auto; margin: .75rem 0 1rem; border: 1px solid var(--rule); border-radius: .55rem; }
	table { width: 100%; border-collapse: collapse; }
	th, td { padding: .55rem; text-align: left; border-bottom: 1px solid var(--rule); }
	th { position: sticky; top: 0; background: var(--paper-raised); }
	.bad { color: var(--out); }
	.notice { padding: .8rem 1rem; border-radius: .55rem; margin-bottom: 1rem; }
	.success { background: color-mix(in oklch, var(--in) 14%, var(--paper)); }
	.error { color: var(--out); background: color-mix(in oklch, var(--out) 12%, var(--paper)); }
	.format, .hint { font-size: .9rem; }
	@media (max-width: 42rem) { .mapping { grid-template-columns: 1fr 1fr; } }
	@media (max-width: 28rem) { .mapping { grid-template-columns: 1fr; } }
</style>
