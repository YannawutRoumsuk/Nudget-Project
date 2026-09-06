<script lang="ts">
	import { formatThaiShortDate, formatThaiTime } from '$lib/utils/date';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const active = $derived(data.members.filter((m) => m.active).length);
	const idle = $derived(data.members.filter((m) => m.active && m.transactionCount === 0).length);
</script>

<svelte:head><title>สมาชิก · Nudget</title></svelte:head>

<section class="head">
	<div>
		<p class="eyebrow">ใครใช้บอทนี้บ้าง</p>
		<h1>สมาชิก</h1>
		<p>ทุกคนที่แอด Nudget เป็นเพื่อนจะได้บัญชีของตัวเองทันที หน้านี้คือที่ที่คุณเห็นว่ามีใครเข้ามาบ้าง</p>
	</div>
</section>

{#if form?.message}<p class="notice">{form.message}</p>{/if}

<section class="stats">
	<article class="card stat"><p>ใช้งานอยู่</p><strong class="num">{active}</strong></article>
	<article class="card stat"><p>ปิดสิทธิ์แล้ว</p><strong class="num">{data.members.length - active}</strong></article>
	<article class="card stat"><p>ยังไม่เคยบันทึก</p><strong class="num">{idle}</strong></article>
</section>

<section class="list">
	{#each data.members as member (member.id)}
		<article class="card member" class:inactive={!member.active}>
			<header>
				<div>
					<h2>{member.displayName || '(ไม่ทราบชื่อ LINE)'}</h2>
					{#if member.isOwner}<span class="tag owner">เจ้าของ</span>{/if}
					{#if member.lineUserId === data.ownerLineUserId}<span class="tag you">คุณ</span>{/if}
					{#if !member.active}<span class="tag off">ปิดสิทธิ์</span>{/if}
				</div>
				<strong class="num">{member.transactionCount}</strong>
			</header>
			<dl>
				<div><dt>เข้ามาเมื่อ</dt><dd>{formatThaiShortDate(member.joinedAt)} {formatThaiTime(member.joinedAt)} น.</dd></div>
				<div><dt>ใช้ล่าสุด</dt><dd>{member.lastActivityAt ? formatThaiShortDate(member.lastActivityAt) : 'ยังไม่เคยบันทึก'}</dd></div>
				<div class="wide"><dt>LINE id</dt><dd><code>{member.lineUserId}</code></dd></div>
			</dl>
			{#if !member.isOwner}
				<form method="POST" action="?/setActive">
					<input type="hidden" name="id" value={member.id} />
					<input type="hidden" name="active" value={member.active ? 'false' : 'true'} />
					<button type="submit" class:danger={member.active}>
						{member.active ? 'ปิดสิทธิ์ใช้งาน' : 'เปิดสิทธิ์อีกครั้ง'}
					</button>
				</form>
			{/if}
		</article>
	{/each}
	{#if data.members.length === 0}<p class="empty">ยังไม่มีใครแอดบอทเลย</p>{/if}
</section>

<p class="foot">ปิดสิทธิ์แล้วรายการเงินของคนนั้นยังอยู่ครบ ไม่ได้ถูกลบ — เปิดกลับได้ทุกเมื่อ</p>

<style>
	.head{margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child{color:var(--ink-muted)}
	.notice{margin-bottom:1rem;color:var(--out)}
	.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-bottom:var(--stack-lg)}
	.stat{padding:1rem;display:grid;gap:.25rem}.stat p{color:var(--ink-muted);font-size:var(--text-xs)}.stat strong{font-size:var(--text-xl)}
	.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
	.member{padding:1rem}.member.inactive{opacity:.6}
	.member header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}
	.member header div{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
	.member h2{font-size:1.05rem}
	.tag{font-size:var(--text-xs);padding:.1rem .45rem;border-radius:999px;border:1px solid var(--rule-strong);color:var(--ink-muted)}
	.tag.owner{border-color:var(--accent);color:var(--accent)}.tag.you{border-color:var(--in);color:var(--in)}.tag.off{border-color:var(--out);color:var(--out)}
	dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:.8rem 0}
	dl div.wide{grid-column:1/-1}dt{font-size:var(--text-xs);color:var(--ink-faint)}dd{font-size:var(--text-sm)}
	code{font-size:var(--text-xs);word-break:break-all;color:var(--ink-muted)}
	button{padding:.55rem .8rem;border:0;border-radius:var(--radius);background:var(--ink);color:var(--paper-raised);cursor:pointer;width:100%}
	button.danger{background:var(--out)}
	.empty{color:var(--ink-faint)}.foot{margin-top:var(--stack);color:var(--ink-faint);font-size:var(--text-sm)}
	@media(max-width:650px){.list,.stats,dl{grid-template-columns:1fr}}
</style>
