<script lang="ts">
	import BreakdownList from '$lib/components/BreakdownList.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import DailyChart from '$lib/components/DailyChart.svelte';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import RangeTabs from '$lib/components/RangeTabs.svelte';
	import StatFigure from '$lib/components/StatFigure.svelte';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import { RANGE_OPTIONS } from '$lib/ranges';
	import { formatNumber } from '$lib/utils/money';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const perDay = $derived(
		data.range.elapsedDays > 0 ? data.totals.expense / data.range.elapsedDays : 0
	);

	const biggestDay = $derived(
		data.days.reduce(
			(best, day) => (day.expense > best.expense ? day : best),
			{ day: '', expense: 0, income: 0, isToday: false }
		)
	);

	// Only the `add` action feeds the quick-add box; a delete result would
	// otherwise surface under the input that did not cause it.
	const quickAddResult = $derived(
		form?.action === 'add' ? { ok: form.ok, message: form.message } : null
	);

	function transactionsHref(categoryId?: string): string {
		const params = new URLSearchParams({ range: data.range.id });
		if (data.range.id === 'month') params.set('month', data.month.key);
		if (categoryId) params.set('category', categoryId);
		return `/transactions?${params}`;
	}
</script>

<svelte:head>
	<title>ภาพรวม · Nudget</title>
	<meta name="description" content="แดชบอร์ดรายรับรายจ่ายส่วนตัว" />
</svelte:head>

<section class="hero">
	<div class="hero-head">
		<p class="eyebrow">{data.range.label}</p>
		<RangeTabs options={RANGE_OPTIONS} active={data.range.id} />
	</div>
	<MonthNavigator month={data.month} />

	<div class="hero-figures">
		<StatFigure label="จ่ายไปแล้ว" value={data.totals.expense} tone="out" emphasis />
		<div class="secondary">
			<StatFigure label="รายรับ" value={data.totals.income} tone="in" />
			<StatFigure
				label="คงเหลือ"
				value={data.totals.net}
				tone={data.totals.net >= 0 ? 'in' : 'out'}
			/>
			<StatFigure
				label="เฉลี่ยต่อวัน"
				value={Math.round(perDay)}
				caption="{data.totals.count} รายการ"
			/>
		</div>
	</div>

	<QuickAdd result={quickAddResult} />

	{#if data.uncategorised > 0}
		<p class="nudge">
			⚠️ มี {data.uncategorised} รายการที่ยังอยู่ในหมวด “อื่นๆ” —
			<a href={transactionsHref('other')}>ดูและแก้หมวดหมู่</a>
		</p>
	{/if}
</section>

<section class="card panel chart-panel">
	<header class="panel-head">
		<h2>ใช้จ่ายรายวัน</h2>
		{#if biggestDay.expense > 0}
			<p class="hint">
				วันที่ใช้มากสุด <strong class="num">{formatNumber(biggestDay.expense)}</strong> บาท ·
				เส้นประคือค่าเฉลี่ย
			</p>
		{/if}
	</header>
	<DailyChart days={data.days} average={perDay} />
</section>

<div class="split">
	<section class="card panel">
		<header class="panel-head">
			<h2>รายจ่ายตามหมวดหมู่</h2>
		</header>

		{#if data.expenseBreakdown.length === 0}
			<p class="empty">ยังไม่มีรายจ่ายในช่วงนี้</p>
		{:else}
			<CategoryDonut rows={data.expenseBreakdown} total={data.totals.expense} />
			<div class="list-wrap">
				<BreakdownList
					rows={data.expenseBreakdown}
					hrefFor={(row) => transactionsHref(row.categoryId)}
				/>
			</div>
		{/if}
	</section>

	<div class="stack">
		<section class="card panel">
			<header class="panel-head">
				<h2>รายการล่าสุด</h2>
				<a class="more" href={transactionsHref()}>ดูทั้งหมด →</a>
			</header>
			<TransactionList items={data.recent} deletable emptyText="ยังไม่มีรายการ — ทักบอทใน LINE ได้เลย" />
		</section>

		{#if data.incomeBreakdown.length > 0}
			<section class="card panel">
				<header class="panel-head">
					<h2>รายรับ</h2>
				</header>
				<BreakdownList rows={data.incomeBreakdown} />
			</section>
		{/if}
	</div>
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--stack);
		margin-bottom: var(--stack-lg);
	}

	.hero-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.hero-figures {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 2fr);
		gap: var(--stack);
		align-items: center;
	}

	.secondary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.nudge {
		padding: 0.6rem 0.85rem;
		font-size: var(--text-sm);
		background: var(--accent-soft);
		border-radius: var(--radius);
	}

	.nudge a {
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.panel {
		padding: 1.25rem;
	}

	.chart-panel {
		margin-bottom: var(--stack-lg);
	}

	.panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	h2 {
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	.more {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--ink-muted);
		transition: color var(--dur-fast) var(--ease);
	}

	.more:hover {
		color: var(--accent);
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
		gap: var(--stack);
		align-items: start;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--stack);
	}

	.list-wrap {
		margin-top: 1.25rem;
		padding-top: 0.25rem;
		border-top: 1px solid var(--rule);
	}

	.empty {
		padding: 2rem 0;
		color: var(--ink-faint);
		text-align: center;
	}

	@media (max-width: 860px) {
		.hero-figures,
		.split {
			grid-template-columns: minmax(0, 1fr);
		}

		.secondary {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.25rem;
		}
	}

	@media (max-width: 520px) {
		.secondary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
