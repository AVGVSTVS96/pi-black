import type { OAuthAuth, OAuthCredential } from "@earendil-works/pi-ai";

/**
 * The public Claude Code OAuth client. Same client pi-ai's Node login flow
 * uses; kept here so a Worker can refresh without loading that Node-only
 * module (`node:http` callback server, `node:crypto` PKCE).
 */
const CLAUDE_CODE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const ANTHROPIC_OAUTH_TOKEN_URL =
	"https://platform.claude.com/v1/oauth/token";

/** Refresh runs before the access token expires, matching pi-ai's window. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

interface TokenResponse {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
}

/** Exchange a Claude Code refresh token for a new access token. */
export async function refreshAnthropicOAuth(
	refreshToken: string,
	signal?: AbortSignal,
): Promise<OAuthCredential> {
	const signalChain = signal
		? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
		: AbortSignal.timeout(30_000);
	const response = await fetch(ANTHROPIC_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			grant_type: "refresh_token",
			client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
			refresh_token: refreshToken,
		}),
		signal: signalChain,
	});
	const body = await response.text();
	if (!response.ok) {
		throw new Error(
			`Anthropic token refresh failed. status=${response.status}; url=${ANTHROPIC_OAUTH_TOKEN_URL}`,
		);
	}
	let data: TokenResponse;
	try {
		data = JSON.parse(body) as TokenResponse;
	} catch {
		throw new Error("Anthropic token refresh returned invalid JSON");
	}
	if (
		typeof data.access_token !== "string" ||
		typeof data.expires_in !== "number"
	) {
		throw new Error("Anthropic token refresh returned an unexpected body");
	}
	return {
		type: "oauth",
		access: data.access_token,
		refresh:
			typeof data.refresh_token === "string"
				? data.refresh_token
				: refreshToken,
		expires: Date.now() + data.expires_in * 1000 - EXPIRY_SKEW_MS,
	};
}

/**
 * Worker-safe Anthropic OAuth auth: refresh and request derivation only.
 * Interactive login needs a browser callback server, so the Worker refuses it
 * and expects a credential seeded from a machine where Claude Code signed in.
 */
export function anthropicOAuthForWorkers(): OAuthAuth {
	return {
		name: "Anthropic (Claude Pro/Max)",
		isSubscription: true,
		login: async () => {
			throw new Error(
				"Claude Code OAuth login cannot run in a Worker; seed a refresh token instead",
			);
		},
		refresh: (credential, signal) =>
			refreshAnthropicOAuth(credential.refresh, signal),
		toAuth: async (credential) => ({ apiKey: credential.access }),
	};
}
