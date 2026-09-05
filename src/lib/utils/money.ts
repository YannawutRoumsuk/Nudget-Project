const BAHT = new Intl.NumberFormat('th-TH', {
	style: 'currency',
	currency: 'THB',
	maximumFractionDigits: 2,
	minimumFractionDigits: 0
});

const PLAIN = new Intl.NumberFormat('th-TH', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 0
});

export function formatBaht(amount: number): string {
	return BAHT.format(amount);
}

export function formatNumber(amount: number): string {
	return PLAIN.format(amount);
}

/** Compact axis/tick label: 1200 -> "1.2K", 45000 -> "45K". */
export function formatCompact(amount: number): string {
	if (Math.abs(amount) >= 1_000_000) return `${trim(amount / 1_000_000)}M`;
	if (Math.abs(amount) >= 1_000) return `${trim(amount / 1_000)}K`;
	return trim(amount);
}

function trim(n: number): string {
	return String(Math.round(n * 10) / 10);
}

/** Postgres `numeric` arrives as a string; never let it become NaN silently. */
export function toNumber(value: string | number | null | undefined): number {
	if (value == null) return 0;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : 0;
}
