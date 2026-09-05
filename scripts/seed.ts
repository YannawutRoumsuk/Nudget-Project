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
} catch (error) {
	console.error('Seed failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
