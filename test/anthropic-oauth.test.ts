import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ANTHROPIC_OAUTH_TOKEN_URL,
	refreshAnthropicOAuth,
} from "../src/anthropic-oauth.ts";

const stubFetch = (response: Response): ReturnType<typeof vi.fn> => {
	const mock = vi.fn(async () => response);
	vi.stubGlobal("fetch", mock);
	return mock;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("refreshAnthropicOAuth", () => {
	it("exchanges a refresh token at the Claude token endpoint", async () => {
		const mock = stubFetch(
			Response.json({
				access_token: "sk-ant-oat-new",
				refresh_token: "refresh-rotated",
				expires_in: 3600,
			}),
		);
		const before = Date.now();
		const credential = await refreshAnthropicOAuth("refresh-old");

		expect(mock).toHaveBeenCalledTimes(1);
		const [url, init] = mock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(ANTHROPIC_OAUTH_TOKEN_URL);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			grant_type: "refresh_token",
			client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
			refresh_token: "refresh-old",
		});
		expect(credential).toMatchObject({
			type: "oauth",
			access: "sk-ant-oat-new",
			refresh: "refresh-rotated",
		});
		// 3600s of validity minus the five-minute refresh window.
		expect(credential.expires).toBeGreaterThanOrEqual(before + 3_000_000);
		expect(credential.expires).toBeLessThanOrEqual(Date.now() + 3_300_000);
	});

	it("keeps the old refresh token when the response omits a new one", async () => {
		stubFetch(Response.json({ access_token: "sk-ant-oat-new", expires_in: 60 }));
		const credential = await refreshAnthropicOAuth("refresh-old");
		expect(credential.refresh).toBe("refresh-old");
	});

	it("reports a refused refresh without leaking the token", async () => {
		stubFetch(new Response("invalid_grant", { status: 400 }));
		const error = await refreshAnthropicOAuth("refresh-secret").catch(
			(caught: unknown) => caught as Error,
		);
		expect(error.message).toMatch(/status=400/u);
		expect(error.message).not.toContain("refresh-secret");
	});

	it("rejects a response without an access token", async () => {
		stubFetch(Response.json({ expires_in: 60 }));
		await expect(refreshAnthropicOAuth("refresh-old")).rejects.toThrow(
			/unexpected body/u,
		);
	});
});
