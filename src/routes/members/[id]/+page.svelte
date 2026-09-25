<script lang="ts">
	import { bangkokMonthKey, bangkokParts, formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const money = (value: string | number) => Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const dateTimeValue = (value: Date) => {
		const { year, month, day, hour, minute } = bangkokParts(new Date(value));
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	};
	const stamp = (value: Date) => `${formatThaiShortDate(new Date(value))} ${formatThaiTime(new Date(value))} น.`;
	const categoryName = (id: string) => data.categories.find((item) => item.id === id)?.nameTh ?? id;
	const monthNow = bangkokMonthKey(new Date());
</script>

<svelte:head><title>{data.member.displayName || 'สมาชิก'} · สมาชิก · Nudget</title></svelte:head>

<a class="back" href="/">← ออกจากโหมดผู้ดูแล · กลับบัญชีของฉัน</a>
<a class="back secondary" href="/members">ดูสมาชิกทั้งหมด</a>
<section class="banner" role="status">
	<p class="eyebrow">โหมดผู้ดูแล · ข้อมูลส่วนบุคคล</p>
	<h1>กำลังดูข้อมูลของ {data.member.displayName || 'สมาชิก'}</h1>
	<p>ข้อมูลด้านล่างเป็นของสมาชิกคนนี้ การแก้ไขหรือลบจะบันทึกผู้กระทำและค่าก่อน/หลังไว้ในประวัติผู้ดูแล</p>
</section>

{#if form?.message}<p class="notice" role="status">{form.message}</p>{/if}

<section class="grid">
	<article class="card panel profile">
		<h2>ข้อมูลสมาชิก</h2>
		<p><strong>{data.member.displayName || '(ไม่ทราบชื่อ LINE)'}</strong> · {data.member.active ? 'ใช้งานอยู่' : 'ปิดสิทธิ์'}</p>
		<p>LINE ID · <code>{data.member.lineUserId}</code></p>
		<p>สมัคร {stamp(data.member.joinedAt)} · ใช้งานล่าสุด {stamp(data.member.lastActivityAt)}</p>
		<form method="POST" action="?/setActive">
			<input type="hidden" name="active" value={data.member.active ? 'false' : 'true'} />
			<button class:danger={data.member.active} type="submit">{data.member.active ? 'ปิดสิทธิ์สมาชิก' : 'เปิดสิทธิ์สมาชิก'}</button>
		</form>
	</article>
	<article class="card panel">
		<h2>หมายเหตุภายใน</h2>
		<p class="muted">เห็นและแก้ไขได้เฉพาะเจ้าของระบบ</p>
		<form method="POST" action="?/saveNote">
			<label for="member-note">รายละเอียดสมาชิก</label>
			<textarea id="member-note" name="note" rows="4" maxlength="2000">{data.member.memberNote}</textarea>
			<button type="submit">บันทึกหมายเหตุ</button>
		</form>
	</article>
</section>

<section class="card panel">
	<h2>รายการรับจ่าย · {data.transactions.length}{data.transactions.length === 200 ? '+' : ''}</h2>
	{#if data.transactions.length === 0}<p class="muted">ยังไม่มีรายการ</p>{/if}
	<div class="records">
		{#each data.transactions as tx (tx.id)}
			<details class="record">
				<summary><span>{tx.kind === 'income' ? 'รับ' : 'จ่าย'} · {tx.note || 'ไม่มีรายละเอียด'}<small>{stamp(tx.occurredAt)} · {tx.categoryId}</small></span><strong>{money(tx.amount)} บาท</strong></summary>
				<div class="editor">
					<form method="POST" action="?/updateTransaction">
						<input type="hidden" name="id" value={tx.id} />
						<div class="fields">
							<label>ประเภท<select name="kind" value={tx.kind}>{#each ['expense','income'] as kind}<option value={kind}>{kind === 'expense' ? 'รายจ่าย' : 'รายรับ'}</option>{/each}</select></label>
							<label>ยอดเงิน<input name="amount" type="number" min="0.01" step="0.01" required value={tx.amount} /></label>
							<label>หมวดหมู่<select name="categoryId" value={tx.categoryId}>{#each data.categories as category}<option value={category.id}>{category.nameTh} · {category.kind === 'expense' ? 'รายจ่าย' : 'รายรับ'}</option>{/each}</select></label>
							<label>วันที่/เวลา<input name="occurredAt" type="datetime-local" required value={dateTimeValue(tx.occurredAt)} /></label>
							<label class="wide">รายละเอียด<input name="note" maxlength="500" value={tx.note} /></label>
						</div>
						<button type="submit">บันทึกการแก้ไข</button>
					</form>
					<form method="POST" action="?/deleteTransaction" onsubmit={(event) => { if (!confirm('ลบรายการนี้หรือไม่? การลบจะถูกบันทึกในประวัติผู้ดูแล')) event.preventDefault(); }}>
						<input type="hidden" name="id" value={tx.id} /><button class="danger" type="submit">ลบรายการ</button>
					</form>
				</div>
			</details>
		{/each}
	</div>
</section>

<section class="card panel">
	<h2>บิลและภาระจ่าย · {data.bills.length}</h2>
	{#if data.bills.length === 0}<p class="muted">ยังไม่มีบิล</p>{/if}
	<div class="records">
		{#each data.bills as bill (bill.id)}
			<details class="record">
				<summary><span>{bill.name}<small>{bill.recurrence === 'monthly' ? `ทุกเดือน วันที่ ${bill.dueDay}` : `ครบกำหนด ${bill.dueDate ? formatThaiShortDate(new Date(bill.dueDate)) : 'ไม่ระบุ'}`} · {bill.active ? 'ใช้งาน' : 'ปิดแล้ว'}</small></span><strong>{money(bill.amount)} บาท</strong></summary>
				<div class="editor">
					<form method="POST" action="?/updateBill">
						<input type="hidden" name="id" value={bill.id} />
						<div class="fields">
							<label>ชื่อบิล<input name="name" maxlength="120" required value={bill.name} /></label>
							<label>ยอดเงิน<input name="amount" type="number" min="0.01" step="0.01" required value={bill.amount} /></label>
							<label>หมวดหมู่<select name="categoryId" value={bill.categoryId}>{#each data.categories.filter((item) => item.kind === 'expense') as category}<option value={category.id}>{category.nameTh}</option>{/each}</select></label>
							<label>สถานะ<select name="active" value={bill.active ? 'true' : 'false'}><option value="true">ใช้งาน</option><option value="false">ปิดแล้ว</option></select></label>
						</div>
						<button type="submit">บันทึกการแก้ไข</button>
					</form>
					<form method="POST" action="?/deleteBill" onsubmit={(event) => { if (!confirm('ลบบิลนี้หรือไม่? ประวัติการแก้ไขจะยังอยู่')) event.preventDefault(); }}>
						<input type="hidden" name="id" value={bill.id} /><button class="danger" type="submit">ลบบิล</button>
					</form>
				</div>
			</details>
		{/each}
	</div>
</section>

<section class="card panel">
	<h2>แผนรายเดือน · {data.plans.length}</h2>
	<form method="POST" action="?/savePlan" class="plan-form">
		<div class="fields">
			<label>เดือน<input type="month" name="month" required value={monthNow} /></label>
			<label>รายรับคาดหวัง<input name="expectedIncome" type="number" min="0" step="0.01" required value="0" /></label>
			<label>เป้าออมเงิน<input name="savingsGoal" type="number" min="0" step="0.01" required value="0" /></label>
			<label>งบกินต่อวัน<input name="foodDailyBudget" type="number" min="0" step="0.01" required value="0" /></label>
			<label>งบเดินทางต่อวัน<input name="commuteDailyBudget" type="number" min="0" step="0.01" required value="0" /></label>
			<label>วันเดินทางต่อเดือน<input name="commuteDays" type="number" min="0" max="31" step="1" required value="0" /></label>
		</div>
		<input type="hidden" name="budgetAlertsEnabled" value="true" />
		<button type="submit">เพิ่มหรือแก้ไขแผนของเดือนนี้</button>
	</form>
	<div class="records">
		{#each data.plans as plan (plan.month)}
			<details class="record">
				<summary><span>{plan.month}<small>รายรับ {money(plan.expectedIncome)} · ออม {money(plan.savingsGoal)} · กิน/วัน {money(plan.foodDailyBudget)} · เดินทาง/วัน {money(plan.commuteDailyBudget)} · {plan.commuteDays} วัน</small></span><strong>แก้แผน</strong></summary>
				<form method="POST" action="?/savePlan" class="plan-form editor">
					<div class="fields">
						<label>เดือน<input type="month" name="month" required value={plan.month} /></label>
						<label>รายรับคาดหวัง<input name="expectedIncome" type="number" min="0" step="0.01" required value={plan.expectedIncome} /></label>
						<label>เป้าออมเงิน<input name="savingsGoal" type="number" min="0" step="0.01" required value={plan.savingsGoal} /></label>
						<label>งบกินต่อวัน<input name="foodDailyBudget" type="number" min="0" step="0.01" required value={plan.foodDailyBudget} /></label>
						<label>งบเดินทางต่อวัน<input name="commuteDailyBudget" type="number" min="0" step="0.01" required value={plan.commuteDailyBudget} /></label>
						<label>วันเดินทางต่อเดือน<input name="commuteDays" type="number" min="0" max="31" step="1" required value={plan.commuteDays} /></label>
					</div>
					<input type="hidden" name="budgetAlertsEnabled" value={plan.budgetAlertsEnabled ? 'true' : 'false'} />
					<button type="submit">บันทึกแผนเดือน {plan.month}</button>
				</form>
			</details>
		{/each}
	</div>
	<h3>งบแยกตามหมวด</h3>
	<form method="POST" action="?/saveCategoryBudget" class="plan-form">
		<div class="fields">
			<label>เดือน<input type="month" name="month" required value={monthNow} /></label>
			<label>หมวดหมู่<select name="categoryId" required>{#each data.categories.filter((item) => item.kind === 'expense') as category}<option value={category.id}>{category.nameTh}</option>{/each}</select></label>
			<label>งบต่อเดือน<input name="amount" type="number" min="0.01" step="0.01" required /></label>
		</div>
		<button type="submit">เพิ่มหรือแก้งบหมวด</button>
	</form>
	<div class="records">
		{#each data.categoryBudgets as budget (`${budget.month}:${budget.categoryId}`)}
			<div class="category-budget">
				<strong>{budget.month} · {categoryName(budget.categoryId)} · {money(budget.amount)} บาท</strong>
				<form method="POST" action="?/saveCategoryBudget">
					<input type="hidden" name="month" value={budget.month} /><input type="hidden" name="categoryId" value={budget.categoryId} />
					<label>งบต่อเดือน<input name="amount" type="number" min="0.01" step="0.01" required value={budget.amount} /></label>
					<button type="submit">บันทึก</button>
				</form>
				<form method="POST" action="?/deleteCategoryBudget" onsubmit={(event) => { if (!confirm('ลบงบหมวดนี้หรือไม่?')) event.preventDefault(); }}>
					<input type="hidden" name="month" value={budget.month} /><input type="hidden" name="categoryId" value={budget.categoryId} /><button class="danger" type="submit">ลบ</button>
				</form>
			</div>
		{/each}
	</div>
</section>

<section class="card panel">
	<h2>ประวัติผู้ดูแล · ล่าสุด {data.auditLogs.length} รายการ</h2>
	{#if data.auditLogs.length === 0}<p class="muted">การเปลี่ยนแปลงที่ทำจากหน้านี้จะแสดงที่นี่</p>{/if}
	<div class="records">
		{#each data.auditLogs as log (log.id)}
			<details class="record audit">
				<summary><span>{log.action} · {log.entity} · {log.entityId}<small>ผู้ดูแล {log.actorLineUserId} · {stamp(log.createdAt)}</small></span></summary>
				<pre>{JSON.stringify(log.changes, null, 2)}</pre>
			</details>
		{/each}
	</div>
</section>

<style>
	.back{display:inline-block;margin:0 1rem 1rem 0;color:var(--accent)}.back.secondary{color:var(--ink-muted)}.banner{border:2px solid var(--accent);border-radius:var(--radius-lg);padding:1rem;margin-bottom:1rem;background:var(--paper-raised)}h1{font-size:var(--text-xl);margin:.2rem 0}.banner p:last-child,.muted{color:var(--ink-muted)}
	.notice{margin:0 0 1rem;color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:1rem}.panel{padding:1rem;margin-bottom:1rem}.panel h2{font-size:var(--text-lg);margin:0 0 .75rem}.panel h3{font-size:var(--text-md);margin:1rem 0 .5rem}.profile p{margin:.4rem 0;color:var(--ink-muted)}code{word-break:break-all}.records{display:grid;gap:.5rem}.record{border-top:1px solid var(--rule);padding:.65rem 0}.record summary{display:flex;justify-content:space-between;align-items:center;gap:.8rem;cursor:pointer}.record summary span{min-width:0}.record summary strong{white-space:nowrap}.record small{display:block;color:var(--ink-muted);font-size:var(--text-xs);margin-top:.25rem}.editor{display:grid;gap:.75rem;padding:.8rem 0 0 1rem}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.fields label,.panel form>label{display:grid;gap:.25rem;font-size:var(--text-sm)}.fields label.wide{grid-column:1/-1}input,select,textarea{min-width:0;width:100%;padding:.55rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper);color:var(--ink)}textarea{resize:vertical}.panel form{display:grid;gap:.65rem}.category-budget{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:.8rem;border-top:1px solid var(--rule);padding:.7rem 0}.category-budget form{display:flex;align-items:end;gap:.5rem}.category-budget label{display:grid;gap:.2rem;font-size:var(--text-xs)}.category-budget input{max-width:140px}button{padding:.55rem .8rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer}.danger{background:var(--out)}.audit pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:.75rem;background:var(--paper);border-radius:var(--radius);font-size:var(--text-xs)}
	@media(max-width:680px){.grid{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.fields label.wide{grid-column:auto}.record summary{align-items:flex-start}.category-budget{grid-template-columns:1fr}.category-budget form{align-items:center}.category-budget input{max-width:none}}
</style>
