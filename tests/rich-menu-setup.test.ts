import { afterEach, describe, expect, it, vi } from 'vitest';
import { isManagedMenu, setup } from '../scripts/rich-menu';

const original = {
	token: process.env.LINE_CHANNEL_ACCESS_TOKEN,
	baseUrl: process.env.PUBLIC_BASE_URL,
	image: process.env.RICH_MENU_IMAGE
};

afterEach(() => {
	for (const [key, value] of Object.entries({ LINE_CHANNEL_ACCESS_TOKEN: original.token, PUBLIC_BASE_URL: original.baseUrl, RICH_MENU_IMAGE: original.image })) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	vi.restoreAllMocks();
});

describe('rich menu setup', () => {
	it('recognizes only the exact menu name owned by this setup script', () => {
		expect(isManagedMenu({ richMenuId: 'nudget', name: 'Nudget 8-button menu' })).toBe(true);
		expect(isManagedMenu({ richMenuId: 'other', name: 'Team menu' })).toBe(false);
		expect(isManagedMenu({ richMenuId: 'spoof', name: 'Nudget 8-button menu - copy' })).toBe(false);
	});

	it('dry-run reports updates and duplicate cleanup without making changes', async () => {
		process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
		process.env.PUBLIC_BASE_URL = 'https://nudget.example';
		const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ richmenus: [
			{ richMenuId: 'unrelated', name: 'Personal menu' },
			{ richMenuId: 'old', name: 'Nudget 8-button menu' },
			{ richMenuId: 'current', name: 'Nudget 8-button menu', selected: true }
		] }))).mockResolvedValue(new Response('{}'));
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		await setup({ dryRun: true, fetcher });

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(String(fetcher.mock.calls[0][0])).toContain('/richmenu/list');
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Would update current'));
		expect(log).toHaveBeenCalledWith(expect.stringContaining('Would delete duplicate Nudget menu(s): old'));
	});

	it('reuses the managed menu and leaves unrelated menus untouched', async () => {
		process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
		process.env.PUBLIC_BASE_URL = 'https://nudget.example';
		process.env.RICH_MENU_IMAGE = 'static/line-rich-menu.png';
		const fetcher = vi.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify({ richmenus: [
				{ richMenuId: 'unrelated', name: 'Personal menu' },
				{ richMenuId: 'current', name: 'Nudget 8-button menu', selected: true },
				{ richMenuId: 'duplicate', name: 'Nudget 8-button menu' }
			] })))
			.mockResolvedValue(new Response('{}'));
		vi.spyOn(console, 'log').mockImplementation(() => {});

		await setup({ fetcher });

		const calls = fetcher.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method ?? 'GET' }));
		expect(calls.map((call) => call.method)).toEqual(['GET', 'PUT', 'POST', 'POST', 'DELETE']);
		expect(calls[1].url).toContain('/richmenu/current');
		expect(calls[3].url).toContain('/user/all/richmenu/current');
		expect(calls[4].url).toContain('/richmenu/duplicate');
		expect(calls.some((call) => call.url.includes('unrelated'))).toBe(false);
	});
});
