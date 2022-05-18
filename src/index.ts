import * as k8s from "@kubernetes/client-node";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import { spawn, ChildProcess } from "child_process";
import jsonStringify from "fast-json-stable-stringify";
import { Config, generateConfig, getEnv } from "./utils";

let prevConfig: Config | null = null;
let cloudflared: ChildProcess | null = null;

async function sync(ingresses: k8s.V1IngressList) {
	const config = generateConfig(ingresses);
	if (jsonStringify(config) === jsonStringify(prevConfig)) {
		return;
	}
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cloudflared-"));
	const env = getEnv();
	const configPath = path.join(tmpDir, "config.json");
	await fs.writeFile(configPath, jsonStringify(config));
	if (cloudflared !== null) {
		cloudflared.kill();
	}
	for (const { hostname } of config.ingress) {
		if (hostname === undefined) {
			continue;
		}
		const proc = spawn(
			"cloudflared",
			["tunnel", "route", "dns", env.tunnel, hostname],
			{ stdio: "inherit" },
		);
		await new Promise<void>((resolve, reject) => {
			proc.on("error", reject);
			proc.on("exit", (code) => {
				if (code === 0) {
					resolve();
				}
				reject(new Error(`cloudflared exited with code ${code}`));
			});
		});
	}
	cloudflared = spawn(
		"cloudflared",
		["--config", configPath, "--no-autoupdate", "tunnel", "run", env.tunnel],
		{ stdio: "inherit" },
	);
	prevConfig = config;
}

async function main() {
	const env = getEnv();
	const interval = env.interval;
	const kc = new k8s.KubeConfig();
	kc.loadFromDefault();
	const k8sApi = kc.makeApiClient(k8s.NetworkingV1Api);
	while (true) {
		const ingresses = await k8sApi.listIngressForAllNamespaces();
		await sync(ingresses.body);
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

main();
