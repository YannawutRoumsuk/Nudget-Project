const env = process.env;

export type LlmProvider = 'none' | 'anthropic' | 'gemini';

const DEFAULT_MODELS: Record<Exclude<LlmProvider, 'none'>, string> = {
	anthropic: 'claude-haiku-4-5-20251001',
	gemini: 'gemini-2.5-flash'
};

function resolveLlm() {
	const declared = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
	const anthropicKey = (env.ANTHROPIC_API_KEY ?? '').trim();
	const geminiKey = (env.GEMINI_API_KEY ?? '').trim();

	// An explicit LLM_PROVIDER wins; otherwise infer from whichever key is set,
	// so the common case needs one env var instead of two.
	const provider: LlmProvider =
		declared === 'none'
			? 'none'
			: declared === 'anthropic' || declared === 'gemini'
			? declared
			: anthropicKey
				? 'anthropic'
				: geminiKey
					? 'gemini'
					: 'none';

	const apiKey = provider === 'anthropic' ? anthropicKey : provider === 'gemini' ? geminiKey : '';

	if (provider !== 'none' && !apiKey) {
		console.warn(`[config] LLM_PROVIDER=${provider} but its API key is empty — LLM fallback off`);
		return { provider: 'none' as const, apiKey: '', model: '' };
	}

	return {
		provider,
		apiKey,
		model:
			(env.LLM_MODEL ?? '').trim() ||
			(provider === 'none' ? '' : DEFAULT_MODELS[provider])
	};
}

function splitList(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const config = {
	ocr: {
		mode: (env.OCR_MODE ?? 'inline').trim() === 'worker' ? 'worker' as const : 'inline' as const
	},
	reminders: {
		mode: (env.REMINDER_MODE ?? 'timer').trim() === 'cron' ? 'cron' as const : 'timer' as const,
		hour: boundedInteger(env.REMINDER_HOUR, 9, 0, 23),
		daysBefore: boundedInteger(env.REMINDER_DAYS_BEFORE, 3, 0, 31)
	},
	databaseUrl: env.DATABASE_URL ?? '',
	line: {
		channelSecret: (env.LINE_CHANNEL_SECRET ?? '').trim(),
		accessToken: (env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim(),
		/**
		 * Comma-separated list of owners. These accounts have access before any
		 * database row exists, and they are the only ones who can see the member
		 * list or revoke someone. Everyone else signs up by adding the bot.
		 */
		allowedUserIds: splitList(env.LINE_ALLOWED_USER_ID)
	},
	dashboard: {
		password: (env.DASHBOARD_PASSWORD ?? '').trim(),
		sessionSecret: (env.SESSION_SECRET ?? '').trim()
	},
	liff: {
		id: (env.LIFF_ID ?? '').trim()
	},
	llm: resolveLlm()
};

/** The allowlist is the only thing standing between a stranger and the ledger. */
export function isAllowedLineUser(lineUserId: string): boolean {
	return Boolean(lineUserId) && config.line.allowedUserIds.includes(lineUserId);
}

/** Throws on the misconfigurations that would silently break the bot. */
export function assertLineConfigured(): void {
	if (!config.line.channelSecret) throw new Error('LINE_CHANNEL_SECRET is not set');
	if (!config.line.accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
}
