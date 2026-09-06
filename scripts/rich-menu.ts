import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

process.loadEnvFile?.();

const WIDTH = 2500;
const HEIGHT = 843;
const OUTPUT = join(process.cwd(), 'static', 'line-rich-menu.png');

/**
 * The menu does two different things, so it looks like two things. The top band
 * opens the dashboard; the bottom band talks to the bot without leaving the
 * chat. Same palette as the web app — warm paper, ink, one accent — so the two
 * surfaces read as one product.
 */
const PAPER = '#FAF7F2';
const PAPER_SUNKEN = '#F1ECE3';
const RULE = '#E4DDD2';
const INK = '#2E2620';
const INK_MUTED = '#7C7065';
const ACCENT = '#4A56C0';

const TOP_HEIGHT = 512;
const TOP_COLUMNS = 4;
const BOTTOM_COLUMNS = 2;

interface Item {
	label: string;
	icon: string;
	action: { type: 'uri'; path: string } | { type: 'message'; text: string };
}

/** Line art drawn as paths — no icon font to be missing at render time. */
const ICONS = {
	// Bars, tallest last: the overview is a chart.
	overview: 'M-30 24V4M-10 24V-14M10 24V-6M30 24V-26',
	// Ruled entries, like rows in the ledger.
	list: 'M-30-20H30M-30 0H30M-30 20H10',
	// A receipt with a torn edge.
	bill: 'M-24-28h48v52l-8-6-8 6-8-6-8 6-8-6-8 6z M-12-14h24M-12 0h24',
	// A month, boxed.
	plan: 'M-28-20h56v44h-56z M-28-6h56 M-14-28v14 M14-28v14',
	// A bubble with a figure inside: ask and it answers.
	summary: 'M-30-22h60v36h-34l-14 14v-14h-12z M-15 5v-9 M0 5v-17 M15 5v-12',
	help: 'M-30-22h60v36h-34l-14 14v-14h-12z M-8-12a8 8 0 1 1 8 8v4 M0 4v0'
} as const;

const ITEMS: Item[] = [
	{ label: 'ภาพรวม', icon: ICONS.overview, action: { type: 'uri', path: '/' } },
	{ label: 'รายการ', icon: ICONS.list, action: { type: 'uri', path: '/transactions' } },
	{ label: 'บิล', icon: ICONS.bill, action: { type: 'uri', path: '/bills' } },
	{ label: 'แผนเดือน', icon: ICONS.plan, action: { type: 'uri', path: '/plan' } },
	{ label: 'สรุปเดือนนี้', icon: ICONS.summary, action: { type: 'message', text: 'เดือนนี้' } },
	{ label: 'วิธีใช้', icon: ICONS.help, action: { type: 'message', text: 'ช่วย' } }
];

/** Tap areas and artwork come from one source, so they cannot drift apart. */
function cells() {
	return ITEMS.map((item, index) => {
		const top = index < TOP_COLUMNS;
		const column = top ? index : index - TOP_COLUMNS;
		const columns = top ? TOP_COLUMNS : BOTTOM_COLUMNS;
		const x = Math.round((column * WIDTH) / columns);
		const nextX = Math.round(((column + 1) * WIDTH) / columns);
		return {
			item,
			top,
			x,
			y: top ? 0 : TOP_HEIGHT,
			width: nextX - x,
			height: top ? TOP_HEIGHT : HEIGHT - TOP_HEIGHT
		};
	});
}

function escapeXml(value: string) {
	return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function makeSvg() {
	const parts: string[] = [
		`<rect width="100%" height="100%" fill="${PAPER}"/>`,
		`<rect x="0" y="${TOP_HEIGHT}" width="${WIDTH}" height="${HEIGHT - TOP_HEIGHT}" fill="${PAPER_SUNKEN}"/>`
	];

	for (const cell of cells()) {
		const centerX = cell.x + cell.width / 2;
		const iconY = cell.top ? 205 : TOP_HEIGHT + 112;
		const labelY = cell.top ? 358 : TOP_HEIGHT + 238;
		const stroke = cell.top ? ACCENT : INK_MUTED;
		const size = cell.top ? 1.7 : 1.4;

		if (cell.x > 0) {
			// Hairline between cells, inset like a rule in a ledger column.
			const inset = cell.top ? 96 : 72;
			parts.push(
				`<line x1="${cell.x}" y1="${cell.y + inset}" x2="${cell.x}" y2="${cell.y + cell.height - inset}" stroke="${RULE}" stroke-width="2"/>`
			);
		}
		parts.push(
			`<g transform="translate(${centerX} ${iconY}) scale(${size})" fill="none" stroke="${stroke}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="${cell.item.icon}"/></g>`,
			`<text x="${centerX}" y="${labelY}" text-anchor="middle" fill="${INK}" font-family="Noto Sans Thai, IBM Plex Sans Thai, Arial, sans-serif" font-size="${cell.top ? 62 : 54}" font-weight="700">${escapeXml(cell.item.label)}</text>`
		);
	}

	// The band divider is the only full-width rule: it separates "opens the web"
	// from "answers in the chat".
	parts.push(`<line x1="0" y1="${TOP_HEIGHT}" x2="${WIDTH}" y2="${TOP_HEIGHT}" stroke="${RULE}" stroke-width="3"/>`);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${parts.join('\n')}</svg>`;
}

async function generate() {
	await mkdir(join(process.cwd(), 'static'), { recursive: true });
	await sharp(Buffer.from(makeSvg())).png().toFile(OUTPUT);
	console.log(`Generated ${OUTPUT}`);
}

function baseUrl() {
	const value = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
	if (!value) throw new Error('PUBLIC_BASE_URL is required for rich menu setup');
	return value;
}

function actions() {
	const url = baseUrl();
	return cells().map((cell) => ({
		bounds: { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
		action:
			cell.item.action.type === 'uri'
				? { type: 'uri', uri: `${url}${cell.item.action.path}` }
				: { type: 'message', text: cell.item.action.text }
	}));
}

async function setup() {
	const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
	if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required for rich menu setup');
	const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	const created = await fetch('https://api.line.me/v2/bot/richmenu', { method: 'POST', headers, body: JSON.stringify({ size: { width: WIDTH, height: HEIGHT }, selected: true, name: 'Nudget Thai menu', chatBarText: 'เมนู', areas: actions() }) });
	if (!created.ok) throw new Error(`LINE rich menu creation failed (${created.status}): ${await created.text()}`);
	const { richMenuId } = await created.json() as { richMenuId: string };
	const image = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: await sharp(OUTPUT).png().toBuffer() });
	if (!image.ok) throw new Error(`LINE rich menu image upload failed (${image.status})`);
	const selected = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
	if (!selected.ok) throw new Error(`LINE default rich menu setup failed (${selected.status})`);
	console.log(`Rich menu ${richMenuId} created, uploaded, and set as default.`);
}

await generate();
if (process.argv.includes('--setup')) await setup();
