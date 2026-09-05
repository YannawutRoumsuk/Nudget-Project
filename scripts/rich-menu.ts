import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

process.loadEnvFile?.();

const WIDTH = 2500;
const HEIGHT = 843;
const OUTPUT = join(process.cwd(), 'static', 'line-rich-menu.png');

const colors = ['#153B50', '#1D536B', '#266B7D', '#2F7C85', '#386B78', '#455466'];
const items = [
	{ label: 'ภาพรวม', kind: 'uri', path: '/' },
	{ label: 'รายการ', kind: 'uri', path: '/transactions' },
	{ label: 'บิล', kind: 'uri', path: '/bills' },
	{ label: 'แผนเดือน', kind: 'uri', path: '/plan' },
	{ label: 'สรุป', kind: 'message', text: 'เดือนนี้' },
	{ label: 'ช่วย', kind: 'message', text: 'ช่วย' }
] as const;

function escapeXml(value: string) {
	return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

function makeSvg() {
	const columns = items.map((item, index) => {
		const x = Math.round(index * WIDTH / items.length);
		const nextX = Math.round((index + 1) * WIDTH / items.length);
		const center = (x + nextX) / 2;
		return `<rect x="${x}" y="0" width="${nextX - x}" height="${HEIGHT}" fill="${colors[index]}"/>\n` +
			`<line x1="${x}" y1="90" x2="${x}" y2="${HEIGHT - 90}" stroke="#FFFFFF" stroke-opacity=".18"/>\n` +
			`<text x="${center}" y="450" text-anchor="middle" fill="#FFFFFF" font-family="Noto Sans Thai, Arial, sans-serif" font-size="62" font-weight="700">${escapeXml(item.label)}</text>`;
	}).join('\n');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="#153B50"/>${columns}<line x1="0" y1="90" x2="${WIDTH}" y2="90" stroke="#FFFFFF" stroke-opacity=".22"/><line x1="0" y1="${HEIGHT - 90}" x2="${WIDTH}" y2="${HEIGHT - 90}" stroke="#FFFFFF" stroke-opacity=".22"/></svg>`;
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
	return items.map((item, index) => ({
		bounds: { x: Math.round(index * WIDTH / items.length), y: 0, width: Math.round((index + 1) * WIDTH / items.length) - Math.round(index * WIDTH / items.length), height: HEIGHT },
		action: item.kind === 'uri' ? { type: 'uri', uri: `${url}${item.path}` } : { type: 'message', text: item.text }
	}));
}

async function setup() {
	const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
	if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required for rich menu setup');
	const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	const created = await fetch('https://api.line.me/v2/bot/richmenu', { method: 'POST', headers, body: JSON.stringify({ size: { width: WIDTH, height: HEIGHT }, selected: true, name: 'Spendbot Thai menu', chatBarText: 'เมนู', areas: actions() }) });
	if (!created.ok) throw new Error(`LINE rich menu creation failed (${created.status})`);
	const { richMenuId } = await created.json() as { richMenuId: string };
	const image = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: await sharp(OUTPUT).png().toBuffer() });
	if (!image.ok) throw new Error(`LINE rich menu image upload failed (${image.status})`);
	const selected = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
	if (!selected.ok) throw new Error(`LINE default rich menu setup failed (${selected.status})`);
	console.log('Rich menu created, uploaded, and set as default.');
}

await generate();
if (process.argv.includes('--setup')) await setup();
