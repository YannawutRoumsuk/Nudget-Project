<script lang="ts">
	import { formatNumber } from '$lib/utils/money';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const percent = (current: number, target: number) => Math.min(100, Math.round((current / target) * 100));
</script>

<svelte:head><title>เป้าหมายออมเงิน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">เงินออมและกองทุนรายจ่ายก้อนใหญ่</p><h1>เป้าหมายออมเงิน</h1><p>กันเงินไว้ตามแผนได้ โดยเงินเติมเป้าหมายจะไม่ถูกนับเป็นรายจ่ายซ้ำ</p></div><a class="back" href="/plan">ดูแผนเดือน</a></section>
{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="card create">
	<h2>เพิ่มเป้าหมาย</h2>
	<form method="POST" action="?/create" class="fields">
		<label>ชื่อเป้าหมาย<input name="name" maxlength="80" placeholder="เช่น เที่ยวปลายปี หรือประกันรถ" required /></label>
		<label>ยอดที่ต้องการ<input name="targetAmount" type="number" min="0.01" max="1000000000" step="0.01" required /></label>
		<label>เก็บไว้แล้ว<input name="currentAmount" type="number" min="0" step="0.01" value="0" required /></label>
		<label>วันที่ต้องการ (ไม่บังคับ)<input name="targetDate" type="date" /></label>
		<label>กันเงินต่อเดือน<input name="monthlyContribution" type="number" min="0" step="0.01" value="0" /><small>ใช้เมื่อยังไม่กำหนดวันเป้าหมาย</small></label>
		<label>ความสำคัญ<select name="priority"><option value="1">สูงมาก</option><option value="2">สูง</option><option value="3" selected>ปกติ</option><option value="4">ต่ำ</option><option value="5">ต่ำมาก</option></select></label>
		<button type="submit">เพิ่มเป้าหมาย</button>
	</form>
</section>

<section class="goals" aria-label="เป้าหมายของฉัน">
	{#if data.goals.length === 0}<p class="empty card">ยังไม่มีเป้าหมาย เพิ่มเป้าหมายแรกด้านบนได้เลย</p>{/if}
	{#each data.goals as goal (goal.id)}
		{@const targetDate = goal.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : ''}
		<article class="card goal" class:muted={goal.status !== 'active'}>
			<header><div><p class="eyebrow">{goal.status === 'active' ? 'กำลังดำเนินการ' : goal.status === 'paused' ? 'พักไว้' : goal.status === 'completed' ? 'ถึงเป้าหมายแล้ว' : 'ปิดแล้ว'} · สำคัญระดับ {goal.priority}</p><h2>{goal.name}</h2></div><strong class="amount">฿{formatNumber(goal.currentAmount)} <small>/ ฿{formatNumber(goal.targetAmount)}</small></strong></header>
			<progress max="100" value={percent(goal.currentAmount, goal.targetAmount)} aria-label={`คืบหน้า ${percent(goal.currentAmount, goal.targetAmount)} เปอร์เซ็นต์`}></progress>
			<div class="progress-caption"><span>{percent(goal.currentAmount, goal.targetAmount)}% · เหลือ ฿{formatNumber(Math.max(0, goal.targetAmount - goal.currentAmount))}</span><span>{goal.monthlyReserve > 0 ? `ควรกันเดือนนี้ ฿${formatNumber(goal.monthlyReserve)}` : 'ยังไม่ต้องกันเงินรายเดือน'}</span></div>
			<p class="meta">{goal.targetDate ? `กำหนด ${new Date(`${targetDate}T12:00:00`).toLocaleDateString('th-TH', { dateStyle: 'long' })}` : `กันตามที่ตั้งไว้ ฿${formatNumber(goal.monthlyContribution)} ต่อเดือน`} · เติมเงินเป็นการย้ายไปกองทุน ไม่เพิ่มยอดรายจ่าย</p>
			{#if goal.status === 'active' || goal.status === 'paused'}
				{#if goal.status === 'active'}
				<div class="actions">
					<form method="POST" action="?/contribute" class="contribute"><input type="hidden" name="id" value={goal.id} /><label class="sr-only" for={`amount-${goal.id}`}>ยอดเติมเงิน {goal.name}</label><input id={`amount-${goal.id}`} name="amount" type="number" min="0.01" max={goal.targetAmount - goal.currentAmount} step="0.01" placeholder="เติมเงิน" required /><button type="submit">บันทึกเงินเข้า</button></form>
					<form method="POST" action="?/status"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="status" value="paused" /><button class="secondary" type="submit">พัก</button></form>
					<form method="POST" action="?/status" onsubmit={(event) => !confirm(`ปิดเป้าหมาย “${goal.name}” หรือไม่? ประวัติจะยังอยู่` ) && event.preventDefault()}><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="status" value="closed" /><button class="secondary" type="submit">ปิดเป้าหมาย</button></form>
				</div>
				{/if}
				<details><summary>แก้ไขเป้าหมาย</summary><form method="POST" action="?/update" class="fields edit"><input type="hidden" name="id" value={goal.id} /><label>ชื่อ<input name="name" maxlength="80" value={goal.name} required /></label><label>ยอดเป้าหมาย<input name="targetAmount" type="number" min={goal.currentAmount} step="0.01" value={goal.targetAmount} required /></label><label>วันที่ (ไม่บังคับ)<input name="targetDate" type="date" value={targetDate} /></label><label>กันต่อเดือน<input name="monthlyContribution" type="number" min="0" step="0.01" value={goal.monthlyContribution} /></label><label>ความสำคัญ<select name="priority" value={goal.priority}><option value="1">สูงมาก</option><option value="2">สูง</option><option value="3">ปกติ</option><option value="4">ต่ำ</option><option value="5">ต่ำมาก</option></select></label><button type="submit">บันทึก</button></form></details>
				{#if goal.status === 'paused'}<form method="POST" action="?/status"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="status" value="active" /><button class="secondary" type="submit">ดำเนินการต่อ</button></form>{/if}
			{:else}
				{#if goal.status === 'closed'}<form method="POST" action="?/status"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="status" value="active" /><button class="secondary" type="submit">เปิดเป้าหมายต่อ</button></form>{/if}
			{/if}
		</article>
	{/each}
</section>

{#if data.contributions.length}
	<section class="card history"><h2>เงินที่เติมล่าสุด</h2><ul>{#each data.contributions as contribution (contribution.id)}<li><span>{contribution.goalName}<small>{new Date(contribution.createdAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</small></span><strong>+฿{formatNumber(Number(contribution.amount))}</strong></li>{/each}</ul></section>
{/if}

<style>
	.head{display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.meta,small{color:var(--ink-muted)}.back{color:var(--accent-ink)}.create,.goal,.history{padding:1.2rem;margin-bottom:var(--stack)}h2{margin:0 0 .8rem}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;align-items:end}.fields label{display:grid;gap:.3rem;font-size:var(--text-sm);font-weight:600}.fields input,.fields select,.contribute input{width:100%;padding:.65rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised);color:var(--ink);font:inherit}.fields small{font-weight:400}.fields button,.contribute button,.goal>form button{justify-self:start;padding:.65rem 1rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);font:inherit;cursor:pointer}.goal header{display:flex;justify-content:space-between;gap:1rem;align-items:start}.goal h2{font-size:1.2rem}.amount{white-space:nowrap}.amount small{font-size:var(--text-sm);font-weight:400}.goal progress{width:100%;height:.8rem;accent-color:var(--accent);margin:.4rem 0}.progress-caption{display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap;font-size:var(--text-sm);font-weight:600}.meta{font-size:var(--text-sm)}.actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.8rem 0}.contribute{display:flex;gap:.4rem}.contribute input{width:9rem}.secondary{padding:.6rem .8rem!important;border:1px solid var(--rule-strong)!important;background:transparent!important;color:var(--ink)!important}.goal details{margin-top:.8rem}.goal summary{cursor:pointer;color:var(--accent-ink)}.edit{padding-top:.8rem}.muted{opacity:.82}.history ul{list-style:none;padding:0;margin:0}.history li{display:flex;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--rule)}.history li span{display:grid}.history li small{font-size:var(--text-sm)}.empty{padding:1.2rem;color:var(--ink-muted)}
	@media(max-width:700px){.fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.fields{grid-template-columns:1fr}.goal header{display:block}.actions{align-items:stretch}.contribute{flex:1}.contribute input{width:7rem}}
</style>
