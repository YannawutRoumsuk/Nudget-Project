<script lang="ts">
	import { page } from '$app/state';
	import RangeTabs from '$lib/components/RangeTabs.svelte';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import TransactionList from '$lib/components/TransactionList.svelte';
	import { getCategory } from '$lib/categories';
	import { RANGE_OPTIONS } from '$lib/ranges';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const KINDS = [
		{ id: null, label: 'ทั้งหมด' },
		{ id: 'expense', label: 'รายจ่าย' },
		{ id: 'income', label: 'รายรับ' }
	];

	function withParam(key: string, value: string | null): string {
		const params = new URLSearchParams(page.url.searchParams);
		if (value === null) params.delete(key);
		else params.set(key, value);
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	const activeCategory = $derived(
		data.filters.categoryId ? getCategory(data.filters.categoryId) : null
	);
</script>

<svelte:head>
	<title>รายการ · Nudget</title>
</svelte:head>

<section class="head">
	<div>
		<p class="eyebrow">{data.range.label}</p>
		<h1>
			รายการทั้งหมด
			<span class="count num">{data.items.length}</span>
		</h1>
	</div>
	<RangeTabs options={RANGE_OPTIONS} active={data.range.id} />
</section>

<MonthNavigator month={data.month} />

<div class="filters">
	<div class="chips" role="group" aria-label="ประเภทรายการ">
		{#each KINDS as kind (kind.label)}
			<a href={withParam('kind', kind.id)} class:on={data.filters.kind === kind.id}>
				{kind.label}
			</a>
		{/each}
	</div>

	{#if activeCategory}
		<a class="chip-clear" href={withParam('category', null)}>
			{activeCategory.icon}
			{activeCategory.nameTh} ✕
		</a>
	{/if}

	<p class="totals num">
		<span class="out">-{formatNumber(data.totals.expense)}</span>
		<span class="sep">·</span>
		<span class="in">+{formatNumber(data.totals.income)}</span>
	</p>
</div>

{#if data.truncated}
	<p class="notice">แสดง 300 รายการแรกของช่วงนี้ — เลือกช่วงที่แคบลงเพื่อดูให้ครบ</p>
{/if}

<section class="card panel">
	<TransactionList items={data.items} deletable editable emptyText="ไม่มีรายการตามเงื่อนไขนี้" />
</section>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: var(--stack);
	}

	h1 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: var(--text-xl);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.count {
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--ink-faint);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: var(--stack);
		margin-bottom: var(--stack);
	}

	.chips {
		display: inline-flex;
		gap: 0.3rem;
	}

	.chips a,
	.chip-clear {
		padding: 0.3rem 0.75rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
		border: 1px solid var(--rule-strong);
		border-radius: 999px;
		transition:
			color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease);
	}

	.chips a:hover,
	.chip-clear:hover {
		color: var(--ink);
		border-color: var(--ink-faint);
	}

	.chips a.on {
		color: var(--paper-raised);
		background: var(--ink);
		border-color: var(--ink);
	}

	.chip-clear {
		background: var(--accent-soft);
		border-color: color-mix(in oklch, var(--accent) 30%, transparent);
	}

	.totals {
		margin-left: auto;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.totals .out {
		color: var(--out);
	}
	.totals .in {
		color: var(--in);
	}
	.totals .sep {
		margin: 0 0.4rem;
		color: var(--ink-faint);
	}

	.notice {
		margin-bottom: var(--stack);
		padding: 0.55rem 0.85rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
		background: var(--paper-sunken);
		border-radius: var(--radius);
	}

	.panel {
		padding: 1.25rem;
	}
</style>
