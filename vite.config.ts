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
		environment: 'node',
		/**
		 * Integration files share one database: each clears the tables it needs and
		 * then asserts on owner-wide queries, so two of them running at once would
		 * wipe each other’s fixtures mid-test. They get their own project with file
		 * parallelism off; the pure unit files keep running side by side.
		 */
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['tests/**/*.test.ts'],
					exclude: ['tests/**/*.integration.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/**/*.integration.test.ts'],
					fileParallelism: false
				}
			}
		],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/server/db/**', 'src/lib/**/*.d.ts']
		}
	}
});
