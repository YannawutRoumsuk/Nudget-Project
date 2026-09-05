import sharp from 'sharp';
import { readSlip, stopSlipOcr } from '../src/lib/server/ocr/slip';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
<rect width="100%" height="100%" fill="white"/>
<g fill="#111" font-family="DejaVu Sans, Arial, sans-serif" font-size="58">
<text x="80" y="150">TRANSFER SUCCESSFUL</text>
<text x="80" y="290">DATE 05/09/2026 13:42</text>
<text x="80" y="430">TO TEST MERCHANT</text>
<text x="80" y="570">AMOUNT: THB 1,250.50</text>
<text x="80" y="710">REFERENCE: ABC123</text>
</g></svg>`;

try {
	const result = await readSlip(await sharp(Buffer.from(svg)).png().toBuffer());
	console.log(JSON.stringify({ amount: result.amount, date: result.occurredAt?.toISOString(), recipient: result.recipient }));
	if (result.amount !== 1250.5) throw new Error(`OCR smoke test expected 1250.50, got ${result.amount}`);
} finally {
	await stopSlipOcr();
}
