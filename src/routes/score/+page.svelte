<script lang="ts">
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import { formatNumber } from '$lib/utils/money';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const grade = (score: number | null) => score === null ? 'ยังไม่มีข้อมูลพอ' : score >= 80 ? 'ภาพรวมแข็งแรง' : score >= 60 ? 'ยังมีจุดปรับได้' : 'ควรทบทวนแผน';
</script>

<svelte:head><title>สุขภาพการเงิน · Nudget</title></svelte:head>
<section class="head"><div><p class="eyebrow">{data.month.label}</p><h1>สุขภาพการเงิน</h1><p>คะแนนช่วยติดตามแนวโน้มจากข้อมูลที่บันทึกไว้ ไม่ใช่คะแนนเครดิตหรือคำแนะนำการลงทุน</p></div><MonthNavigator month={data.month} /></section>

<section class="hero card">
	<div class="score" aria-label={data.currentScore.score === null ? 'ยังคำนวณคะแนนไม่ได้' : `คะแนน ${data.currentScore.score} จาก 100`}><strong>{data.currentScore.score ?? '—'}</strong><span>/ 100</span></div>
	<div><p class="eyebrow">{grade(data.currentScore.score)}</p><h2>ภาพรวมเดือนนี้</h2><p>{data.currentScore.knownFactors} จาก 5 ปัจจัยมีข้อมูลให้คำนวณ{data.scoreChange === null ? '' : ` · ${data.scoreChange > 0 ? 'เพิ่ม' : data.scoreChange < 0 ? 'ลด' : 'เท่าเดิม'} ${Math.abs(data.scoreChange)} คะแนนจากเดือนก่อน`}</p></div>
</section>

<section class="factors" aria-label="รายละเอียดปัจจัยคะแนน">
	{#each data.factors as factor (factor.id)}
		{@const change = factor.score === null || factor.previousScore === null ? null : factor.score - factor.previousScore}
		<article class="card factor">
			<header><div><h2>{factor.label}</h2><span>น้ำหนัก {factor.weight}%</span></div><strong class:unknown={factor.score === null}>{factor.score === null ? '—' : `${factor.score}/100`}</strong></header>
			{#if factor.score !== null}<progress max="100" value={factor.score} aria-label={`${factor.label} ${factor.score} คะแนน`}></progress>{/if}
			<p>{factor.reason}</p>
			<p class="comparison">{factor.previousScore === null ? 'เดือนก่อนข้อมูลไม่พอให้เปรียบเทียบ' : change === null ? `เดือนก่อน ${factor.previousScore}/100 · เดือนนี้ข้อมูลไม่พอ` : `เดือนก่อน ${factor.previousScore}/100 · ${change > 0 ? `เพิ่ม ${change}` : change < 0 ? `ลด ${Math.abs(change)}` : 'เท่าเดิม'} คะแนน`}</p>
			<a href={factor.href}>ดูข้อมูลที่เกี่ยวข้อง →</a>
		</article>
	{/each}
</section>

{#if data.recommendations.length}
	<section class="card advice"><h2>จุดที่ลองปรับได้</h2><ul>{#each data.recommendations as item}<li><span>{item.text}</span><a href={item.href}>เปิดดู →</a></li>{/each}</ul></section>
{/if}

<section class="card method"><h2>คะแนนนี้ดูจากอะไร</h2><p>คำนวณจากอัตราเงินเหลือ การคุมงบ ภาระบิล เงินสำรองฉุกเฉิน และความสม่ำเสมอในการบันทึก โดยใช้เฉพาะปัจจัยที่มีข้อมูลจริง น้ำหนักของปัจจัยที่ยังไม่มีข้อมูลจะไม่ถูกนับเป็นศูนย์</p><p>คะแนนเป็นเครื่องมือดูแนวโน้มส่วนตัว ไม่ใช่การจัดอันดับ ไม่รับประกันผลลัพธ์ และไม่ใช้แทนคำแนะนำจากผู้เชี่ยวชาญ</p></section>

<style>
	.head{display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap;margin-bottom:var(--stack)}h1{font-size:var(--text-xl)}.head p:last-child,.factor p,.factor header span,.method p{color:var(--ink-muted)}.hero{display:flex;align-items:center;gap:1.2rem;padding:1.4rem;margin-bottom:var(--stack)}.hero h2{margin:.1rem 0}.hero p:last-child{margin:0;color:var(--ink-muted)}.score{display:grid;place-items:center;align-content:center;min-width:7.5rem;min-height:7.5rem;border:5px solid var(--accent);border-radius:50%}.score strong{font:700 2.25rem var(--font-num)}.score span{font-size:var(--text-sm);color:var(--ink-muted)}.factors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.factor{padding:1rem}.factor header{display:flex;justify-content:space-between;gap:1rem;align-items:start}.factor h2,.method h2,.advice h2{margin:0 0 .25rem;font-size:1.05rem}.factor header span{font-size:var(--text-sm)}.factor header>strong{white-space:nowrap;font-size:1.2rem}.factor header>strong.unknown{color:var(--ink-muted)}.factor progress{width:100%;height:.65rem;accent-color:var(--accent)}.factor p{line-height:1.55;font-size:var(--text-sm);min-height:2.5rem}.factor p.comparison{min-height:0;font-size:.8rem}.factor a,.advice a{color:var(--accent-ink);font-weight:600}.advice,.method{padding:1.2rem;margin-top:var(--stack)}.advice ul{list-style:none;padding:0;margin:0}.advice li{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--rule)}.advice li:last-child{border:0}.advice li a{white-space:nowrap}.method p{line-height:1.65;margin-bottom:.5rem}.method p:last-child{margin-bottom:0}
	@media(max-width:600px){.factors{grid-template-columns:1fr}.hero{align-items:start}.score{min-width:6rem;min-height:6rem;flex:none}.score strong{font-size:1.8rem}.advice li{align-items:start}}
</style>
