import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Process liveness only; intentionally independent of external services. */
export const GET: RequestHandler = () => json({ ok: true });
