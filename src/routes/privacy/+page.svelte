<script lang="ts">
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>ข้อมูลส่วนตัว · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">ควบคุมข้อมูลของฉัน</p>
	<h1>ข้อมูลส่วนตัว</h1>
	<p>ดาวน์โหลดสำเนาข้อมูลหรือขอลบบัญชีและข้อมูลถาวรได้จากหน้านี้</p>
</section>

{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="card panel">
	<h2>ดาวน์โหลดข้อมูลก่อน</h2>
	<p>ไปที่หน้าส่งออกเพื่อบันทึกรายการรับจ่าย บิล การจ่ายบิล และแผนรายเดือนเป็น CSV หรือ JSON ลงในอุปกรณ์ของคุณ</p>
	<a class="button secondary" href="/export">เปิดหน้าส่งออกข้อมูล</a>
</section>

<section class="card panel danger-panel">
	<h2>ลบบัญชี Nudget</h2>
	<p>การลบเป็นแบบถาวรและเริ่มทันที ไม่มีช่วงกู้คืน ระบบจะลบรายการรับจ่าย บิล บัตร แผนและงบ สลิปที่รออ่าน ฟีดแบ็ก บทสนทนา AI และหมายเหตุผู้ดูแลที่ผูกกับบัญชีนี้ออกจากฐานข้อมูลใช้งาน</p>
	<p>ไฟล์ที่คุณดาวน์โหลดไปแล้วจะไม่ถูกลบ ส่วนสำเนาใน backup อาจอยู่จนถึงรอบหมดอายุตามนโยบายสำรองข้อมูล (ค่าปัจจุบัน 30 วัน) หากกลับมาแชทกับ Nudget ภายหลัง ระบบอาจเปิดบัญชีใหม่ที่ไม่มีข้อมูลเก่า</p>

	{#if !data.recentLineSession}
		<div class="callout">
			<strong>ต้องยืนยันด้วย LINE ใหม่ก่อน</strong>
			<p>ออกจากระบบแล้วเข้าสู่ระบบด้วย LINE อีกครั้ง จากนั้นกลับมาหน้านี้และดำเนินการภายใน 5 นาที</p>
			<form method="POST" action="/logout?next=%2Fprivacy"><button type="submit">ออกจากระบบเพื่อยืนยันใหม่</button></form>
		</div>
	{:else if !data.canDeleteAccount}
		<div class="callout"><strong>บัญชีเจ้าของต้องโอนสิทธิ์ก่อน</strong><p>เพิ่มและทดสอบเจ้าของคนอื่น จากนั้นนำ LINE ID ของบัญชีนี้ออกจาก <code>LINE_ALLOWED_USER_ID</code> แล้วจึงกลับมาลบได้</p></div>
	{:else if data.deletionPrepared || form?.prepared}
		<div class="callout final">
			<strong>ขั้นสุดท้าย · ข้อมูลจะถูกลบทันทีและกู้คืนไม่ได้</strong>
			<p>ขั้นยืนยันนี้หมดอายุใน 10 นาที ยืนยันเฉพาะเมื่อคุณดาวน์โหลดข้อมูลแล้วหรือยอมไม่เก็บสำเนา</p>
			<form method="POST" action="?/deleteAccount">
				<label for="confirm-delete">พิมพ์ “ลบบัญชี” เพื่อยืนยัน</label>
				<input id="confirm-delete" name="confirmation" autocomplete="off" required />
				<button class="danger" type="submit">ลบบัญชีและข้อมูลถาวร</button>
			</form>
			<form method="POST" action="?/cancelDeletion"><button class="secondary" type="submit">ยกเลิก</button></form>
		</div>
	{:else}
		<form method="POST" action="?/prepareDeletion" class="prepare">
			<label class="ack"><input type="checkbox" name="exportAcknowledged" value="yes" required />ฉันดาวน์โหลดข้อมูลจากหน้าส่งออกแล้ว หรือไม่ต้องการเก็บสำเนา</label>
			<button class="danger" type="submit">เริ่มขั้นตอนลบบัญชี</button>
		</form>
	{/if}
</section>

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.panel>p{color:var(--ink-muted)}.panel{padding:1rem;margin-bottom:1rem}.panel h2{font-size:var(--text-lg);margin:0 0 .6rem}.notice{padding:.75rem 1rem;margin-bottom:1rem;color:var(--accent);background:var(--accent-soft);border-radius:var(--radius)}.button,button{display:inline-flex;align-items:center;justify-content:center;padding:.65rem .9rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.secondary{background:var(--paper-sunken);color:var(--ink)}.danger-panel{border-color:color-mix(in oklch,var(--out) 45%,var(--rule))}.danger{background:var(--out);color:white}.callout{padding:1rem;margin-top:1rem;border:1px solid var(--rule-strong);border-radius:var(--radius)}.callout>p{color:var(--ink-muted)}.final{border-color:var(--out)}form{display:grid;gap:.75rem;margin-top:.85rem}.prepare{margin-top:1.25rem}.ack{display:flex;align-items:flex-start;gap:.55rem}.ack input{margin-top:.2rem;accent-color:var(--accent)}label{font-size:var(--text-sm);font-weight:600}input:not([type=checkbox]){max-width:24rem;padding:.65rem .75rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper);color:var(--ink)}
</style>
