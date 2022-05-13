# Prerequisite

You'll need a ingress controller installed on your k8s cluster.

This installs a nginx-ingress with ClusterIP as the service type - so not exposed to outside of the cluster.

```
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=ClusterIP \
  --set controller.ingressClassResource.default=true \
  --set controller.watchIngressWithoutClass=true
```

# Installation

1. Download [`cloudflared`](https://github.com/cloudflare/cloudflared/releases)

   You don't have to install it. You just need to `chmod +x ./cloudflared` so you can execute it.

2. Authenticate `cloudflared`

```bash
$ cloudflared tunnel login
```

```
A browser window should have opened at the following URL:

https://dash.cloudflare.com/argotunnel?...

If the browser failed to open, please visit the URL above directly in your browser.
You have successfully logged in.
If you wish to copy your credentials to a server, they have been saved to:
/Users/username/.cloudflared/cert.pem
```

Keep this `cert.pem` file.

3. Create a tunnel

```bash
cloudflared tunnel create <NAME>
```

Output:
```
Tunnel credentials written to /Users/yifangu/.cloudflared/<ID>.json . cloudflared chose this file based on where your origin certificate was found. Keep this file secret. To revoke these credentials, delete the tunnel.

Created tunnel <NAME> with id <ID>
```

4. Prepare helm values

```bash
cat > values.yaml << EOF
cloudflared:
  certificate: $(base64 < ~/.cloudflared/cert.pem)
  credentials: $(base64 < ~/.cloudflared/*.json)
  tunnel: $(echo ~/.cloudflared/*.json | rev | cut -d / -f 1 | rev | cut -d . -f 1)
EOF
```

5. Install the chart

```bash
helm upgrade \
  --install \
  --namespace=cloudflared \
  --create-namespace \
  --repo=https://gyf304.github.io/helm \
  cloudflared cloudflared \
  -f values.yaml \
  --set ingressService=http://ingress-nginx-controller.ingress-nginx # set this to the ingress-controller service of your cluster
```
