<script lang="ts">
	import type { BreakdownRow } from '$lib/analytics';
	import { donutArcs } from '$lib/analytics';
	import { formatCompact, formatNumber } from '$lib/utils/money';

	interface Props {
		rows: BreakdownRow[];
		total: number;
		caption?: string;
	}

	let { rows, total, caption = 'รวมรายจ่าย' }: Props = $props();

	// Long tails make a donut unreadable; everything past the top 6 is folded
	// into one "อื่นๆ" wedge that still carries its real total.
	const TOP = 6;
	const shown = $derived.by(() => {
		if (rows.length <= TOP) return rows;
		const head = rows.slice(0, TOP);
		const tail = rows.slice(TOP);
		return [
			...head,
			{
				categoryId: '__rest',
				label: `อื่นๆ อีก ${tail.length}`,
				icon: '•',
				color: 'oklch(70% 0.02 260)',
				total: tail.reduce((sum, row) => sum + row.total, 0),
				count: tail.reduce((sum, row) => sum + row.count, 0),
				share: tail.reduce((sum, row) => sum + row.share, 0)
			}
		];
	});

	const arcs = $derived(donutArcs(shown));
	let hovered = $state<string | null>(null);
	const focus = $derived(shown.find((row) => row.categoryId === hovered) ?? null);
</script>

<div class="donut">
	<svg viewBox="0 0 100 100" role="img" aria-label="สัดส่วนรายจ่ายตามหมวดหมู่">
		{#each arcs as arc (arc.categoryId)}
			<path
				d={arc.path}
				fill={arc.color}
				class:dim={hovered !== null && hovered !== arc.categoryId}
				role="presentation"
				onmouseenter={() => (hovered = arc.categoryId)}
				onmouseleave={() => (hovered = null)}
			>
				<title>{arc.label} · {formatNumber(arc.total)} บาท</title>
			</path>
		{/each}
	</svg>

	<div class="center" aria-hidden="true">
		{#if focus}
			<span class="label">{focus.icon} {focus.label}</span>
			<span class="amount num">{formatCompact(focus.total)}</span>
			<span class="share num">{focus.share.toFixed(0)}%</span>
		{:else}
			<span class="label">{caption}</span>
			<span class="amount num">{formatCompact(total)}</span>
			<span class="share">บาท</span>
		{/if}
	</div>
</div>

<style>
	.donut {
		position: relative;
		width: min(100%, 260px);
		margin-inline: auto;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
	}

	path {
		cursor: default;
		transition:
			opacity var(--dur) var(--ease),
			transform var(--dur) var(--ease);
		transform-origin: 50px 50px;
	}

	path:hover {
		transform: scale(1.035);
	}

	path.dim {
		opacity: 0.28;
	}

	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		pointer-events: none;
		text-align: center;
	}

	.label {
		max-width: 60%;
		font-size: var(--text-xs);
		color: var(--ink-muted);
	}

	.amount {
		font-size: var(--text-figure);
		font-weight: 700;
		line-height: 1.05;
	}

	.share {
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}
</style>
