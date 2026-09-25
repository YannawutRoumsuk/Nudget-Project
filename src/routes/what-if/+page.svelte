<script lang="ts">
	import { page } from '$app/state';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { formatNumber } from '$lib/utils/money';
	import type { WhatIfChange, WhatIfResult } from '$lib/what-if';
	import type { PageData, ActionData } from './$types';

	interface ActionView { changes?: WhatIfChange[]; result?: WhatIfResult | null; message?: string | null }
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const view = $derived((form as ActionView | null) ?? {});
	const changes = $derived(view.changes ?? data.changes);
	const result = $derived(view.result ?? (view.changes ? null : data.result));
	const changesJson = $derived(JSON.stringify(changes));
	const selectedDraft = $derived(Number(page.url.searchParams.get('draft')) || null);
	const categoryName = (id: string) => data.categories.find((category) => category.id === id)?.nameTh ?? id;
	const changeLabel = (change: WhatIfChange) => {
		if (change.type === 'transaction') return `${change.kind === 'income' ? 'รายรับสมมติ' : 'รายจ่ายสมมติ'} ฿${formatNumber(change.amount)} · ${categoryName(change.categoryId)}${change.note ? ` · ${change.note}` : ''}`;
		if (change.type === 'savings') return `ตั้งเป้าออม ฿${formatNumber(change.amount)}`;
		if (change.type === 'categoryBudget') return `ลดงบ ${categoryName(change.categoryId)} ฿${formatNumber(change.amount)}`;
		return `เลื่อนบิล ${data.dueThisMonth.find((bill) => bill.id === change.billId)?.name ?? 'รายการ'} ${change.days} วัน`;
	};
	const appliesToPlan = (change: WhatIfChange) => change.type !== 'postponeBill';
	const canApplySavedDraft = $derived(Boolean(data.draft && JSON.stringify(changes) === JSON.stringify(data.changes)));
</script>

<svelte:head><title>ทดลองแผน · Nudget</title></svelte:head>

<section class="head">
	<div><p class="eyebrow">วางแผน</p><h1>ทดลองแผน What-if</h1><p>ลองตัวเลขก่อนตัดสินใจ ข้อมูลจริงจะไม่เปลี่ยนจนกว่าจะเลือกนำไปใช้</p></div>
	<MonthNavigator month={data.month} />
</section>

{#if data.applied}<p class="notice success">นำการเปลี่ยนแปลงที่เลือกไปใส่แผนเดือน {data.month.key} แล้ว ({data.applied} รายการ) · <a href={`/plan?month=${data.month.key}`}>เปิดแผนเดือน</a></p>{/if}
{#if view.message}<p class="notice error" role="alert">{view.message}</p>{/if}

<section class="card saved">
	<div><h2>ฉบับร่างที่บันทึกไว้</h2><p>ฉบับร่างเป็นเพียงการทดลอง ยังไม่แก้แผนหรือรายการจริง</p></div>
	{#if data.saved.length}
		<div class="draft-list">
			{#each data.saved as draft (draft.id)}
				<div class="draft" class:current={draft.id === selectedDraft}>
					<a href={`/what-if?month=${data.month.key}&draft=${draft.id}`}><strong>{draft.name}</strong><small>{draft.month} · {draft.changes.length} สมมติฐาน</small></a>
					<form method="POST" action="?/deleteDraft"><input type="hidden" name="draftId" value={draft.id} /><button aria-label={`ลบฉบับร่าง ${draft.name}`}>ลบ</button></form>
				</div>
			{/each}
		</div>
	{/if}
</section>

<section class="card builder">
	<h2>เพิ่มสมมติฐาน</h2>
	<p class="hint">เพิ่มได้รวมไม่เกิน 20 ข้อ · รายจ่ายสมมติถือว่าจ่ายจากเงินสด · การเลื่อนบิลเปลี่ยนเฉพาะผลจำลอง</p>
	<div class="forms">
		<form method="POST" action="?/addTransaction">
			<input type="hidden" name="changes" value={changesJson} />
			<h3>เพิ่มรายรับหรือรายจ่าย</h3>
			<label>ประเภท<select name="kind"><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select></label>
			<label>ยอดเงิน<input name="amount" type="number" min="0.01" step="0.01" required /></label>
			<label>หมวดหมู่<select name="categoryId" required>{#each data.categories as category (category.id)}<option value={category.id}>{category.nameTh} · {category.kind === 'income' ? 'รายรับ' : 'รายจ่าย'}</option>{/each}</select></label>
			<label>รายละเอียด<input name="note" maxlength="120" placeholder="ไม่บังคับ" /></label>
			<button type="submit" disabled={changes.length >= 20}>เพิ่มในแบบจำลอง</button>
		</form>
		<form method="POST" action="?/addSavings">
			<input type="hidden" name="changes" value={changesJson} />
			<h3>เปลี่ยนเป้าหมายออม</h3>
			<label>เป้าออมใหม่เดือนนี้<input name="amount" type="number" min="0" step="0.01" value={data.planValues.savingsGoal} required /></label>
			<p class="hint">ใส่ค่าเป้าของเดือนนี้ตามแผน; เงินยกยอดจากเดือนก่อนจะคงเดิม</p>
			<button type="submit" disabled={changes.length >= 20}>ทดลองเป้าออมนี้</button>
		</form>
		<form method="POST" action="?/addBudget">
			<input type="hidden" name="changes" value={changesJson} />
			<h3>ลดงบหมวด</h3>
			<label>หมวด<select name="categoryId">{#each data.categories.filter((category) => category.kind === 'expense') as category (category.id)}<option value={category.id}>{category.nameTh}</option>{/each}</select></label>
			<label>ลดงบลง<input name="amount" type="number" min="0.01" step="0.01" required /></label>
			<button type="submit" disabled={changes.length >= 20}>ทดลองลดงบ</button>
		</form>
		<form method="POST" action="?/addPostpone">
			<input type="hidden" name="changes" value={changesJson} />
			<h3>เลื่อนบิลในแบบจำลอง</h3>
			{#if data.dueThisMonth.length}
				<label>บิลค้าง<select name="billId">{#each data.dueThisMonth as bill (bill.id)}<option value={bill.id}>{bill.name} · ฿{formatNumber(bill.amount)}</option>{/each}</select></label>
				<label>เลื่อนไปอีก<input name="days" type="number" min="1" max="31" step="1" value="7" required /> วัน</label>
			{:else}<p>ไม่มีบิลค้างในเดือนนี้</p>{/if}
			<button type="submit" disabled={!data.dueThisMonth.length || changes.length >= 20}>ทดลองเลื่อนบิล</button>
		</form>
	</div>
</section>

{#if changes.length}
	<section class="card changes">
		<div class="section-title"><div><h2>สมมติฐาน ({changes.length}/20)</h2><p>แต่ละข้อคำนวณร่วมกันในเดือน {data.month.key}</p></div>
			<form method="POST" action="?/simulate"><input type="hidden" name="changes" value={changesJson} /><button class="primary">คำนวณใหม่</button></form>
		</div>
		<ul>{#each changes as change (change.id)}
			<li><span>{changeLabel(change)}</span><form method="POST" action="?/removeChange"><input type="hidden" name="changes" value={changesJson} /><input type="hidden" name="changeId" value={change.id} /><button aria-label="เอาสมมติฐานออก">เอาออก</button></form></li>
		{/each}</ul>
	</section>
{/if}

{#if result}
	<section class="card results">
		<div class="section-title"><div><p class="eyebrow">ผลคำนวณ</p><h2>เทียบก่อนและหลัง</h2></div></div>
		<div class="comparison">
			<div class="measure"><span>เงินเหลือใช้ได้ตามแผน</span><div><strong>฿{formatNumber(result.before.analysis.remaining)}</strong><b>→</b><strong class:negative={result.after.analysis.remaining < 0}>฿{formatNumber(result.after.analysis.remaining)}</strong></div></div>
			<div class="measure"><span>ใช้ได้เฉลี่ยต่อวัน</span><div><strong>฿{formatNumber(result.before.analysis.safeDaily)}</strong><b>→</b><strong class:negative={result.after.analysis.safeDaily < 0}>฿{formatNumber(result.after.analysis.safeDaily)}</strong></div></div>
			<div class="measure"><span>อัตราออมตามเป้า <small>(เป้าออม ÷ รายรับคาดการณ์)</small></span><div><strong>{formatNumber(result.before.savingsRate)}%</strong><b>→</b><strong>{formatNumber(result.after.savingsRate)}%</strong></div></div>
		</div>
		<p class="hint">เงินเหลือและค่าเฉลี่ยต่อวันใช้สูตรเดียวกับหน้าแผนเดือน; ค่าเฉลี่ยหารด้วยวันที่เหลือของเดือน อัตราออมเป็นเป้าหมายที่ตั้งไว้เทียบกับรายรับคาดการณ์</p>
		<div class="over-budget"><div><h3>หมวดเกินงบจริง</h3><p>ก่อน: {result.before.overBudget.length ? result.before.overBudget.map(categoryName).join('、') : 'ไม่มี'}</p><p>หลัง: {result.after.overBudget.length ? result.after.overBudget.map(categoryName).join('、') : 'ไม่มี'}</p></div>
			<div><h3>งบรายหมวดหลังทดลอง</h3>{#each result.after.categories.filter((row) => row.budget > 0) as row (row.categoryId)}<p>{categoryName(row.categoryId)} · เหลือ ฿{formatNumber(row.remaining)}</p>{/each}</div>
		</div>
		{#if result.postponedBills.length}<p class="hint">วันที่บิลในแบบจำลอง: {#each result.postponedBills as moved, i (moved.billId)}{#if i}, {/if}{data.dueThisMonth.find((bill) => bill.id === moved.billId)?.name} {moved.from.toLocaleDateString('th-TH')} → {moved.to.toLocaleDateString('th-TH')}{/each}. ยังไม่มีการแก้วันครบกำหนดจริง</p>{/if}
	</section>
{/if}

<section class="card draft-actions">
	<h2>บันทึกหรือใช้ผลจำลอง</h2>
	<form method="POST" action="?/saveDraft" class="save-form">
		<input type="hidden" name="month" value={data.month.key} /><input type="hidden" name="changes" value={changesJson} />
		{#if data.draft}<input type="hidden" name="draftId" value={data.draft.id} />{/if}
		<label>ชื่อฉบับร่าง<input name="name" maxlength="80" value={data.draft?.name ?? ''} placeholder="เช่น ถ้าลดค่าใช้จ่าย 1,000" required /></label>
		<button type="submit" disabled={!changes.length}>บันทึกฉบับร่าง</button>
	</form>
	{#if data.draft && changes.length && canApplySavedDraft}
		<form method="POST" action="?/applySelected" class="apply-form">
			<input type="hidden" name="draftId" value={data.draft.id} />
			<h3>เลือกส่วนที่จะบันทึกลงแผนจริง</h3>
			{#each changes as change (change.id)}
				<label class:disabled={!appliesToPlan(change)}><input type="checkbox" name="applyId" value={change.id} disabled={!appliesToPlan(change)} />{changeLabel(change)}{#if change.type === 'transaction' && change.kind === 'expense'} <small>(เพิ่มงบหมวดให้รองรับ)</small>{:else if change.type === 'postponeBill'} <small>(ทดลองอย่างเดียว)</small>{/if}</label>
			{/each}
			<p class="hint">รายรับสมมติจะเพิ่มรายรับคาดการณ์ · รายจ่ายสมมติจะเพิ่มงบหมวด · เป้าออมและการลดงบจะเขียนค่าที่เลือกลงแผน โดยไม่สร้าง transaction</p>
			<button class="primary">นำส่วนที่เลือกไปใช้จริง</button>
		</form>
	{:else if data.draft && changes.length}<p class="hint">มีการแก้สมมติฐานหลังบันทึก กด “บันทึกฉบับร่าง” ก่อนนำไปใช้จริง</p>{/if}
</section>

<style>
	.head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:not(.eyebrow){color:var(--ink-muted);margin-top:.25rem}
	.card{padding:1.1rem;margin-bottom:var(--stack)}h2{font-size:var(--text-lg)}h3{font-size:var(--text-base);margin:0 0 .7rem}.hint,.saved p,.section-title p,.draft small{color:var(--ink-muted);font-size:var(--text-sm)}
	.forms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin-top:1rem}.forms form{display:grid;align-content:start;gap:.55rem;border:1px solid var(--rule);border-radius:var(--radius);padding:.9rem}.forms label,.save-form label{display:grid;gap:.25rem;font-size:var(--text-sm)}input,select,button{font:inherit}.forms input,.forms select,.save-form input{min-height:2.5rem;padding:.45rem .55rem;border:1px solid var(--rule-strong);border-radius:var(--radius-sm);background:var(--paper-raised)}button{justify-self:start;padding:.55rem .8rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised);color:var(--ink);cursor:pointer}button.primary{background:var(--ink);color:var(--paper-raised)}button:disabled{opacity:.5;cursor:not-allowed}
	.draft-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin-top:.8rem}.draft{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.65rem;border:1px solid var(--rule);border-radius:var(--radius)}.draft.current{border-color:var(--accent)}.draft a{display:grid}.draft button,.changes li button{padding:.3rem .55rem;font-size:var(--text-sm)}
	.section-title,.measure div{display:flex;align-items:center;justify-content:space-between;gap:.8rem}.changes ul{margin-top:.8rem}.changes li{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--rule)}
	.comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin:1rem 0}.measure{padding:.8rem;background:var(--paper-sunken);border-radius:var(--radius)}.measure>span{display:block;color:var(--ink-muted);font-size:var(--text-sm)}.measure>div{justify-content:flex-start;margin-top:.4rem}.measure strong{font-variant-numeric:tabular-nums}.measure b{color:var(--ink-faint)}.measure small{display:block}.negative{color:var(--out)}
	.over-budget{display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding-top:.8rem}.over-budget p{margin-top:.3rem}.save-form{display:flex;align-items:end;gap:.7rem;flex-wrap:wrap;margin-top:.8rem}.save-form label{flex:1;min-width:16rem}.apply-form{display:grid;gap:.55rem;margin-top:1.2rem}.apply-form label{display:flex;align-items:center;gap:.45rem}.apply-form label.disabled{color:var(--ink-muted)}.apply-form h3{margin-bottom:0}.notice{padding:.75rem 1rem;border-radius:var(--radius);margin-bottom:var(--stack)}.success{background:var(--in-soft)}.error{background:var(--out-soft);color:var(--out)}
	@media(max-width:700px){.head{display:block}.head :global(.month-nav){margin-top:.8rem}.forms,.draft-list{grid-template-columns:1fr}.comparison{grid-template-columns:1fr}.over-budget{grid-template-columns:1fr}.measure div{justify-content:space-between}}
</style>
