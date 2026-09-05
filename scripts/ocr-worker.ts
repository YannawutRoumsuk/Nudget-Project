import { claimNextPendingSlip, requeueStalePendingSlips } from '../src/lib/server/db/slips';
import { closeDatabase } from '../src/lib/server/db';
import { processClaimedSlip } from '../src/lib/server/ocr/processor';
import { stopSlipOcr } from '../src/lib/server/ocr/slip';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

console.log('[ocr-worker] started');
const recovered = await requeueStalePendingSlips(new Date(Date.now() - 10 * 60_000));
if (recovered > 0) console.log(`[ocr-worker] requeued ${recovered} stale job(s)`);
while (!stopping) {
	const pending = await claimNextPendingSlip();
	if (pending) {
		await processClaimedSlip(pending);
		continue;
	}
	await Bun.sleep(2_000);
}
await stopSlipOcr();
await closeDatabase();
console.log('[ocr-worker] stopped');
