<script lang="ts">
	import { formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
	import type { PageData, ActionData } from './$types';
	import type { FeedbackStatus } from '$lib/server/db/schema';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const tabs: { key: FeedbackStatus | null; label: string }[] = [
		{ key: null, label: 'ทั้งหมด' },
		{ key: 'new', label: 'ใหม่' },
		{ key: 'read', label: 'อ่านแล้ว' },
		{ key: 'done', label: 'เสร็จแล้ว' }
	];
	const total = $derived(data.counts.new + data.counts.read + data.counts.done);
	function tabCount(key: FeedbackStatus | null): number {
		return key === null ? total : data.counts[key];
	}
	function tabHref(key: FeedbackStatus | null): string {
		return key ? `/feedback?status=${key}` : '/feedback';
	}

	const STATUS_LABEL: Record<FeedbackStatus, string> = { new: 'ใหม่', read: 'อ่านแล้ว', done: 'เสร็จแล้ว' };

	function senderName(item: (typeof data.feedback)[number]): string {
		return item.currentDisplayName || item.displayName || '(ไม่ทราบชื่อ LINE)';
	}
</script>

<svelte:head><title>ความคิดเห็น · Nudget</title></svelte:head>

<section class="head">
	<div>
		<p class="eyebrow">ติดต่อและเสนอแนะ</p>
		<h1>ฟีดแบ็ก</h1>
		<p>{data.isOwner ? 'ข้อความจากสมาชิกเรียงจากล่าสุดไปเก่าสุด' : 'ส่งปัญหา ความเห็น หรือสิ่งที่อยากให้เพิ่มถึงแอดมินได้โดยตรง'}</p>
	</div>
</section>

{#if form?.message}<p class="notice">{form.message}</p>{/if}

{#if !data.isOwner}
	<section class="card compose">
		<form method="POST" action="?/submit">
			<label for="message">ข้อความถึงแอดมิน</label>
			<textarea id="message" name="message" rows="7" maxlength="1000" required placeholder="บอกปัญหาที่เจอ หรือฟีเจอร์ที่อยากได้"></textarea>
			<p>ข้อความนี้มีเพียงแอดมินที่เปิดดูได้ และระบบจะแจ้งเตือนแอดมินหลังส่งทันที</p>
			<button type="submit" class="primary">ส่งฟีดแบ็ก</button>
		</form>
	</section>
{:else}
<nav class="tabs">
	{#each tabs as tab (tab.key ?? 'all')}
		<a href={tabHref(tab.key)} class:active={data.status === tab.key}>
			{tab.label} <span class="count">{tabCount(tab.key)}</span>
		</a>
	{/each}
</nav>

<section class="list">
	{#each data.feedback as item (item.id)}
		<article class="card entry">
			<header>
				<div>
					<h2>{senderName(item)}</h2>
					<span class="tag status-{item.status}">{STATUS_LABEL[item.status]}</span>
				</div>
				<time datetime={item.createdAt.toISOString()}>
					{formatThaiShortDate(item.createdAt)} {formatThaiTime(item.createdAt)} น.
				</time>
			</header>
			<p class="message">{item.message}</p>
			<footer>
				{#if item.status !== 'read' && item.status !== 'done'}
					<form method="POST" action="?/markStatus">
						<input type="hidden" name="id" value={item.id} />
						<input type="hidden" name="status" value="read" />
						<button type="submit">ทำเครื่องหมายว่าอ่านแล้ว</button>
					</form>
				{/if}
				{#if item.status !== 'done'}
					<form method="POST" action="?/markStatus">
						<input type="hidden" name="id" value={item.id} />
						<input type="hidden" name="status" value="done" />
						<button type="submit" class="primary">ทำเครื่องหมายว่าเสร็จแล้ว</button>
					</form>
				{:else}
					<form method="POST" action="?/markStatus">
						<input type="hidden" name="id" value={item.id} />
						<input type="hidden" name="status" value="new" />
						<button type="submit" class="ghost">เปิดใหม่อีกครั้ง</button>
					</form>
				{/if}
			</footer>
		</article>
	{/each}
	{#if data.feedback.length === 0}<p class="empty">ยังไม่มีความคิดเห็นในหมวดนี้</p>{/if}
</section>
{/if}

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child{color:var(--ink-muted)}
	.notice{margin-bottom:1rem;color:var(--out)}
	.compose{max-width:44rem;padding:1.25rem}.compose form{display:grid;gap:.75rem}.compose label{font-weight:700}.compose textarea{box-sizing:border-box;width:100%;padding:.8rem;border:1px solid var(--rule-strong);border-radius:var(--radius);background:var(--paper-raised);color:var(--ink);font:inherit;resize:vertical}.compose p{color:var(--ink-muted);font-size:var(--text-sm)}
	.tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:var(--stack-lg)}
	.tabs a{padding:.4rem .8rem;border-radius:999px;border:1px solid var(--rule-strong);color:var(--ink-muted);font-size:var(--text-sm);text-decoration:none}
	.tabs a.active{border-color:var(--accent);color:var(--accent)}
	.tabs .count{color:var(--ink-faint);font-size:var(--text-xs)}
	.list{display:grid;gap:1rem}
	.entry{padding:1rem}
	.entry header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}
	.entry header div{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
	.entry h2{font-size:1.05rem}
	.entry time{color:var(--ink-faint);font-size:var(--text-xs);white-space:nowrap}
	.tag{font-size:var(--text-xs);padding:.1rem .45rem;border-radius:999px;border:1px solid var(--rule-strong);color:var(--ink-muted)}
	.tag.status-new{border-color:var(--accent);color:var(--accent)}
	.tag.status-read{border-color:var(--in);color:var(--in)}
	.tag.status-done{border-color:var(--ink-faint);color:var(--ink-faint)}
	.message{margin:.8rem 0;white-space:pre-wrap;word-break:break-word;font-size:var(--text-sm)}
	footer{display:flex;gap:.5rem;flex-wrap:wrap}
	button{padding:.55rem .8rem;border:0;border-radius:var(--radius);background:var(--paper-raised);color:var(--ink);border:1px solid var(--rule-strong);cursor:pointer}
	button.primary{background:var(--ink);color:var(--paper-raised);border-color:var(--ink)}
	button.ghost{background:transparent}
	.empty{color:var(--ink-faint)}
	@media(max-width:650px){.entry header{flex-direction:column}}
</style>
