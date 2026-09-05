<script lang="ts">
	import { enhance } from '$app/forms';
	import { getCategory } from '$lib/categories';
	import type { TxView } from '$lib/types';
	import { bangkokDayKey, formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
	import { formatNumber } from '$lib/utils/money';

	interface Props {
		items: TxView[];
		deletable?: boolean;
		editable?: boolean;
		emptyText?: string;
	}

	let { items, deletable = false, editable = false, emptyText = 'ยังไม่มีรายการ' }: Props = $props();
	const methodLabel = { bank: 'โอน/บัญชี', cash: 'เงินสด', credit_card: 'บัตรเครดิต', wallet: 'วอลเล็ต' } as const;

	interface DayGroup {
		key: string;
		date: Date;
		total: number;
		items: TxView[];
	}

	// Grouping by Bangkok day is what makes the list scannable — a flat list of
	// timestamps reads as noise.
	const groups = $derived.by(() => {
		const map = new Map<string, DayGroup>();
		for (const item of items) {
			const key = bangkokDayKey(item.occurredAt);
			const group = map.get(key) ?? { key, date: item.occurredAt, total: 0, items: [] };
			group.items.push(item);
			if (item.kind === 'expense') group.total += item.amount;
			map.set(key, group);
		}
		return [...map.values()];
	});
</script>

{#if items.length === 0}
	<p class="empty">{emptyText}</p>
{:else}
	<div class="ledger">
		{#each groups as group (group.key)}
			<section>
				<header>
					<h3>{formatThaiShortDate(group.date)}</h3>
					<span class="day-total num">-{formatNumber(group.total)}</span>
				</header>
				<ul>
					{#each group.items as item (item.id)}
						{@const category = getCategory(item.categoryId)}
						<li>
							<span class="icon" aria-hidden="true">{category?.icon ?? '📦'}</span>
							<span class="what">
								<span class="note">{item.note || (category?.nameTh ?? item.categoryId)}</span>
								<span class="meta">
									{category?.nameTh ?? item.categoryId} · {methodLabel[item.paymentMethod]} · {formatThaiTime(item.occurredAt)} น.
									{#if item.source === 'line'}· LINE{/if}
								</span>
							</span>
							<span class="amount num" data-kind={item.kind}>
								{item.kind === 'income' ? '+' : '-'}{formatNumber(item.amount)}
							</span>
							{#if deletable}
								{#if editable}<a class="edit" href={`/transactions/${item.id}`} aria-label={`แก้รายการ ${item.note}`}>แก้</a>{/if}
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<button type="submit" title="ลบรายการนี้" aria-label="ลบรายการ {item.note}">
										✕
									</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}

<style>
	.empty {
		padding: 2.5rem 1rem;
		color: var(--ink-faint);
		text-align: center;
	}

	.ledger {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--rule-strong);
	}

	h3 {
		font-size: var(--text-sm);
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--ink-muted);
	}

	.day-total {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--ink-faint);
	}

	li {
		display: grid;
		grid-template-columns: 1.75rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.15rem;
		border-bottom: 1px dotted var(--rule);
	}

	li:has(form) {
		grid-template-columns: 1.75rem 1fr auto auto 1.75rem;
	}

	.icon {
		font-size: 1.1rem;
		text-align: center;
	}

	.what {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.note {
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.amount {
		font-weight: 600;
	}

	.amount[data-kind='income'] {
		color: var(--in);
	}

	.amount[data-kind='expense'] {
		color: var(--ink);
	}

	form button {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		color: var(--ink-faint);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease);
	}

	form button:hover {
		color: var(--out);
		background: var(--out-soft);
		border-color: color-mix(in oklch, var(--out) 35%, transparent);
	}

	.edit {
		font-size: var(--text-xs);
		color: var(--ink-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
