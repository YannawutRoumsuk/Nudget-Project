<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const stamp = (value: Date | null | undefined) => value
		? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
		: 'ยังไม่มีข้อมูล';
	const stateLabel = (item: { at: Date; success: boolean; errorCode: string | null } | null) =>
		!item ? 'ยังไม่มีข้อมูล' : item.success ? 'ปกติ' : `มีปัญหา (${item.errorCode ?? 'unknown'})`;
	const queueLabels: Record<string, string> = { queued: 'รออ่าน', processing: 'กำลังอ่าน', ready: 'รอยืนยัน', saving: 'กำลังบันทึก', failed: 'อ่านไม่สำเร็จ' };
</script>

<svelte:head><title>สถานะระบบ · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">สำหรับเจ้าของบอท</p>
	<h1>สถานะระบบ</h1>
	<p>ตัวเลขสรุปและเวลาที่ระบบทำงานล่าสุด ข้อความผิดพลาดแสดงเป็นรหัสเท่านั้น</p>
</section>

<section class="grid" aria-label="สถานะบริการ">
	{#each [
		{ label: 'Webhook LINE', item: data.status.components.webhook },
		{ label: 'งานเตือน', item: data.status.components.reminders },
		{ label: 'สำรองฐานข้อมูล', item: data.status.components.backup }
	] as component (component.label)}
		<article class="card metric">
			<h2>{component.label}</h2>
			<strong class:bad={component.item && !component.item.success}>{stateLabel(component.item)}</strong>
			<p>ล่าสุด · {stamp(component.item?.at)}</p>
		</article>
	{/each}
</section>

<section class="card panel">
	<h2>คิวอ่านสลิป</h2>
	{#if data.status.ocrQueue.length}
		<ul class="counts">
			{#each data.status.ocrQueue as item (item.status)}<li>{queueLabels[item.status] ?? item.status}<strong>{item.count}</strong><small>เก่าที่สุด · {stamp(item.oldest)}</small></li>{/each}
		</ul>
	{:else}<p>ไม่มีสลิปค้างในคิว</p>{/if}
	<p>เก็บเฉพาะจำนวนและสถานะ ไม่แสดงรูป ข้อความสลิป หรือข้อมูลเจ้าของรายการ</p>
</section>

<section class="grid">
	<article class="card metric">
		<h2>Gemini · วันนี้</h2>
		<strong>{data.status.usage.gemini.today.calls} ครั้ง</strong>
		<p>เข้า {data.status.usage.gemini.today.inputTokens.toLocaleString()} · ออก {data.status.usage.gemini.today.outputTokens.toLocaleString()} tokens</p>
	</article>
	<article class="card metric">
		<h2>Gemini · เดือนนี้</h2>
		<strong>{data.status.usage.gemini.month.calls} ครั้ง</strong>
		<p>เข้า {data.status.usage.gemini.month.inputTokens.toLocaleString()} · ออก {data.status.usage.gemini.month.outputTokens.toLocaleString()} tokens</p>
	</article>
	<article class="card metric">
		<h2>LINE push · วันนี้</h2>
		<strong>{data.status.usage.linePushes.today}</strong>
		<p>จำนวนข้อความที่ LINE รับสำเร็จ</p>
	</article>
	<article class="card metric">
		<h2>LINE push · เดือนนี้</h2>
		<strong>{data.status.usage.linePushes.month}</strong>
		<p>ไม่นับข้อความตอบกลับในแชท</p>
	</article>
</section>

<section class="card panel">
	<h2>ข้อผิดพลาดล่าสุด</h2>
	{#if data.status.errors.length}
		<ul class="errors">
			{#each data.status.errors as item (`${item.source}:${item.at}`)}
				<li><strong>{item.source}</strong><code>{item.code}</code><time>{stamp(item.at)}</time></li>
			{/each}
		</ul>
	{:else}<p>ยังไม่มีข้อผิดพลาดที่บันทึกไว้</p>{/if}
	<p>ความล้มเหลวของ AI ใน 30 วันล่าสุด: {data.status.llmFailures30d} ครั้ง</p>
</section>

<section class="health">
	<span>Health checks สำหรับ Railway</span>
	<a href="/health/live">/health/live</a>
	<a href="/health/ready">/health/ready</a>
</section>

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head>p:last-child,.panel>p{color:var(--ink-muted)}
	.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-bottom:1rem}.metric,.panel{padding:1rem}.metric h2,.panel h2{font-size:var(--text-lg);margin:0 0 .5rem}.metric strong{font-size:1.3rem}.metric p{color:var(--ink-muted);font-size:var(--text-sm);margin:.4rem 0 0}.metric .bad{color:var(--out)}.counts,.errors{list-style:none;padding:0;margin:.6rem 0}.counts li,.errors li{display:flex;align-items:center;gap:.8rem;padding:.45rem 0;border-bottom:1px solid var(--rule)}.counts strong{margin-left:auto}.counts small{font-size:var(--text-xs);color:var(--ink-muted)}.errors code{margin-left:auto}.errors time{font-size:var(--text-xs);color:var(--ink-muted)}.health{display:flex;gap:1rem;margin-top:1rem;font-size:var(--text-sm)}
	@media(max-width:700px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.errors li{align-items:flex-start;flex-direction:column;gap:.2rem}.errors code{margin:0}}
	@media(max-width:460px){.grid{grid-template-columns:1fr}}
</style>
