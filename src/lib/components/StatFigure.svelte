<script lang="ts">
	import { formatNumber } from '$lib/utils/money';

	interface Props {
		label: string;
		value: number;
		/** Drives the accent colour and the +/- prefix. */
		tone?: 'in' | 'out' | 'neutral';
		caption?: string;
		emphasis?: boolean;
	}

	let { label, value, tone = 'neutral', caption, emphasis = false }: Props = $props();

	const prefix = $derived(tone === 'in' ? '+' : tone === 'out' ? '-' : value < 0 ? '-' : '');
	const display = $derived(formatNumber(Math.abs(value)));
</script>

<div class="figure" class:emphasis data-tone={tone}>
	<p class="eyebrow">{label}</p>
	<p class="value num">
		<span class="prefix">{prefix}</span>{display}<span class="unit">บาท</span>
	</p>
	{#if caption}<p class="caption">{caption}</p>{/if}
</div>

<style>
	.figure {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1.1rem 1.25rem 1.25rem;
		border-left: 3px solid var(--rule-strong);
	}

	.figure[data-tone='in'] {
		border-left-color: var(--in);
	}
	.figure[data-tone='out'] {
		border-left-color: var(--out);
	}

	.value {
		font-size: var(--text-figure);
		font-weight: 600;
		line-height: 1.1;
		color: var(--ink);
	}

	.emphasis .value {
		font-size: var(--text-display);
		font-weight: 700;
	}

	[data-tone='in'] .prefix {
		color: var(--in);
	}
	[data-tone='out'] .prefix {
		color: var(--out);
	}

	.unit {
		margin-left: 0.35rem;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--ink-faint);
	}

	.caption {
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}
</style>
