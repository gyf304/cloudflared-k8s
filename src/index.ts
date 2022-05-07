import * as k8s from "@kubernetes/client-node";

async function main() {
	const kc = new k8s.KubeConfig();
	kc.loadFromDefault();
	const k8sApi = kc.makeApiClient(k8s.NetworkingV1Api);
	const ingresses = await k8sApi.listIngressForAllNamespaces();
	console.log(ingresses);
}

main();
