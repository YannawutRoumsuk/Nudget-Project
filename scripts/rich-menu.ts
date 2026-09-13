import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

process.loadEnvFile?.();

export const WIDTH = 2500;
export const HEIGHT = 1686;
const COLUMNS = 4;
const ROWS = 2;
const OUTPUT = join(process.cwd(), 'static', 'line-rich-menu.png');

interface Item {
	label: string;
	icon: string;
	action: { type: 'uri'; path: string } | { type: 'message'; text: string };
}

const ICONS = {
	overview: 'M-30 24V4M-10 24V-14M10 24V-6M30 24V-26',
	list: 'M-30-20H30M-30 0H30M-30 20H10',
	insight: 'M-28 24l18-20 14 10 25-34 M18-20h11v11',
	bill: 'M-24-28h48v52l-8-6-8 6-8-6-8 6-8-6-8 6z M-12-14h24M-12 0h24',
	plan: 'M-28-20h56v44h-56z M-28-6h56 M-14-28v14 M14-28v14',
	summary: 'M-30-22h60v36h-34l-14 14v-14h-12z M-15 5v-9 M0 5v-17 M15 5v-12',
	feedback: 'M-30-22h60v38h-38l-14 12v-12h-8z M-14-7h28M-14 7h18',
	help: 'M-30-22h60v36h-34l-14 14v-14h-12z M-8-12a8 8 0 1 1 8 8v4 M0 4v0'
} as const;

export const ITEMS: Item[] = [
	{ label: 'ภาพรวม', icon: ICONS.overview, action: { type: 'uri', path: '/' } },
	{ label: 'รายการ', icon: ICONS.list, action: { type: 'uri', path: '/transactions' } },
	{ label: 'วิเคราะห์', icon: ICONS.insight, action: { type: 'uri', path: '/insights' } },
	{ label: 'บิล', icon: ICONS.bill, action: { type: 'uri', path: '/bills' } },
	{ label: 'แผนเดือน', icon: ICONS.plan, action: { type: 'uri', path: '/plan' } },
	{ label: 'สรุปเดือนนี้', icon: ICONS.summary, action: { type: 'message', text: 'เดือนนี้' } },
	{ label: 'ฟีดแบ็ก', icon: ICONS.feedback, action: { type: 'uri', path: '/feedback' } },
	{ label: 'วิธีใช้', icon: ICONS.help, action: { type: 'message', text: 'วิธีใช้' } }
];

export function cells() {
	return ITEMS.map((item, index) => {
		const row = Math.floor(index / COLUMNS);
		const column = index % COLUMNS;
		const x = Math.round(column * WIDTH / COLUMNS);
		const nextX = Math.round((column + 1) * WIDTH / COLUMNS);
		const y = Math.round(row * HEIGHT / ROWS);
		const nextY = Math.round((row + 1) * HEIGHT / ROWS);
		return { item, x, y, width: nextX - x, height: nextY - y };
	});
}

function makeSvg() {
	const parts = [`<rect width="100%" height="100%" fill="#FAF7F2"/>`];
	for (const cell of cells()) {
		const cx = cell.x + cell.width / 2;
		const cy = cell.y + cell.height / 2;
		if (cell.x > 0) parts.push(`<line x1="${cell.x}" y1="${cell.y + 80}" x2="${cell.x}" y2="${cell.y + cell.height - 80}" stroke="#E4DDD2" stroke-width="3"/>`);
		if (cell.y > 0) parts.push(`<line x1="${cell.x + 60}" y1="${cell.y}" x2="${cell.x + cell.width - 60}" y2="${cell.y}" stroke="#E4DDD2" stroke-width="3"/>`);
		parts.push(
			`<g transform="translate(${cx} ${cy - 90}) scale(2.1)" fill="none" stroke="#4A56C0" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="${cell.item.icon}"/></g>`,
			`<text x="${cx}" y="${cy + 100}" text-anchor="middle" fill="#2E2620" font-family="Noto Sans Thai, Arial, sans-serif" font-size="58" font-weight="700">${cell.item.label}</text>`
		);
	}
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

export function actions() {
	const url = baseUrl();
	return cells().map((cell) => ({
		bounds: { x: cell.x, y: cell.y, width: cell.width, height: cell.height },
		action: cell.item.action.type === 'uri'
			? { type: 'uri', uri: `${url}${cell.item.action.path}` }
			: { type: 'message', text: cell.item.action.text }
	}));
}

async function setup() {
	const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
	if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required for rich menu setup');
	const imagePath = process.env.RICH_MENU_IMAGE?.trim() ? resolve(process.env.RICH_MENU_IMAGE) : OUTPUT;
	const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	const created = await fetch('https://api.line.me/v2/bot/richmenu', {
		method: 'POST', headers,
		body: JSON.stringify({ size: { width: WIDTH, height: HEIGHT }, selected: true, name: 'Nudget 8-button menu', chatBarText: 'เมนู', areas: actions() })
	});
	if (!created.ok) throw new Error(`LINE rich menu creation failed (${created.status}): ${await created.text()}`);
	const { richMenuId } = await created.json() as { richMenuId: string };
	const image = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
		method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: await readFile(imagePath)
	});
	if (!image.ok) throw new Error(`LINE rich menu image upload failed (${image.status})`);
	const selected = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
	if (!selected.ok) throw new Error(`LINE default rich menu setup failed (${selected.status})`);
	console.log(`Rich menu ${richMenuId} created from ${imagePath} and set as default.`);
}

await generate();
if (process.argv.includes('--setup')) await setup();
