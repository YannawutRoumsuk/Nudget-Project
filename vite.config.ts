import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	server: {
		// Quick Tunnel hostnames change on restart; this suffix remains scoped to Cloudflare.
		allowedHosts: ['.trycloudflare.com']
	},
	plugins: [
		sveltekit({
			// Force runes mode for the project, except for libraries.
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/server/db/**', 'src/lib/**/*.d.ts']
		}
	}
});
