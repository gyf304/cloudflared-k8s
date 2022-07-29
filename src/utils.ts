import * as k8s from "@kubernetes/client-node";
import * as zod from "zod";

function upperSnakecaseToCamelcase(str: string): string {
	return str.toLowerCase().replace(/_([a-z])/g, (_, match) => match.toUpperCase());
}

function camelCaseToUpperSnakeCase(str: string): string {
	const out = str.replace(/([a-z])([A-Z])/g, (_, match1, match2) => `${match1}_${match2}`);
	return out.toUpperCase();
}

const envSchema = zod.object({
	tunnel: zod.string(),
	ingressService: zod.optional(zod.string()),
	routeAllIngresses: zod.string().default("true").transform((s) => parseBool(s)),
	interval: zod
		.string()
		.default("10000")
		.transform((s) => parseInt(s, 10)),
});

function parseBool(s: string, fallback?: boolean): boolean {
	switch (s.toLowerCase()) {
		case "true":
		case "yes":
		case "1":
		case "t":
		case "y":
			return true;
		case "false":
		case "no":
		case "0":
		case "f":
		case "n":
			return false;
		default:
			if (fallback !== undefined) {
				return fallback;
			}
			throw new Error(`Cannot parse ${s} as boolean`)
	}
}

export function getEnv() {
	const prefix = "CLOUDFLARED_";
	try {
		const env = envSchema.parse(Object.fromEntries(
			Object.entries(process.env)
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, value]) => [key.substring(prefix.length), value] as const)
				.map(([key, value]) => [upperSnakecaseToCamelcase(key), value])
		));
		return env;
	} catch (e) {
		if (e instanceof zod.ZodError) {
			throw new Error(`Issue with environment variable ${prefix}${
				camelCaseToUpperSnakeCase(e.issues[0].path[0] as string)
			}: ${e.issues[0].message}`);
		}
		throw e;
	}
}

const configSchema = zod.object({
	ingress: zod.array(zod.object({
		hostname: zod.optional(zod.string()),
		service: zod.string(),
		path: zod.optional(zod.string()),
	})),
});

export type Config = zod.TypeOf<typeof configSchema>;

export function generateConfig(ingresses: k8s.V1IngressList): Config {
	const env = getEnv();
	const config: Config = {
		ingress: [],
	};
	for (const ingress of ingresses.items) {
		let service = ingress.metadata?.annotations?.["cfargotunnel.com/tunnel-ingress-service"];
		let enabledAnnotation = ingress.metadata?.annotations?.["cfargotunnel.com/enabled"];
		let enabled = env.routeAllIngresses || service !== undefined;
		if (enabledAnnotation !== undefined) {
			enabled = parseBool(enabledAnnotation, false);
		}

		if (!enabled) {
			continue;
		}

		if (service === undefined) {
			const lbIngresses = ingress.status?.loadBalancer?.ingress ?? [];
			if (lbIngresses.length === 0) {
				continue;
			}
			const host = lbIngresses[0].hostname ?? lbIngresses[0].ip;
			const port = lbIngresses[0].ports?.[0] ?? 80;
			if (typeof port === "number" && (port === 80 || port === 443)) {
				service = `${port === 80 ? "http" : "https"}://${host}:${port}`;
			} else if (typeof port === "object") {
				service = `${port.protocol}://${host}:${port.port}`;
			} else {
				throw new Error(`Cannot get service for ingress ${ingress.metadata?.name}`);
			}
		}

		const rules = ingress.spec?.rules ?? [];
		for (const rule of rules) {
			const hostname = rule.host;
			if (hostname === undefined) {
				continue;
			}
			config.ingress.push({
				hostname,
				service,
			});
		}
	}
	config.ingress.push({
		service: "http_status:404",
	});
	return config;
}
