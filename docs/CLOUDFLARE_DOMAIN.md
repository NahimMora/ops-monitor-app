# Domain: ops.moraapps.com (Cloudflare)

Cloudflare manages DNS for `moraapps.com`. This does not presuppose
account access — follow these steps manually once Hostinger has assigned
the app's target.

## 1. Get the target from Hostinger

After connecting the Node.js app to the domain in hPanel (or before, to
see what it expects), Hostinger will show either:

- an **IP address** to point an `A` record at, or
- a **hostname** (CNAME target) to point a `CNAME` record at.

Do not guess this value — read it from Hostinger's domain/SSL panel for
this specific app after the app is created.

## 2. DNS records in Cloudflare

In the Cloudflare dashboard for `moraapps.com` → DNS → Add record:

- If Hostinger gave an IP: `A` record, name `ops`, content `<the IP>`,
  proxy status per your preference (proxied is fine for a private app
  behind login; DNS-only also works and is simpler to debug SSL issues
  with initially).
- If Hostinger gave a hostname: `CNAME` record, name `ops`, target
  `<the hostname>`.

## 3. SSL

Once DNS resolves, Hostinger issues its own SSL certificate for the
domain (Let's Encrypt, typically automatic once DNS points correctly). If
Cloudflare proxying is enabled, set Cloudflare's SSL/TLS mode to **Full**
(not Flexible) so the Cloudflare→Hostinger leg is also encrypted with a
real certificate, not plaintext.

## 4. Verify

```
dig ops.moraapps.com
curl -I https://ops.moraapps.com/api/health
```

Expect a valid TLS handshake and a 200 from `/api/health`.

## Not covered here

Any change to Cloudflare account-level settings (WAF rules, Access
policies, etc.) is out of scope for this deployment — this is a plain DNS
+ SSL pass-through setup, nothing else was configured or assumed.
