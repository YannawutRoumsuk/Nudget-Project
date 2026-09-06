/**
 * Renders the add-friend QR for the bot's LINE official account into
 * `static/line-add-friend.svg`.
 *
 * Generated once and committed rather than fetched from LINE at page load: the
 * login page must work before anyone is signed in, and it should not depend on
 * a third-party image host to tell a newcomer how to reach the bot.
 *
 *   LINE_ADD_FRIEND_ID=@yourid bun run line:qr
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toString as qrToString } from 'qrcode';

process.loadEnvFile?.();

const id = (process.env.LINE_ADD_FRIEND_ID ?? '').trim();
if (!id.startsWith('@')) {
	console.error('LINE_ADD_FRIEND_ID must be set to the account id, including the @ (e.g. @286bjoke)');
	process.exit(1);
}

const target = `https://line.me/R/ti/p/${id}`;
const OUTPUT = join(process.cwd(), 'static', 'line-add-friend.svg');

// Fixed black-on-white: an inverted QR is unreliable to scan, so the page keeps
// this on its own white plate in dark mode rather than theming the modules.
const svg = await qrToString(target, {
	type: 'svg',
	errorCorrectionLevel: 'M',
	margin: 1,
	color: { dark: '#000000', light: '#ffffff' }
});

await writeFile(OUTPUT, svg, 'utf8');
console.log(`Generated ${OUTPUT} for ${target}`);
