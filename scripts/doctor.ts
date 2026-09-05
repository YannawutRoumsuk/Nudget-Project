/** Read-only local readiness check. Never prints credentials or ledger contents. */
import postgres from 'postgres';

let problems = 0;
function report(ok: boolean, label: string) {
	console.log(`${ok ? 'OK' : 'MISSING'} ${label}`);
	if (!ok) problems++;
}

for (const name of ['DATABASE_URL', 'DASHBOARD_PASSWORD', 'SESSION_SECRET', 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_ALLOWED_USER_ID']) {
	report(Boolean(process.env[name]?.trim()), name);
}
if (process.env.DASHBOARD_PASSWORD === 'changeme') report(false, 'Replace the example dashboard password before opening a tunnel');

const url = process.env.DATABASE_URL;
if (url) {
	const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
	try {
		const [tables] = await sql`
			select to_regclass('public.transactions') is not null as transactions,
			to_regclass('public.categories') is not null as categories,
			to_regclass('public.processed_events') is not null as events`;
		report(Boolean(tables.transactions && tables.categories && tables.events), 'Database schema');
		if (tables.categories) {
			const [{ count }] = await sql`select count(*)::int as count from categories`;
			report(count > 0, 'Seeded categories');
		}
	} catch {
		report(false, 'Database connection (start Docker Desktop, then bun run db:setup)');
	} finally {
		await sql.end({ timeout: 1 });
	}
}

console.log('LLM keys are optional. This check does not contact LINE or send any messages.');
process.exitCode = problems > 0 ? 1 : 0;
