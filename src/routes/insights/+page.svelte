<script lang="ts">
	import { enhance } from '$app/forms';
	import { categoryLabel } from '$lib/categories';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import DailyChart from '$lib/components/DailyChart.svelte';
	import MonthCompare from '$lib/components/MonthCompare.svelte';
	import MonthNavigator from '$lib/components/MonthNavigator.svelte';
	import StatFigure from '$lib/components/StatFigure.svelte';
	import { buildMonthlyFacts, totalSavings } from '$lib/insights';
	import { formatThaiShortDate } from '$lib/utils/date';
	import { formatNumber } from '$lib/utils/money';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let pending = $state(false);

	// A fresh run outranks whatever was stored when the page loaded.
	const insight = $derived(form?.insight ?? data.analysis?.insight ?? null);
	const staleNotice = $derived(!form?.insight && data.analysis?.stale === true);
	const hasData = $derived(data.input.transactionCount > 0);
	const perDay = $derived(data.input.daysElapsed > 0 ? data.input.expense / data.input.daysElapsed : 0);
	const savingsTotal = $derived(insight ? totalSavings(insight.savings) : 0);
	const facts = $derived(buildMonthlyFacts(data.input));
	const metricChange = (delta: number, percent: number | null) => {
		if (Math.abs(delta) < 1) return 'เท่าเดิม';
		const direction = delta > 0 ? 'เพิ่ม' : 'ลด';
		return `${direction} ${formatNumber(Math.abs(delta))} บาท${percent === null ? '' : ` (${Math.round(Math.abs(percent))}%)`}`;
	};
</script>

<svelte:head>
	<title>วิเคราะห์ · Nudget</title>
	<meta name="description" content="เทียบรายจ่ายเดือนต่อเดือนและคำแนะนำการประหยัด" />
</svelte:head>

<section class="head">
	<p class="eyebrow">{data.input.monthLabel}</p>
	<h1>เงินเดือนนี้ไปไหนบ้าง</h1>
	<MonthNavigator month={data.month} />
</section>

<section class="figures">
	<StatFigure label="รายรับ" value={data.input.income} tone="in" />
	<StatFigure label="จ่ายไปแล้ว" value={data.input.expense} tone="out" emphasis />
	<StatFigure label="เงินที่เหลือ" value={data.input.savings} tone="in" />
	<StatFigure label="ยอดบัตรเครดิต" value={data.input.creditCardSpent} tone="out" />
	<StatFigure label="บิลที่ยังไม่จ่าย" value={data.input.unpaidBills} tone="out" />
	<!-- Without a monthly plan there is no budget to have anything left of, and a
	     tile reading "0 บาท" would say the opposite of that. -->
	{#if data.input.remainingBudget !== null}
		<StatFigure
			label="งบที่เหลือ"
			value={data.input.remainingBudget}
			tone={data.input.remainingBudget < 0 ? 'out' : 'neutral'}
			caption="หลังกันเป้าเงินเก็บและบิล"
		/>
	{:else}
		<div class="no-plan">
			<p class="eyebrow">งบที่เหลือ</p>
			<p>ยังไม่ได้ตั้งแผนเดือนนี้</p>
			<a href="/plan?month={data.month.key}">ตั้งแผนเดือน</a>
		</div>
	{/if}
</section>

<section class="card facts">
	<p class="eyebrow">ข้อเท็จจริงจากข้อมูล</p>
	<h2>{facts.status}</h2>
	<p class="facts-meta">
		เฉลี่ยใช้จ่าย {formatNumber(Math.round(perDay))} บาท/วัน
		{#if data.input.savingsRate !== null} · อัตราออม {Math.round(data.input.savingsRate)}%{/if}
	</p>
	{#if facts.highlights.length > 0}
		<ul>{#each facts.highlights as item}<li>{item}</li>{/each}</ul>
	{/if}
	{#if facts.attention.length > 0}
		<h3>รายการที่ควรเช็ก</h3>
		<ul class="attention">{#each facts.attention as item}<li>{item}</li>{/each}</ul>
	{/if}
</section>

<section class="card analysis">
	<div class="analysis-head">
		<div>
			<p class="eyebrow">คำแนะนำจาก Gemini</p>
			<h2>{insight ? insight.headline : 'อยากรู้ว่าควรประหยัดตรงไหน'}</h2>
		</div>
		{#if hasData && data.llmEnabled}
			<form
				method="POST"
				action="?/analyze"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update({ reset: false });
						pending = false;
					};
				}}
			>
				<input type="hidden" name="month" value={data.month.key} />
				<button type="submit" disabled={pending || data.analysesLeft === 0}>
					{pending ? 'กำลังอ่านตัวเลข…' : insight ? 'วิเคราะห์ใหม่' : 'วิเคราะห์ให้หน่อย'}
				</button>
				<p class="quota">
					{data.analysesLeft === 0
						? 'วันนี้ใช้ครบแล้ว'
						: `วันนี้เหลืออีก ${data.analysesLeft} ครั้ง`}
				</p>
			</form>
		{/if}
	</div>

	{#if form?.message}<p class="notice">{form.message}</p>{/if}

	{#if !hasData}
		<p class="muted">เดือนนี้ยังไม่มีรายการ พอเริ่มบันทึกแล้วค่อยกลับมาดูได้</p>
	{:else if !data.llmEnabled}
		<p class="muted">ยังไม่ได้ตั้งค่าผู้ช่วยวิเคราะห์ กราฟและตัวเลขด้านล่างใช้ได้ตามปกติ</p>
		{#if data.llmSetup}
			<!-- Owner only. Says which setting is missing instead of leaving them to
			     guess whether a key they just added ever arrived. -->
			<p class="setup">{data.llmSetup}</p>
		{/if}
	{:else if insight}
		{#if staleNotice}
			<p class="notice">บทวิเคราะห์นี้เขียนจากตัวเลขชุดก่อน มีรายการเปลี่ยนไปแล้ว กดวิเคราะห์ใหม่ได้</p>
		{/if}
		<p class="summary">{insight.summary}</p>

		{#if insight.observations.length > 0}
			<ul class="observations">
				{#each insight.observations as observation, index (index)}
					<li>{observation}</li>
				{/each}
			</ul>
		{/if}

		{#if insight.savings.length > 0}
			<h3>ลดได้ตรงไหนบ้าง</h3>
			<ul class="savings">
				{#each insight.savings as idea, index (index)}
					<li>
						<div>
							<p class="idea">{idea.title}</p>
							<p class="detail">{idea.detail}</p>
						</div>
						{#if idea.monthlySaving > 0}
							<strong class="num">≈ {formatNumber(idea.monthlySaving)} บาท/เดือน</strong>
						{/if}
					</li>
				{/each}
			</ul>
			{#if savingsTotal > 0}
				<p class="total">รวมที่น่าจะประหยัดได้ราว {formatNumber(savingsTotal)} บาทต่อเดือน</p>
			{/if}
		{/if}

		<p class="disclaimer">
			คำแนะนำส่วนนี้เขียนโดย AI และเป็นการคาดคะเน ตัวเลขจริงอยู่ในส่วนข้อเท็จจริงและกราฟ{#if data.analysis}
				· เขียนเมื่อ {formatThaiShortDate(data.analysis.createdAt)}{/if}
		</p>
	{:else}
		<p class="muted">กดปุ่มแล้วผู้ช่วยจะอ่านยอดรวมของเดือนนี้ เทียบกับเดือนก่อน แล้วบอกว่าลดตรงไหนได้บ้าง</p>
	{/if}
</section>

<section class="card">
	<div class="compare-head">
		<div>
			<p class="eyebrow">เปรียบเทียบหลายเดือน</p>
			<h2>เทียบกับ{data.comparison.label}</h2>
		</div>
		<form method="GET" class="compare-controls">
			<input type="hidden" name="month" value={data.month.key} />
			<label>ฐานเปรียบเทียบ
				<select name="baseline" value={data.comparison.kind}>
					<option value="previous">เดือนก่อน</option>
					<option value="average3">เฉลี่ย 3 เดือนก่อน</option>
					<option value="yearAgo">เดือนเดียวกันปีก่อน</option>
				</select>
			</label>
			<label>เรียงหมวดตาม
				<select name="sort" value={data.comparisonSort}>
					<option value="amount">จำนวนเงิน</option>
					<option value="percent">เปอร์เซ็นต์</option>
				</select>
			</label>
			<button type="submit">ดูผล</button>
		</form>
	</div>
	<p class="baseline-note">ช่วงฐาน {data.comparison.periodLabel} · รายการที่ทำเครื่องหมายว่า “รายการพิเศษ” จะไม่รวมในฐาน</p>
	{#if data.comparison.availableMonths < data.comparison.totalMonths}
		<p class="sample-warning">ฐานนี้มีข้อมูลเพียง {data.comparison.availableMonths} จาก {data.comparison.totalMonths} เดือน จึงควรดูแนวโน้มอย่างระมัดระวัง</p>
	{/if}
	<div class="scroller metric-table">
		<table>
			<thead><tr><th>ตัวเลข</th><th class="num">เดือนนี้</th><th class="num">ฐาน</th><th>เปลี่ยนไป</th></tr></thead>
			<tbody>
				{#each data.comparison.metrics as metric (metric.id)}
					<tr>
						<th>{metric.label}</th>
						<td class="num">{formatNumber(metric.current)}</td>
						<td class="num muted">{formatNumber(metric.baseline)}</td>
						<td>{metricChange(metric.delta, metric.percent)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<h3>หมวดที่เปลี่ยนมากที่สุดตาม{data.comparisonSort === 'percent' ? 'เปอร์เซ็นต์' : 'จำนวนเงิน'}</h3>
	<MonthCompare categories={data.comparison.categories} previousLabel={data.comparison.label} sort={data.comparisonSort} />
</section>

<section class="card anomalies">
	<p class="eyebrow">รายการมูลค่าสูงผิดปกติ</p>
	<h2>เทียบกับรายการหมวดเดียวกันใน 3 เดือนก่อน</h2>
	<p class="baseline-note">เกณฑ์คือค่าที่สูงกว่า max(2×ค่ากลาง, Q3 + 1.5×IQR) และต้องมีอย่างน้อย 5 รายการต่อหมวด รายการที่ซ่อนหรือทำเป็นรายการพิเศษจะไม่แสดงซ้ำ</p>
	{#if data.comparison.anomalies.length > 0}
		<ul>
			{#each data.comparison.anomalies as item (item.id)}
				<li>
					<div>
						<strong>{categoryLabel(item.categoryId)} · {formatNumber(item.amount)} บาท</strong>
						<p>{formatThaiShortDate(item.occurredAt)}{item.note ? ` · ${item.note}` : ''}</p>
						<small>สูงกว่าค่ากลาง {item.ratio} เท่า · ค่ากลาง {formatNumber(item.median)} บาท · เกณฑ์ {formatNumber(item.upperFence)} บาท · ฐาน {item.sampleSize} รายการ</small>
					</div>
					<div class="anomaly-actions">
						<form method="POST" action="?/markSpecial">
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="month" value={data.month.key} />
							<input type="hidden" name="baseline" value={data.comparison.kind} />
							<input type="hidden" name="sort" value={data.comparisonSort} />
							<button type="submit" class="secondary">เป็นรายการพิเศษ</button>
						</form>
						<form method="POST" action="?/dismissAnomaly">
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="month" value={data.month.key} />
							<input type="hidden" name="baseline" value={data.comparison.kind} />
							<input type="hidden" name="sort" value={data.comparisonSort} />
							<button type="submit">รับทราบ</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">ยังไม่พบรายการที่สูงกว่าพฤติกรรมเดิมอย่างชัดเจน</p>
	{/if}
	{#if data.comparison.insufficientCategoryLabels.length > 0}
		<p class="sample-warning">ข้อมูลยังไม่พอสำหรับหมวด: {data.comparison.insufficientCategoryLabels.join(', ')}</p>
	{/if}
</section>

<div class="charts">
	<section class="card">
		<h2>สัดส่วนรายจ่าย</h2>
		<CategoryDonut rows={data.breakdown} total={data.input.expense} />
	</section>
	<section class="card">
		<h2>รายวัน</h2>
		<DailyChart days={data.days} average={perDay} />
	</section>
</div>

<style>
	.head {
		margin-bottom: var(--stack);
	}
	h1 {
		font-size: var(--text-xl);
	}
	h2 {
		font-size: var(--text-lg);
		margin-bottom: 0.75rem;
	}
	h3 {
		font-size: var(--text-base);
		margin: 1.2rem 0 0.5rem;
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		margin-bottom: var(--stack);
	}
	.card {
		padding: 1.1rem;
		margin-bottom: var(--stack);
	}
	.compare-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.compare-controls {
		display: flex;
		align-items: end;
		gap: 0.55rem;
	}
	.compare-controls label {
		display: grid;
		gap: 0.25rem;
		font-size: var(--text-xs);
		color: var(--ink-muted);
	}
	.compare-controls select {
		padding: 0.55rem;
		border: 1px solid var(--rule-strong);
		border-radius: var(--radius-sm);
		background: var(--paper-raised);
		color: var(--ink);
	}
	.baseline-note, .sample-warning {
		font-size: var(--text-xs);
		color: var(--ink-muted);
		margin-bottom: 0.75rem;
	}
	.sample-warning {
		padding: 0.55rem;
		border-radius: var(--radius-sm);
		background: var(--paper-sunken);
		color: var(--out);
	}
	.scroller { overflow-x: auto; }
	.metric-table table { width: 100%; min-width: 32rem; border-collapse: collapse; font-size: var(--text-sm); }
	.metric-table th, .metric-table td { padding: 0.55rem; border-bottom: 1px solid var(--rule); text-align: left; }
	.metric-table .num { text-align: right; font-variant-numeric: tabular-nums; }
	.anomalies > ul { list-style: none; padding: 0; display: grid; gap: 0.65rem; }
	.anomalies > ul > li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.8rem; border: 1px solid var(--rule); border-radius: var(--radius); }
	.anomalies p, .anomalies small { color: var(--ink-muted); }
	.anomaly-actions { display: flex; align-items: center; gap: 0.4rem; }
	button.secondary { background: var(--paper-sunken); color: var(--ink); border: 1px solid var(--rule-strong); }
	.analysis-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}
	.analysis-head h2 {
		margin: 0;
	}
	button {
		padding: 0.6rem 1.1rem;
		font: inherit;
		font-weight: 600;
		white-space: nowrap;
		border: 0;
		border-radius: var(--radius);
		background: var(--ink);
		color: var(--paper-raised);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		background: var(--accent);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	button:disabled {
		opacity: 0.6;
		cursor: progress;
	}
	.notice {
		margin-bottom: 0.8rem;
		color: var(--out);
		font-size: var(--text-sm);
	}
	.setup {
		margin-top: 0.5rem;
		padding: 0.5rem 0.6rem;
		border-radius: var(--radius-sm);
		background: var(--paper-sunken);
		font-family: ui-monospace, monospace;
		font-size: var(--text-xs);
		color: var(--ink-muted);
		overflow-x: auto;
	}
	.quota {
		margin-top: 0.35rem;
		text-align: right;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}
	.muted {
		color: var(--ink-muted);
	}
	.no-plan {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1.1rem 1.25rem 1.25rem;
		border-left: 3px solid var(--rule-strong);
		color: var(--ink-muted);
		font-size: var(--text-sm);
	}
	.no-plan a {
		color: var(--accent);
		font-weight: 600;
	}
	.facts-meta {
		color: var(--ink-muted);
		margin-bottom: 0.65rem;
	}
	.facts ul {
		display: grid;
		gap: 0.35rem;
		padding-left: 1.2rem;
	}
	.facts .attention {
		color: var(--out);
	}
	.summary {
		margin-bottom: 0.8rem;
	}
	.observations {
		display: grid;
		gap: 0.45rem;
		padding-left: 1.1rem;
	}
	.observations li {
		color: var(--ink-muted);
	}
	.savings {
		display: grid;
		gap: 0.6rem;
		list-style: none;
		padding: 0;
	}
	.savings li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		padding: 0.7rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
		background: var(--paper-sunken);
	}
	.idea {
		font-weight: 600;
	}
	.detail {
		color: var(--ink-muted);
		font-size: var(--text-sm);
	}
	.num {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--in);
	}
	.total {
		margin-top: 0.7rem;
		font-weight: 600;
	}
	.disclaimer {
		margin-top: 1rem;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}
	.charts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.charts .card {
		margin-bottom: 0;
	}
	@media (max-width: 800px) {
		.figures {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.charts {
			grid-template-columns: 1fr;
		}
		.compare-head, .compare-controls, .anomalies > ul > li { flex-direction: column; }
		.compare-controls { align-items: stretch; width: 100%; }
		.anomaly-actions { align-self: stretch; }
		.anomaly-actions form, .anomaly-actions button { flex: 1; }
	}
	@media (max-width: 480px) {
		.analysis-head {
			flex-direction: column;
		}
		button {
			width: 100%;
		}
	}
</style>
