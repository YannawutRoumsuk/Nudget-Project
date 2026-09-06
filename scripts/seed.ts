/**
 * Seeds the category table from the single source of truth in
 * `src/lib/categories.ts`. Idempotent: re-running it updates labels and colours
 * without touching any transaction.
 *
 *   bun run db:seed
 */
import postgres from 'postgres';
import { ALL_CATEGORIES } from '../src/lib/categories';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set — copy .env.example to .env first');
	process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

/**
 * The multi-user migration adopts pre-existing rows into one owner, but it can
 * only guess that owner's LINE id from the ledger. When the ledger never stored
 * one it writes the `legacy-owner` placeholder; this claims that row for the
 * first configured account so the owner keeps their history instead of landing
 * in an empty second ledger on their next login.
 */
async function reconcileOwner() {
	const [owner] = (process.env.LINE_ALLOWED_USER_ID ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	if (!owner) return;

	const claimed = await sql`
		update users set line_user_id = ${owner}, updated_at = now()
		where line_user_id = 'legacy-owner'
			and not exists (select 1 from users where line_user_id = ${owner})
		returning id
	`;
	if (claimed.length > 0) {
		console.log(`Adopted the legacy ledger into ${owner}`);
		return;
	}
	await sql`insert into users (line_user_id) values (${owner}) on conflict (line_user_id) do nothing`;
}

try {
	for (const [index, category] of ALL_CATEGORIES.entries()) {
		await sql`
			insert into categories (id, name_th, name_en, kind, icon, color, sort_order)
			values (
				${category.id}, ${category.nameTh}, ${category.nameEn},
				${category.kind}, ${category.icon}, ${category.color}, ${index + 1}
			)
			on conflict (id) do update set
				name_th = excluded.name_th,
				name_en = excluded.name_en,
				kind = excluded.kind,
				icon = excluded.icon,
				color = excluded.color,
				sort_order = excluded.sort_order
		`;
	}
	console.log(`Seeded ${ALL_CATEGORIES.length} categories`);
	await reconcileOwner();
} catch (error) {
	console.error('Seed failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
