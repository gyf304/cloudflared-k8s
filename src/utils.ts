import * as k8s from "@kubernetes/client-node";
import * as zod from "zod";

export function upperSnakecaseToCamelcase(str: string): string {
	return str.toLowerCase().replace(/_([a-z])/g, (_, match) => match.toUpperCase());
}

const envSchema = zod.object({
	cloudflaredCredentials: zod.string(),
});

const tokenSchema = zod.object({
	AccountTag: zod.optional(zod.string()),
	TunnelSecret: zod.optional(zod.string()),
	TunnelID: zod.optional(zod.string()),
	TunnelName: zod.optional(zod.string()),
	a: zod.optional(zod.string()),
	t: zod.optional(zod.string()),
	s: zod.optional(zod.string()),
});

type Token = zod.TypeOf<typeof tokenSchema>;

export function getToken(): Token {
	const env = envSchema.parse(Object.fromEntries(
		Object.entries(process.env)
			.filter(([key]) => key.startsWith("CLOUDFLARED_"))
			.map(([key, value]) => [upperSnakecaseToCamelcase(key), value])
	));
	const tokenString = env.cloudflaredCredentials;
	let token: unknown;
	if (tokenString.startsWith("{")) {
		token = JSON.parse(tokenString);
	} else if (tokenString.startsWith("e")) {
		token = JSON.parse(Buffer.from(tokenString, "base64").toString());
	}

	return tokenSchema.parse(token);
}

const configSchema = zod.object({
	tunnel: zod.string(),
	"credentials-file": zod.string(),
	ingress: zod.array(zod.object({
		hostname: zod.optional(zod.string()),
		service: zod.string(),
		path: zod.optional(zod.string()),
	})),
});

export type Config = zod.TypeOf<typeof configSchema>;

export function generateConfig(ingresses: k8s.V1IngressList): Config {
	const token = getToken();
	const config: Config = {
		tunnel: token.t ?? token.TunnelID ?? "",
		"credentials-file": "credentials.json",
		ingress: [],
	};
	for (const ingress of ingresses.items) {
		const lbIngersses = ingress.status?.loadBalancer?.ingress ?? [];
		if (lbIngersses.length === 0) {
			continue;
		}
		let host = lbIngersses[0].hostname ?? lbIngersses[0].ip;
		if (host === undefined) {
			continue;
		}

		const rules = ingress.spec?.rules ?? [];
		const service = ingress.spec.rules[0].http.paths[0].backend.serviceName;
		const path = ingress.spec.rules[0].http.paths[0].path;
		config.ingress.push({
			hostname,
			service,
			path,
		});
	}
}
