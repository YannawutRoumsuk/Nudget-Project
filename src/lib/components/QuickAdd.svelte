<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		/** Set by the `add` action: confirmation text, or an error to show. */
		result?: { ok: boolean; message: string } | null;
	}

	let { result = null }: Props = $props();

	let value = $state('');
	let pending = $state(false);
</script>

<form
	method="POST"
	action="?/add"
	class="quick-add"
	use:enhance={() => {
		pending = true;
		return async ({ update, result: actionResult }) => {
			try {
				await update({ reset: false });
				if (actionResult.type === 'success' && actionResult.data?.ok) value = '';
			} finally {
				pending = false;
			}
		};
	}}
>
	<label class="visually-hidden" for="quick-add-input">บันทึกรายการ</label>
	<input
		id="quick-add-input"
		name="text"
		bind:value
		placeholder="ข้าวเที่ยง 60 · +เงินเดือน 30000 · เมื่อวาน แท็กซี่ 120"
		autocomplete="off"
		enterkeyhint="done"
		required
	/>
	<button type="submit" disabled={pending || value.trim() === ''}>
		{pending ? 'กำลังบันทึก…' : 'บันทึก'}
	</button>
</form>

{#if result}
	<p class="result" class:error={!result.ok} role="status">{result.message}</p>
{/if}

<style>
	.quick-add {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0.7rem 0.9rem;
		background: var(--paper-raised);
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius);
		transition:
			border-color var(--dur-fast) var(--ease),
			box-shadow var(--dur-fast) var(--ease);
	}

	input::placeholder {
		color: var(--ink-faint);
	}

	input:hover {
		border-color: var(--ink-faint);
	}

	input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
	}

	button {
		padding: 0.7rem 1.15rem;
		font-weight: 600;
		color: var(--paper-raised);
		background: var(--ink);
		border: 1px solid var(--ink);
		border-radius: var(--radius);
		cursor: pointer;
		transition:
			transform var(--dur-fast) var(--ease),
			opacity var(--dur-fast) var(--ease);
	}

	button:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	button:active:not(:disabled) {
		transform: translateY(0);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.result {
		margin-top: 0.6rem;
		padding: 0.55rem 0.8rem;
		font-size: var(--text-sm);
		white-space: pre-line;
		background: var(--in-soft);
		border-radius: var(--radius);
	}

	.result.error {
		background: var(--out-soft);
	}
</style>
