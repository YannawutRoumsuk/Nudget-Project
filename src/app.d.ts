// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Set by hooks.server.ts from the signed session cookie. */
			authed: boolean;
			lineUserId: string | null;
			/** Signed session claims used to gate destructive privacy actions. Legacy sessions have no issue time. */
			sessionIssuedAt: number | null;
			sessionMethod: 'line' | 'password' | null;
			/** `users.id` for the signed-in account — the tenant key every query filters on. */
			userId: number | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
