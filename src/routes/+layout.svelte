<script lang="ts">
	import { page } from '$app/state';
	import { isMonthKey } from '$lib/month';
	import '$lib/styles/global.css';

	let { children, data } = $props();

	const NAV = [
		{ href: '/', label: 'ภาพรวม' },
		{ href: '/transactions', label: 'รายการ' },
		{ href: '/bills', label: 'บิล' },
		{ href: '/plan', label: 'แผนเดือน' },
		{ href: '/insights', label: 'วิเคราะห์' }
	];
	const MORE_GROUPS = $derived([
		{ label: 'จัดการเงิน', items: [
			{ href: '/cards', label: 'บัตรเครดิต' },
			{ href: '/goals', label: 'เป้าหมายออม' },
			{ href: '/recurring', label: 'รายการประจำ' }
		] },
		{ label: 'วางแผนและสรุป', items: [
			{ href: '/cashflow', label: 'กระแสเงินสด' },
			{ href: '/forecast', label: 'คาดการณ์' },
			{ href: '/report', label: 'รายงานเดือน' },
			{ href: '/score', label: 'สุขภาพการเงิน' },
			{ href: '/what-if', label: 'ทดลองแผน' }
		] },
		{ label: 'ข้อมูลและตั้งค่า', items: [
			{ href: '/import', label: 'นำเข้าข้อมูล' },
			{ href: '/export', label: 'ส่งออกข้อมูล' },
			{ href: '/learned-categories', label: 'กฎหมวดหมู่' },
			{ href: '/notifications', label: 'การแจ้งเตือน' },
			{ href: '/privacy', label: 'ข้อมูลส่วนตัว' },
			{ href: '/feedback', label: 'ฟีดแบ็ก' }
		] },
		...(data?.isOwner ? [{ label: 'สำหรับแอดมิน', items: [
			{ href: '/members', label: 'สมาชิก' },
			{ href: '/ai-conversations', label: 'บทสนทนา AI' },
			{ href: '/status', label: 'สถานะระบบ' }
		] }] : [])
	]);
	const MORE_PATHS = $derived(MORE_GROUPS.flatMap((group) => group.items.map((item) => item.href)));
	const selectedMonth = $derived(isMonthKey(page.url.searchParams.get('month')) ? page.url.searchParams.get('month') : null);
	/** Pages with no notion of a month, so the picker's choice must not follow them. */
	const MONTHLESS = ['/members', '/feedback', '/notifications', '/ai-conversations', '/cards', '/status', '/privacy', '/learned-categories', '/import', '/goals'];
	const navHref = (href: string) =>
		selectedMonth && !MONTHLESS.includes(href) ? `${href}?month=${selectedMonth}` : href;
	const isCurrent = (href: string) => page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(`${href}/`));

	const showChrome = $derived(page.url.pathname !== '/login');
</script>

<div class="shell">
	{#if showChrome}
		<header class="masthead">
			<a href={navHref('/')} class="wordmark">
				<span class="mark" aria-hidden="true">฿</span>
				<span class="name">Nudget</span>
			</a>

			<nav aria-label="หน้าหลัก">
				{#each NAV as item (item.href)}
					<a
						href={navHref(item.href)}
						class:active={isCurrent(item.href)}
						aria-current={isCurrent(item.href) ? 'page' : undefined}
					>
						{item.label}
					</a>
				{/each}
				<details class="more-menu" class:active={MORE_PATHS.some(isCurrent)}>
					<summary>เพิ่มเติม</summary>
					<div class="more-panel">
						{#each MORE_GROUPS as group (group.label)}
							<section>
								<h2>{group.label}</h2>
								{#each group.items as item (item.href)}
									<a href={navHref(item.href)} class:active={isCurrent(item.href)} aria-current={isCurrent(item.href) ? 'page' : undefined}>{item.label}</a>
								{/each}
							</section>
						{/each}
					</div>
				</details>
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
		align-items: center;
		gap: 0.35rem;
	}

	nav > a,
	.more-menu > summary {
		position: relative;
		padding: 0.45rem 0.35rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--ink-muted);
		transition: color var(--dur-fast) var(--ease);
		white-space: nowrap;
	}

	nav > a::after,
	.more-menu > summary::after {
		position: absolute;
		right: 0.35rem;
		bottom: -0.1rem;
		left: 0.35rem;
		height: 2px;
		background: var(--ink);
		border-radius: 2px;
		transform: scaleX(0);
		transform-origin: left;
		transition: transform var(--dur) var(--ease);
		content: '';
	}

	nav > a:hover,
	.more-menu > summary:hover {
		color: var(--ink);
	}

	nav > a:hover::after,
	nav > a.active::after,
	.more-menu.active > summary::after,
	.more-menu[open] > summary::after {
		transform: scaleX(1);
	}

	nav > a.active,
	.more-menu.active > summary,
	.more-menu[open] > summary {
		color: var(--ink);
	}

	.more-menu {
		position: relative;
	}

	.more-menu > summary {
		list-style: none;
		cursor: pointer;
	}

	.more-menu > summary::-webkit-details-marker {
		display: none;
	}

	.more-panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		right: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(3, minmax(9rem, 1fr));
		gap: 1.2rem;
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(70vh, 34rem);
		overflow: auto;
		padding: 1rem;
		background: var(--paper-raised);
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 0.75rem 2rem color-mix(in oklch, var(--ink) 12%, transparent);
	}

	.more-panel section {
		display: grid;
		align-content: start;
		gap: 0.3rem;
	}

	.more-panel h2 {
		margin: 0 0 0.25rem;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.more-panel a {
		padding: 0.35rem 0.45rem;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	.more-panel a:hover,
	.more-panel a.active {
		background: var(--paper-sunken);
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
			flex-wrap: wrap;
		}

		.more-panel {
			position: fixed;
			top: auto;
			right: var(--gutter);
			left: var(--gutter);
			grid-template-columns: 1fr;
			width: auto;
			max-height: 65vh;
		}
	}
</style>
