<script lang="ts">
	import type { ActionData, PageData } from './$types';

	type Liff = {
		init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>;
		isLoggedIn(): boolean;
		getAccessToken(): string | null;
	};

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let liffError = $state('');
	let liffBusy = $state(false);

	const addFriendUrl = $derived(data.addFriendId ? `https://line.me/R/ti/p/${data.addFriendId}` : '');

	async function loginWithLine() {
		const liff = (window as Window & { liff?: Liff }).liff;
		if (!data.liffId || !liff) {
			liffError = 'LINE Login ยังโหลดไม่เสร็จ ลองอีกครั้ง';
			return;
		}
		liffBusy = true;
		liffError = '';
		try {
			await liff.init({ liffId: data.liffId, withLoginOnExternalBrowser: true });
			if (!liff.isLoggedIn()) return;
			const accessToken = liff.getAccessToken();
			if (!accessToken) throw new Error('ไม่ได้รับ access token จาก LINE');
			const response = await fetch('/api/auth/line', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ accessToken })
			});
			if (!response.ok) {
				// Surface the server's own reason — "you have no account yet" is
				// actionable, and the QR to fix it is right below this message.
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? 'ยืนยันตัวตนไม่สำเร็จ');
			}
			window.location.assign('/');
		} catch (error) {
			liffError = error instanceof Error ? error.message : 'เปิด LINE Login ไม่สำเร็จ';
		} finally {
			liffBusy = false;
		}
	}
</script>

<svelte:head>
	<title>เข้าสู่ระบบ · Nudget</title>
	{#if data.liffId}<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>{/if}
</svelte:head>

<div class="gate">
	<div class="plate">
		<span class="mark" aria-hidden="true">฿</span>
		<h1>Nudget</h1>
		<p class="tagline">สมุดบัญชีส่วนตัวที่คุยผ่าน LINE</p>

		{#if data.liffId}
			<button class="line-login" type="button" onclick={loginWithLine} disabled={liffBusy}>
				{liffBusy ? 'กำลังเปิด LINE…' : 'เข้าสู่ระบบด้วย LINE'}
			</button>
			<p class="hint">ไม่ต้องตั้งรหัสผ่าน ใช้บัญชี LINE ของคุณเอง</p>
		{/if}

		{#if liffError}<p class="error" role="alert">{liffError}</p>{/if}
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

		{#if data.addFriendId}
			<section class="join">
				<p class="join-title">ยังไม่ได้แอด Nudget?</p>
				<p class="join-sub">ต้องแอดเป็นเพื่อนก่อน ระบบถึงจะเปิดบัญชีให้</p>
				<div class="qr">
					<img src="/line-add-friend.svg" alt="QR สำหรับแอด Nudget เป็นเพื่อนใน LINE" width="132" height="132" />
				</div>
				<p class="line-id">{data.addFriendId}</p>
				<a class="add" href={addFriendUrl} target="_blank" rel="noopener noreferrer">แอดเพื่อนใน LINE</a>
			</section>
		{/if}

		{#if data.passwordLogin}
			<details class="admin">
				<summary>สำหรับแอดมิน</summary>
				<form method="POST">
					<label for="password">รหัสผ่าน</label>
					<input id="password" name="password" type="password" autocomplete="current-password" required />
					<button type="submit">เข้าสู่ระบบ</button>
				</form>
			</details>
		{/if}

		{#if data.unconfigured}
			<p class="setup">
				ยังไม่ได้ตั้งค่า — ใส่ <code>LIFF_ID</code> หรือ <code>DASHBOARD_PASSWORD</code> กับ
				<code>SESSION_SECRET</code> ในไฟล์ <code>.env</code> แล้วรีสตาร์ท dev server
			</p>
		{/if}
	</div>
</div>

<style>
	.gate {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: 2rem 1rem;
	}

	.plate {
		width: min(100%, 22rem);
		padding: 2.25rem 2rem 1.5rem;
		text-align: center;
		background: var(--paper-raised);
		border: 1px solid var(--rule);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lift);
	}

	.mark {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		margin: 0 auto 0.9rem;
		font-family: var(--font-num);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--paper-raised);
		background: var(--ink);
		border-radius: 12px;
	}

	h1 {
		font-size: var(--text-xl);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.tagline {
		margin-bottom: 1.5rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	button,
	.add {
		display: block;
		width: 100%;
		padding: 0.7rem;
		font-family: inherit;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--paper-raised);
		background: var(--ink);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: transform var(--dur-fast) var(--ease);
	}

	button:hover,
	.add:hover {
		transform: translateY(-1px);
	}

	button:disabled {
		opacity: 0.6;
		cursor: progress;
		transform: none;
	}

	.line-login {
		background: #06c755;
		color: #fff;
	}

	.hint {
		margin-top: 0.55rem;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	/* A quiet second step, deliberately below the fold of attention. */
	.join {
		margin-top: 1.5rem;
		padding-top: 1.35rem;
		border-top: 1px solid var(--rule);
	}

	.join-title {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.join-sub {
		margin-top: 0.15rem;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	/* The QR keeps its own white plate in both themes — an inverted QR is
	   unreliable to scan, so it never inherits the dark surface. */
	.qr {
		width: max-content;
		margin: 0.9rem auto 0.6rem;
		padding: 0.5rem;
		background: #fff;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}

	.qr img {
		display: block;
	}

	.line-id {
		margin-bottom: 0.75rem;
		font-family: var(--font-num);
		font-size: var(--text-sm);
		letter-spacing: 0.04em;
		color: var(--ink-muted);
	}

	.add {
		background: var(--paper-sunken);
		color: var(--ink);
		border: 1px solid var(--rule-strong);
		text-decoration: none;
	}

	.admin {
		margin-top: 1.35rem;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
		text-align: left;
	}

	summary {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		cursor: pointer;
		list-style: none;
		text-align: center;
		transition: color var(--dur-fast) var(--ease);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover {
		color: var(--ink-muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.85rem;
	}

	label {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	input {
		padding: 0.7rem 0.85rem;
		font-family: inherit;
		background: var(--paper);
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius);
		transition: border-color var(--dur-fast) var(--ease);
	}

	input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
	}

	.setup,
	.error {
		margin-top: 1rem;
		padding: 0.7rem 0.85rem;
		font-size: var(--text-sm);
		text-align: left;
		border-radius: var(--radius);
	}

	.setup {
		color: var(--ink-muted);
		background: var(--paper-sunken);
	}

	.error {
		color: var(--out);
		background: var(--out-soft);
	}

	code {
		font-family: var(--font-num);
		font-size: 0.9em;
	}

	@media (prefers-reduced-motion: reduce) {
		button,
		.add {
			transition: none;
		}
		button:hover,
		.add:hover {
			transform: none;
		}
	}
</style>
