---
title: "Proof Key for Code Exchange"
summary: "PKCE binds an authorization code to the client that asked for it. The client invents a random verifier per login, sends its hash when requesting the code, and sends the verifier itself when redeeming it, so a stolen code is useless to anyone who does not have the original."
category: "Authentication and authorization"
tags: ["oauth"]
level: 5
scene: authorization-code
sceneStep: 3
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "OAuth 2.0 for Browser-Based Applications (RFC 10017)"
    url: https://www.rfc-editor.org/rfc/rfc10017
---

The third step of the scene changes one thing about the app: it has no client secret. A single-page app ships its source to every visitor and a mobile app ships a binary anyone can unpack, so a secret compiled into either of them is a secret only until somebody looks. That removes the check the second step relied on. The code still travels the front channel, an attacker can still copy it out of a URL, and now nothing at `/token` can tell the two callers apart.

PKCE puts the secret back, but a fresh one for each login and never at rest anywhere. Before it sends the browser away, the client generates a high-entropy random string, the `code_verifier`, and keeps it in memory. It hashes it with SHA-256 and sends the result as the `code_challenge`, together with `code_challenge_method=S256`, on the authorization request. The server stores the challenge next to the code it is about to mint. When the code comes back for redemption, the client sends the verifier in clear, the server hashes it again and compares. Same value, same client; different value or no value, no tokens.

What makes this work is that only the hash ever crosses the front channel. An attacker reading the URL, the history entry, or a referrer header sees the challenge and the code, and neither of them can be turned into the verifier: that is exactly what a cryptographic hash refuses to do. So the stolen code is bound to a secret the thief never saw, which is what the scene shows when the same copied code fails at `/token` for a different reason than it did in the previous step.

Use it everywhere, including on confidential clients that do have a secret. The current security guidance treats PKCE as part of the authorization code flow rather than an option on it, because it also defends a confidential client against code injection, where an attacker gets a victim's browser to redeem the attacker's code and quietly links the two accounts. Always use `S256`; the `plain` method exists only for clients that cannot compute a hash, and it protects nothing when the challenge and the verifier are the same string.

In .NET there is nothing to build. `AddOpenIdConnect` sets `UsePkce = true` by default, generates the verifier, and keeps it for the round trip inside the encrypted `state` parameter rather than anywhere the browser can read it; a correlation cookie ties the response back to the request that started it. On the exchange the handler unprotects the state and sends the verifier along with the code. For mobile and desktop clients, the same is true of the officially recommended libraries; for a SPA, prefer a backend that runs the flow so the tokens never reach the browser at all, and let PKCE protect the code on the way through it.
