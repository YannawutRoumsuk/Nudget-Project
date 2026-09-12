<script lang="ts">
	import { EXPENSE_CATEGORIES } from '$lib/categories';
	import { bangkokDayKey } from '$lib/utils/date';
	import type { BillRecurrence, PaymentMethod } from '$lib/server/db/schema';

	/**
	 * Without an `id` these are just starting values for a new bill, which is
	 * what copying an existing one hands over. With one, the form is editing a
	 * saved bill and gains the switch that turns it off.
	 */
	interface BillValues {
		id?: number;
		name: string;
		amount: number | string;
		categoryId: string;
		paymentMethod: PaymentMethod;
		recurrence: BillRecurrence;
		dueDay: number | null;
		dueDate: Date | null;
		active?: boolean;
	}

	// Radio grouping is per form element, so several of these can share a page
	// without their `recurrence` choices interfering.
	let {
		action,
		submitLabel,
		bill = null
	}: {
		action: string;
		submitLabel: string;
		bill?: BillValues | null;
	} = $props();

	const METHODS = [
		{ id: 'bank', label: 'โอน/บัญชี' },
		{ id: 'cash', label: 'เงินสด' },
		{ id: 'credit_card', label: 'บัตรเครดิต' },
		{ id: 'wallet', label: 'วอลเล็ต' }
	];

	// Most bills repeat, so that is what an untouched form submits. Capturing the
	// prop once is the point: after the first render this is the person's choice,
	// and re-deriving it from the saved bill would fight their typing.
	// svelte-ignore state_referenced_locally
	let recurrence = $state<BillRecurrence>(bill?.recurrence ?? 'monthly');

	// Day 31 is not a lie on a short month: `billDueDate` clamps it to the last
	// day, which is exactly what someone picking "สิ้นเดือน" means.
	const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
	const dayLabel = (day: number) => (day === 31 ? 'สิ้นเดือน' : `ทุกวันที่ ${day}`);

	const selectedDay = $derived(bill?.dueDay ?? 1);
	const selectedDate = $derived(bill?.dueDate ? bangkokDayKey(bill.dueDate) : '');
</script>

<form method="POST" {action} class="bill-form">
	{#if bill?.id !== undefined}
		<input type="hidden" name="id" value={bill.id} />
	{/if}

	<div class="primary">
		<label class="field name">
			<span>ชื่อบิล</span>
			<input name="name" value={bill?.name ?? ''} placeholder="เช่น ค่าเน็ต" required />
		</label>
		<label class="field amount">
			<span>ยอด (บาท)</span>
			<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value={bill?.amount ?? ''} required />
		</label>
	</div>

	<fieldset class="segmented">
		<legend>จ่ายแบบไหน</legend>
		<div class="options">
			<label class:on={recurrence === 'monthly'}>
				<input type="radio" name="recurrence" value="monthly" bind:group={recurrence} />
				<span>ทุกเดือน</span>
			</label>
			<label class:on={recurrence === 'once'}>
				<input type="radio" name="recurrence" value="once" bind:group={recurrence} />
				<span>ครั้งเดียว</span>
			</label>
		</div>
	</fieldset>

	<!-- Only the field that matches the choice exists, so the other can never
	     submit a competing value the server has to guess about. -->
	{#if recurrence === 'monthly'}
		<label class="field">
			<span>ครบกำหนดวันไหน</span>
			<select name="dueDay">
				{#each DAYS as day (day)}
					<option value={day} selected={day === selectedDay}>{dayLabel(day)}</option>
				{/each}
			</select>
		</label>
	{:else}
		<label class="field">
			<span>วันครบกำหนด</span>
			<input name="dueDate" type="date" value={selectedDate} required />
		</label>
	{/if}

	<details class="more">
		<summary>ตัวเลือกเพิ่มเติม</summary>
		<div class="more-grid">
			<label class="field">
				<span>หมวด</span>
				<select name="categoryId">
					{#each EXPENSE_CATEGORIES as category (category.id)}
						<option value={category.id} selected={category.id === (bill?.categoryId ?? 'bills')}>
							{category.icon}
							{category.nameTh}
						</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>วิธีจ่าย</span>
				<select name="paymentMethod">
					{#each METHODS as method (method.id)}
						<option value={method.id} selected={method.id === (bill?.paymentMethod ?? 'bank')}>{method.label}</option>
					{/each}
				</select>
			</label>
			{#if bill?.id !== undefined}
				<label class="check">
					<input name="active" type="checkbox" checked={bill.active ?? true} />
					<span>ใช้งานอยู่</span>
				</label>
			{/if}
		</div>
	</details>

	{#if bill?.id === undefined}<input type="hidden" name="active" value="true" />{/if}
	<button type="submit">{submitLabel}</button>
</form>

<style>
	.bill-form {
		display: grid;
		gap: 0.85rem;
		margin-top: 1rem;
	}
	.primary {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 0.75rem;
	}
	.field {
		display: grid;
		gap: 0.3rem;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.field input,
	.field select {
		min-width: 0;
		padding: 0.6rem;
		font: inherit;
		font-weight: 400;
		color: var(--ink);
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius);
		background: var(--paper-raised);
	}
	.field input:focus-visible,
	.field select:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.segmented {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.3rem;
	}
	.segmented legend {
		float: left;
		padding: 0;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.options {
		clear: both;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
		padding: 0.25rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
		background: var(--paper-sunken);
	}
	.options label {
		display: grid;
		place-items: center;
		padding: 0.5rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--ink-muted);
		cursor: pointer;
	}
	.options label:hover {
		color: var(--ink);
	}
	.options label.on {
		background: var(--paper-raised);
		color: var(--ink);
		box-shadow: 0 1px 2px oklch(0% 0 0 / 0.12);
	}
	/* The radio stays in the accessibility tree and keeps keyboard control; only
	   its default rendering is replaced. */
	.options input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.options label:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.more summary {
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--ink-muted);
	}
	.more summary:hover {
		color: var(--ink);
	}
	.more-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 0.7rem;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.check input {
		width: auto;
	}

	button {
		justify-self: start;
		padding: 0.6rem 1.1rem;
		font: inherit;
		font-weight: 600;
		border: 0;
		border-radius: var(--radius);
		background: var(--ink);
		color: var(--paper-raised);
		cursor: pointer;
	}
	button:hover {
		background: var(--accent);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	@media (max-width: 480px) {
		.primary,
		.more-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
