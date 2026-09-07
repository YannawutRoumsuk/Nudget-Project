<script lang="ts">
	import { page } from '$app/state';
	import type { MonthSelection } from '$lib/month';

	let { month }: { month: MonthSelection } = $props();

	const preserved = $derived(
		[...page.url.searchParams.entries()].filter(([key]) => key !== 'month' && key !== 'range')
	);

	function hrefFor(key: string): string {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('month', key);
		params.set('range', 'month');
		return `${page.url.pathname}?${params}`;
	}
</script>

<div class="month-nav" aria-label="เลือกเดือน">
	{#if month.previous}
		<a class="step" href={hrefFor(month.previous)} aria-label="เดือนก่อนหน้า">‹</a>
	{:else}
		<span class="step disabled" aria-hidden="true">‹</span>
	{/if}

	<form method="GET">
		{#each preserved as [key, value] (`${key}:${value}`)}
			<input type="hidden" name={key} value={value} />
		{/each}
		<input type="hidden" name="range" value="month" />
		<label>
			<span>{month.label}</span>
			<input type="month" name="month" value={month.key} min={month.min} max={month.max} required />
		</label>
		<button type="submit">ดู</button>
	</form>

	{#if month.next}
		<a class="step" href={hrefFor(month.next)} aria-label="เดือนถัดไป">›</a>
	{:else}
		<span class="step disabled" aria-label="เดือนปัจจุบัน">›</span>
	{/if}
</div>

<style>
	.month-nav,form{display:flex;align-items:center;gap:.35rem}form{padding:.25rem;background:var(--paper-sunken);border:1px solid var(--rule);border-radius:var(--radius)}
	label{display:grid;position:relative;min-width:9.5rem;padding:.25rem .45rem}label span{font-size:var(--text-sm);font-weight:600;text-align:center}input[type='month']{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
	button,.step{display:grid;place-items:center;min-width:2.35rem;height:2.35rem;padding:0;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised);color:var(--ink);font-size:1.2rem;cursor:pointer}
	button{padding:0 .7rem;font-size:var(--text-sm);font-weight:600;background:var(--ink);color:var(--paper-raised)}.disabled{color:var(--ink-faint);cursor:default}
	@media(max-width:480px){.month-nav{width:100%}form{flex:1}label{min-width:0;flex:1}.step{flex:0 0 2.35rem}}
</style>
