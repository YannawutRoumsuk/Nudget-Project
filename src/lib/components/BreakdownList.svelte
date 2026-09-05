<script lang="ts">
	import type { BreakdownRow } from '$lib/analytics';
	import { formatNumber } from '$lib/utils/money';

	interface Props {
		rows: BreakdownRow[];
		/** Links each row to the filtered transaction list. */
		hrefFor?: (row: BreakdownRow) => string;
	}

	let { rows, hrefFor }: Props = $props();
</script>

<ul class="breakdown">
	{#each rows as row (row.categoryId)}
		<li style="--row-color: {row.color}">
			<svelte:element
				this={hrefFor ? 'a' : 'div'}
				href={hrefFor?.(row)}
				class="row"
				role={hrefFor ? undefined : 'group'}
			>
				<span class="icon" aria-hidden="true">{row.icon}</span>
				<span class="label">
					{row.label}
					<span class="count num">{row.count} รายการ</span>
				</span>
				<span class="amount num">{formatNumber(row.total)}</span>
				<span class="share num">{row.share.toFixed(0)}%</span>
				<span class="track" aria-hidden="true">
					<span class="fill" style="width: {row.share}%"></span>
				</span>
			</svelte:element>
		</li>
	{/each}
</ul>

<style>
	.breakdown {
		display: flex;
		flex-direction: column;
	}

	li + li {
		border-top: 1px solid var(--rule);
	}

	.row {
		display: grid;
		grid-template-columns: 1.6rem 1fr auto 2.75rem;
		align-items: center;
		gap: 0.25rem 0.7rem;
		padding: 0.7rem 0.25rem 0.85rem;
		transition: background var(--dur-fast) var(--ease);
	}

	a.row:hover,
	a.row:focus-visible {
		background: color-mix(in oklch, var(--row-color) 10%, transparent);
	}

	.icon {
		font-size: 1.05rem;
		text-align: center;
	}

	.label {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-weight: 500;
	}

	.count {
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--ink-faint);
	}

	.amount {
		font-weight: 600;
	}

	.share {
		font-size: var(--text-sm);
		color: var(--ink-faint);
		text-align: right;
	}

	.track {
		grid-column: 2 / -1;
		height: 3px;
		border-radius: 999px;
		background: var(--paper-sunken);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: var(--row-color);
		border-radius: inherit;
		transition: width var(--dur) var(--ease);
	}
</style>
