<script lang="ts">
	import { formatNumber } from '$lib/utils/money';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const totalHits = $derived(data.rules.reduce((sum, rule) => sum + rule.matchCount, 0));
	const savedCalls = $derived(data.rules.reduce((sum, rule) => sum + rule.savedLlmCalls, 0));
</script>

<svelte:head><title>กฎหมวดหมู่ที่จำ · Nudget</title></svelte:head>

<section class="head"><div><p class="eyebrow">ตั้งค่าการจำของบัญชีนี้</p><h1>ร้านค้าและหมวดหมู่ที่จำ</h1><p>เมื่อแก้หมวดรายการหรือยืนยันสลิป Nudget จะจำคำนั้นให้บัญชีนี้เท่านั้น</p></div></section>

<section class="stats">
	<article class="card"><span>คำที่จำไว้</span><strong>{data.rules.length}</strong></article>
	<article class="card"><span>ใช้กฎแล้ว</span><strong>{formatNumber(totalHits)}</strong></article>
	<article class="card"><span>ครั้งที่ไม่ต้องเรียก AI fallback</span><strong>{formatNumber(savedCalls)}</strong></article>
</section>

<p class="note">ระบบบันทึกเฉพาะคำที่ชัดเจนอย่างน้อย 3 ตัวอักษร ไม่เรียนรู้คำสั้นหรือคำกำกวมโดยอัตโนมัติ การนับครั้งที่ประหยัดเพิ่มเฉพาะตอนกฎช่วยแทนการเรียก AI ได้จริง</p>

{#if form?.message}<p class="message" role="alert">{form.message}</p>{/if}

{#if data.rules.length}
	<section class="rules" aria-label="กฎหมวดหมู่ที่จำไว้">
		{#each data.rules as rule (rule.id)}
			<article class="card rule">
				<form method="POST" action="?/update" class="edit">
					<input type="hidden" name="id" value={rule.id} />
					<label>คำที่จำ<input name="keyword" value={rule.keyword} minlength="3" maxlength="64" required /></label>
					<label>หมวดหมู่<select name="categoryId" value={rule.categoryId}>{#each data.categories.filter((category) => category.kind === rule.kind) as category (category.id)}<option value={category.id}>{category.icon} {category.nameTh}</option>{/each}</select></label>
					<div class="usage"><span>พบ {formatNumber(rule.matchCount)} ครั้ง</span><span>ประหยัด AI {formatNumber(rule.savedLlmCalls)} ครั้ง</span></div>
					<button class="save">บันทึก</button>
				</form>
				<form method="POST" action="?/delete" onsubmit={(event) => !confirm(`ลบกฎ “${rule.keyword}” ใช่ไหม` ) && event.preventDefault()}><input type="hidden" name="id" value={rule.id} /><button class="delete">ลบ</button></form>
			</article>
		{/each}
	</section>
{:else}
	<section class="card empty"><strong>ยังไม่มีคำที่จำไว้</strong><p>แก้หมวดของรายการในเว็บ หรือยืนยันหมวดสลิปใน LINE แล้ว Nudget จะจำคำที่ชัดเจนให้เอง</p></section>
{/if}

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.note{color:var(--ink-muted)}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}.stats article{display:grid;gap:.25rem;padding:1rem}.stats span,.usage{color:var(--ink-muted);font-size:var(--text-sm)}.stats strong{font-size:1.4rem}.note{padding:.8rem 1rem;border:1px solid var(--rule);border-radius:var(--radius);font-size:var(--text-sm);line-height:1.55}.rules{display:grid;gap:.75rem;margin-top:1rem}.rule{display:flex;justify-content:space-between;align-items:end;gap:1rem;padding:1rem}.edit{display:grid;grid-template-columns:minmax(10rem,1fr) minmax(12rem,1fr) auto auto;align-items:end;gap:.75rem;flex:1}.edit label{display:grid;gap:.3rem;color:var(--ink-muted);font-size:var(--text-sm)}input,select{width:100%;min-width:0;padding:.55rem .65rem;border:1px solid var(--rule);border-radius:.5rem;background:var(--paper);color:var(--ink);font:inherit}.usage{display:grid;gap:.15rem;white-space:nowrap}.save,.delete{padding:.55rem .8rem;border:1px solid var(--rule);border-radius:.5rem;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer}.save{border-color:var(--accent);background:var(--accent);color:white}.delete{color:var(--out)}.message{padding:.7rem 1rem;border-radius:.5rem;background:color-mix(in oklch,var(--out) 10%,var(--paper));color:var(--out)}.empty{padding:1.5rem;margin-top:1rem}.empty p{margin:.4rem 0 0;color:var(--ink-muted)}
	@media(max-width:760px){.stats{grid-template-columns:1fr}.rule{align-items:stretch}.edit{grid-template-columns:1fr 1fr}.usage{grid-column:1/-1}.save{grid-column:2}}
	@media(max-width:450px){.edit{grid-template-columns:1fr}.usage,.save{grid-column:auto}.rule{flex-direction:column}}
</style>
