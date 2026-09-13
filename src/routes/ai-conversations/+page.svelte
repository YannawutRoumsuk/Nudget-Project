<script lang="ts">
	import { formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>บทสนทนา AI · Nudget</title></svelte:head>

<section class="head">
	<p class="eyebrow">สำหรับแอดมินเท่านั้น</p>
	<h1>บทสนทนาช่วยเหลือ AI</h1>
	<p>เก็บเฉพาะข้อความที่สมาชิกส่งในโหมด “ช่วยเหลือ” เพื่อดูคุณภาพคำตอบและแก้คู่มือ</p>
</section>

<section class="list">
	{#each data.conversations as item (item.id)}
		<article class="card entry">
			<header>
				<strong>{item.displayName || `สมาชิก #${item.userId}`}</strong>
				<time datetime={item.createdAt.toISOString()}>{formatThaiShortDate(item.createdAt)} {formatThaiTime(item.createdAt)} น.</time>
			</header>
			<div class="turn user"><span>สมาชิก</span><p>{item.userMessage}</p></div>
			<div class="turn ai"><span>AI</span><p>{item.assistantMessage}</p></div>
			<footer>{item.provider} · {item.model} · {item.inputTokens + item.outputTokens} tokens</footer>
		</article>
	{/each}
	{#if data.conversations.length === 0}<p class="empty">ยังไม่มีบทสนทนา AI</p>{/if}
</section>

<style>
	.head{margin-bottom:var(--stack-lg)}h1{font-size:var(--text-xl)}.head p:last-child{color:var(--ink-muted)}.list{display:grid;gap:1rem}.entry{padding:1rem}.entry header{display:flex;justify-content:space-between;gap:1rem}.entry time,.entry footer{color:var(--ink-faint);font-size:var(--text-xs)}.turn{margin-top:.8rem;padding:.7rem;border-radius:var(--radius);background:var(--paper-raised)}.turn span{font-size:var(--text-xs);font-weight:700;color:var(--ink-muted)}.turn p{white-space:pre-wrap;word-break:break-word}.ai{border-left:3px solid var(--accent)}.entry footer{margin-top:.7rem}.empty{color:var(--ink-faint)}
</style>
