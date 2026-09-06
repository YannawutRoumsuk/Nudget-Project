<script lang="ts">
	import type { ActionData, PageData } from './$types';

	type Liff = { init(config: { liffId: string; withLoginOnExternalBrowser?: boolean }): Promise<void>; isLoggedIn(): boolean; getAccessToken(): string | null };

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let liffError = $state('');
	let liffBusy = $state(false);

	async function loginWithLine() {
		const liff = (window as Window & { liff?: Liff }).liff;
		if (!data.liffId || !liff) { liffError = 'LINE Login ยังโหลดไม่เสร็จ ลองอีกครั้ง'; return; }
		liffBusy = true;
		liffError = '';
		try {
			await liff.init({ liffId: data.liffId, withLoginOnExternalBrowser: true });
			if (!liff.isLoggedIn()) return;
			const accessToken = liff.getAccessToken();
			if (!accessToken) throw new Error('ไม่ได้รับ access token จาก LINE');
			const response = await fetch('/api/auth/line', {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessToken })
			});
			if (!response.ok) throw new Error('ยืนยันตัวตนไม่สำเร็จ');
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
			<p class="divider">หรือใช้รหัสผ่าน</p>
		{/if}

		{#if data.configured}
			<form method="POST">
				<label for="password">รหัสผ่าน</label>
				<input id="password" name="password" type="password" autocomplete="current-password" required />
				<button type="submit">เข้าสู่ระบบ</button>
			</form>
		{:else}
			<p class="setup">
				ยังไม่ได้ตั้งค่า — ใส่ <code>DASHBOARD_PASSWORD</code> และ <code>SESSION_SECRET</code>
				ในไฟล์ <code>.env</code> แล้วรีสตาร์ท dev server
			</p>
		{/if}

		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
		{#if liffError}<p class="error" role="alert">{liffError}</p>{/if}
	</div>
</div>

<style>
	.gate {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: 2rem 0;
	}

	.plate {
		width: min(100%, 22rem);
		padding: 2.25rem 2rem;
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
		margin-bottom: 1.75rem;
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-align: left;
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

	button {
		margin-top: 0.4rem;
		padding: 0.7rem;
		font-weight: 600;
		color: var(--paper-raised);
		background: var(--ink);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: transform var(--dur-fast) var(--ease);
	}

	button:hover {
		transform: translateY(-1px);
	}

	.line-login { width: 100%; margin: 0 0 0.7rem; background: #06c755; }
	.divider { margin: 0 0 0.7rem; font-size: var(--text-xs); color: var(--ink-faint); }

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
</style>
