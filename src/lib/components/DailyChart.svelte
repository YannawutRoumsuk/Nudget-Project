<script lang="ts">
	import type { FilledDay } from '$lib/analytics';
	import { niceCeiling } from '$lib/analytics';
	import { formatCompact, formatNumber } from '$lib/utils/money';

	interface Props {
		days: FilledDay[];
		/** Drawn as a dashed reference rule across the plot. */
		average?: number;
	}

	let { days, average = 0 }: Props = $props();

	// Fixed viewBox + preserveAspectRatio="none" on the bars only would distort
	// text, so the whole chart is laid out in a 720x220 space and scaled by CSS.
	const W = 720;
	const H = 220;
	const PAD = { top: 16, right: 8, bottom: 28, left: 44 };

	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;

	const ceiling = $derived(niceCeiling(Math.max(...days.map((d) => d.expense), average, 0)));
	const slot = $derived(days.length > 0 ? plotW / days.length : plotW);
	const barW = $derived(Math.max(3, Math.min(slot - 4, 26)));

	const ticks = $derived([0, 0.5, 1].map((f) => ({ value: ceiling * f, y: PAD.top + plotH * (1 - f) })));

	function x(index: number): number {
		return PAD.left + slot * index + (slot - barW) / 2;
	}

	function height(value: number): number {
		return ceiling > 0 ? Math.max(value > 0 ? 2 : 0, (value / ceiling) * plotH) : 0;
	}

	/** Label roughly every ~6 slots so the axis never collides with itself. */
	const labelEvery = $derived(Math.max(1, Math.ceil(days.length / 8)));

	function dayNumber(key: string): string {
		return String(Number(key.slice(8, 10)));
	}
</script>

<figure class="chart">
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="ยอดใช้จ่ายรายวัน">
		{#each ticks as tick (tick.y)}
			<line class="grid" x1={PAD.left} x2={W - PAD.right} y1={tick.y} y2={tick.y} />
			<text class="tick" x={PAD.left - 8} y={tick.y + 4} text-anchor="end">
				{formatCompact(tick.value)}
			</text>
		{/each}

		{#if average > 0 && ceiling > 0}
			<line
				class="average"
				x1={PAD.left}
				x2={W - PAD.right}
				y1={PAD.top + plotH * (1 - average / ceiling)}
				y2={PAD.top + plotH * (1 - average / ceiling)}
			/>
		{/if}

		{#each days as day, i (day.day)}
			{@const h = height(day.expense)}
			<g class="bar" class:today={day.isToday} class:empty={day.expense === 0}>
				<rect
					x={x(i)}
					y={PAD.top + plotH - h}
					width={barW}
					height={h}
					rx={Math.min(3, barW / 2)}
				>
					<title>{day.day} · {formatNumber(day.expense)} บาท</title>
				</rect>
				{#if day.income > 0}
					<circle class="income-dot" cx={x(i) + barW / 2} cy={PAD.top + plotH + 8} r="2.5">
						<title>รายรับ {formatNumber(day.income)} บาท</title>
					</circle>
				{/if}
			</g>
			{#if i % labelEvery === 0 || day.isToday}
				<text class="axis" x={x(i) + barW / 2} y={H - 8} text-anchor="middle">
					{dayNumber(day.day)}
				</text>
			{/if}
		{/each}

		<line class="baseline" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />
	</svg>
</figure>

<style>
	.chart {
		margin: 0;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		/* Uniform scaling — stretching the viewBox would distort the axis type. */
		aspect-ratio: 720 / 220;
		overflow: visible;
	}

	.grid {
		stroke: var(--rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.baseline {
		stroke: var(--rule-strong);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.average {
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 3 5;
		opacity: 0.7;
		vector-effect: non-scaling-stroke;
	}

	.tick,
	.axis {
		font-family: var(--font-num);
		font-size: 11px;
		fill: var(--ink-faint);
	}

	.bar rect {
		fill: var(--out);
		opacity: 0.78;
		transition: opacity var(--dur-fast) var(--ease);
	}

	.bar:hover rect {
		opacity: 1;
	}

	.bar.today rect {
		fill: var(--accent);
		opacity: 1;
	}

	.bar.empty rect {
		fill: var(--rule);
	}

	.income-dot {
		fill: var(--in);
	}
</style>
