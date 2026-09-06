<script lang="ts">
	import { page } from '$app/state';
	import '$lib/styles/global.css';

	let { children, data } = $props();

	const NAV = $derived([
		{ href: '/', label: 'ภาพรวม' },
		{ href: '/transactions', label: 'รายการ' },
		{ href: '/bills', label: 'บิล' },
		{ href: '/plan', label: 'แผนเดือน' },
		{ href: '/export', label: 'ส่งออก' },
		...(data?.isOwner ? [{ href: '/members', label: 'สมาชิก' }] : [])
	]);

	const showChrome = $derived(page.url.pathname !== '/login');
</script>

<div class="shell">
	{#if showChrome}
		<header class="masthead">
			<a href="/" class="wordmark">
				<span class="mark" aria-hidden="true">฿</span>
				<span class="name">Nudget</span>
			</a>

			<nav aria-label="หน้าหลัก">
				{#each NAV as item (item.href)}
					<a
						href={item.href}
						class:active={page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(`${item.href}/`))}
						aria-current={page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(`${item.href}/`)) ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<form method="POST" action="/logout">
				<button type="submit">ออก</button>
			</form>
		</header>
	{/if}

	<main>
		{@render children?.()}
	</main>
</div>

<style>
	.shell {
		max-width: 74rem;
		margin-inline: auto;
		padding: 0 var(--gutter) 4rem;
	}

	.masthead {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem 0 0.85rem;
		margin-bottom: var(--stack-lg);
		background: color-mix(in oklch, var(--paper) 88%, transparent);
		border-bottom: 1px solid var(--rule);
		backdrop-filter: blur(10px);
	}

	.wordmark {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-right: auto;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		font-family: var(--font-num);
		font-size: 1rem;
		font-weight: 700;
		color: var(--paper-raised);
		background: var(--ink);
		border-radius: 7px;
	}

	.name {
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	nav {
		display: flex;
		gap: 0.35rem;
	}

	nav a {
		position: relative;
		padding: 0.3rem 0.2rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--ink-muted);
		transition: color var(--dur-fast) var(--ease);
	}

	nav a::after {
		position: absolute;
		right: 0.2rem;
		bottom: -0.1rem;
		left: 0.2rem;
		height: 2px;
		background: var(--ink);
		border-radius: 2px;
		transform: scaleX(0);
		transform-origin: left;
		transition: transform var(--dur) var(--ease);
		content: '';
	}

	nav a:hover {
		color: var(--ink);
	}

	nav a:hover::after,
	nav a.active::after {
		transform: scaleX(1);
	}

	nav a.active {
		color: var(--ink);
	}

	form button {
		padding: 0.3rem 0.7rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
		background: transparent;
		border: 1px solid var(--rule-strong);
		border-radius: 999px;
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease);
	}

	form button:hover {
		color: var(--ink);
		border-color: var(--ink-faint);
	}

	@media (max-width: 700px) {
		.masthead {
			flex-wrap: wrap;
			gap: 0.55rem;
		}

		nav {
			order: 3;
			width: 100%;
			overflow-x: auto;
			scrollbar-width: none;
		}

		nav::-webkit-scrollbar {
			display: none;
		}

		nav a {
			flex: 0 0 auto;
			white-space: nowrap;
		}
	}
</style>
