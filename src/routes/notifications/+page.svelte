<script lang="ts">
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const timeValue = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
</script>

<svelte:head><title>การแจ้งเตือน · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">ตั้งค่าตามที่สะดวก</p>
	<h1>การแจ้งเตือน</h1>
	<p>เมื่อไม่มีกิจกรรม จะเตือนทุก 6 ชั่วโมงและหยุดเองเมื่อครบ 3 วัน การกลับมาใช้งานจะเริ่มนับใหม่</p>
</section>

{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<form method="POST" class="card settings">
	<label class="toggle"><input name="notificationsEnabled" type="checkbox" checked={data.preferences.notificationsEnabled} /> เปิดการแจ้งเตือน LINE</label>
	<p class="hint">ปิดแล้วจะหยุดเตือนการไม่ใช้งาน บิล งบรายหมวด และสรุปเดือน</p>
	<label>เวลาส่งเตือนบิลและสรุปประจำเดือน<input name="notificationHour" type="time" value={timeValue(data.preferences.notificationHour)} required /></label>
	<label>เขตเวลา (ตัวอย่าง Asia/Bangkok)<input name="timezone" value={data.preferences.timezone} maxlength="64" autocomplete="off" required /></label>
	<div class="quiet">
		<label>เริ่มงดรบกวน<input name="quietHoursStart" type="time" value={timeValue(data.preferences.quietHoursStart)} required /></label>
		<label>สิ้นสุดงดรบกวน<input name="quietHoursEnd" type="time" value={timeValue(data.preferences.quietHoursEnd)} required /></label>
	</div>
	<p class="hint">การเตือนทุก 6 ชั่วโมงจะเลื่อนไปจนพ้นช่วงงดรบกวน · การเปิดหน้าเว็บที่ลงชื่อเข้าใช้หรือพิมพ์คุยกับบอทจะเริ่มนับเวลาใหม่</p>
	<button type="submit">บันทึก</button>
</form>

<section class="card line-help">
	<h2>ตั้งค่าจาก LINE</h2>
	<p>ส่งข้อความเหล่านี้ในแชทกับ Nudget ได้เลย:</p>
	<ul>
		<li><code>ตั้งค่าเตือน</code> — ดูสถานะปัจจุบัน</li>
		<li><code>ตั้งค่าเตือน ปิด</code> หรือ <code>ตั้งค่าเตือน เปิด</code></li>
		<li><code>ตั้งค่าเตือน เวลา 20</code> — เปลี่ยนเวลาส่งสรุปเป็น 20:00</li>
		<li><code>ตั้งค่าเตือน เขตเวลา Asia/Tokyo</code></li>
	</ul>
</section>

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head>p:last-child,.hint{color:var(--ink-muted)}
	.settings,.line-help{padding:1.2rem;margin-bottom:var(--stack)}.settings{display:grid;gap:.9rem;max-width:42rem}.settings label{display:grid;gap:.35rem;font-weight:600;font-size:var(--text-sm)}.settings input:not([type=checkbox]){padding:.7rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised)}.settings .toggle{display:flex;align-items:center;gap:.55rem;font-size:1rem}.hint{margin:0;font-size:var(--text-sm)}.quiet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.settings button{justify-self:start;padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}.notice{color:var(--in)}.line-help h2{font-size:var(--text-lg)}.line-help p{color:var(--ink-muted)}code{background:var(--paper-sunken);padding:.1rem .3rem;border-radius:.25rem}@media(max-width:560px){.quiet{grid-template-columns:1fr}}
</style>
