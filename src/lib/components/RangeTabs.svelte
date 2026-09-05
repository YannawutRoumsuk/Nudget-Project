<script lang="ts">
	import { page } from '$app/state';
	import type { RangeOption } from '$lib/types';

	interface Props {
		options: RangeOption[];
		active: string;
	}

	let { options, active }: Props = $props();

	function hrefFor(id: string): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('range', id);
		return `${page.url.pathname}?${params}`;
	}
</script>

<nav class="tabs" aria-label="ช่วงเวลา">
	{#each options as option (option.id)}
		<a
			href={hrefFor(option.id)}
			class:active={option.id === active}
			aria-current={option.id === active ? 'page' : undefined}
			data-sveltekit-noscroll
		>
			{option.label}
		</a>
	{/each}
</nav>

<style>
	.tabs {
		display: inline-flex;
		gap: 0.15rem;
		padding: 0.2rem;
		background: var(--paper-sunken);
		border: 1px solid var(--rule);
		border-radius: 999px;
	}

	a {
		padding: 0.35rem 0.85rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--ink-muted);
		border-radius: 999px;
		transition:
			background var(--dur-fast) var(--ease),
			color var(--dur-fast) var(--ease);
	}

	a:hover {
		color: var(--ink);
		background: color-mix(in oklch, var(--ink) 7%, transparent);
	}

	a.active {
		color: var(--paper-raised);
		background: var(--ink);
	}
</style>
