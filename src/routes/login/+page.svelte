<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>เข้าสู่ระบบ · Nudget</title>
</svelte:head>

<div class="gate">
	<div class="plate">
		<span class="mark" aria-hidden="true">฿</span>
		<h1>Nudget</h1>
		<p class="tagline">สมุดบัญชีส่วนตัวที่คุยผ่าน LINE</p>

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
