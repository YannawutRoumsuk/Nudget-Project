<script lang="ts">
	import { buildComparison, type ComparisonSource } from '$lib/insights';
	import { formatNumber } from '$lib/utils/money';

	let { categories, previousLabel }: { categories: ComparisonSource[]; previousLabel: string } =
		$props();

	const rows = $derived(buildComparison(categories));
</script>

{#if rows.length === 0}
	<p class="empty">ยังไม่มีรายจ่ายให้เทียบในเดือนนี้</p>
{:else}
	<div class="scroller">
		<table>
			<caption class="sr-only">เทียบรายจ่ายรายหมวดกับ{previousLabel}</caption>
			<thead>
				<tr>
					<th scope="col">หมวด</th>
					<th scope="col" class="num">เดือนนี้</th>
					<th scope="col" class="num">{previousLabel}</th>
					<th scope="col">เปลี่ยนไป</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.categoryId)}
					<tr>
						<th scope="row">
							<span class="icon" aria-hidden="true">{row.icon}</span>
							<span class="label">{row.label}</span>
							<span class="bar" aria-hidden="true" style="--share:{row.share}"></span>
						</th>
						<td class="num strong">{formatNumber(row.current)}</td>
						<td class="num muted">{formatNumber(row.previous)}</td>
						<td class="change" data-kind={row.kind}>
							<!-- The arrow and the wording carry the direction, so nobody has to
							     tell the two colours apart to read this column. -->
							<span class="arrow" aria-hidden="true"
								>{row.kind === 'up' || row.kind === 'new'
									? '▲'
									: row.kind === 'down' || row.kind === 'gone'
										? '▼'
										: '–'}</span
							>
							<span class="words">{row.changeLabel}</span>
							{#if row.kind !== 'same'}
								<span class="delta num"
									>{row.delta > 0 ? '+' : '−'}{formatNumber(Math.abs(row.delta))}</span
								>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.scroller {
		overflow-x: auto;
	}
	table {
		width: 100%;
		min-width: 30rem;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	caption {
		text-align: left;
	}
	th,
	td {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid var(--rule);
		text-align: left;
		vertical-align: middle;
	}
	thead th {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--ink-muted);
	}
	tbody th {
		position: relative;
		font-weight: 600;
		min-width: 9rem;
	}
	.icon {
		margin-right: 0.35rem;
	}
	.bar {
		display: block;
		height: 3px;
		margin-top: 0.35rem;
		width: calc(var(--share) * 100%);
		min-width: 2px;
		border-radius: 999px;
		background: var(--accent);
		opacity: 0.55;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.strong {
		font-weight: 600;
	}
	.muted {
		color: var(--ink-muted);
	}
	.change {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		white-space: nowrap;
	}
	.change .words {
		font-weight: 600;
	}
	.change .delta {
		color: var(--ink-muted);
	}
	.change[data-kind='up'],
	.change[data-kind='new'] {
		color: var(--out);
	}
	.change[data-kind='down'],
	.change[data-kind='gone'] {
		color: var(--in);
	}
	.change[data-kind='same'] {
		color: var(--ink-muted);
	}
	.empty {
		color: var(--ink-faint);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
