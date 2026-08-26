---
title: "Bearer Token"
summary: "A bearer token means possession is authority: the API serves whoever presents it and asks nothing else. Everything about handling one follows from that sentence, so carry it carefully, keep it short-lived and narrow, and plan for the day one leaks."
category: "Authentication and authorization"
tags: ["oauth"]
scene: bearer-token
steps:
  - title: "Possession is authority"
    text: "The request carries the token in a header, and the API serves it without asking who you are. No token, no service. Nothing else about you is consulted — that one sentence is the whole model."
  - title: "Readable, not secret"
    text: "A JWT is three base64 parts: header, claims, signature. Anyone holding it can read the claims — who it is for, what it allows, when it dies. Encoding is not encryption; the signature only proves nothing was changed."
  - title: "Validation gates, and the leak"
    text: "The API checks the signature, the expiry, the audience — cheap, local, no call to the issuer. Then the token leaks, and the attacker's request passes the same gates, because possession is authority. The expiry is what caps the damage."
  - title: "You cannot unsign, so you revoke and rotate"
    text: "A signed token stays valid until it expires; to cut one off early the API must check its id against a deny list, and that is a lookup you pay on purpose. The honest client just rotates to a fresh token and never notices."
related:
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authorization Code
    slug: authorization-code
  - label: ID Token
    slug: id-token
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: Token Rotation
    slug: token-rotation
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "The OAuth 2.0 Authorization Framework: Bearer Token Usage (RFC 6750)"
    url: https://www.rfc-editor.org/rfc/rfc6750
  - title: JSON Web Token (RFC 7519)
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Access tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication
---

## When to use

- Every API call after a login is carrying one, whether you named it or not. Bearer is how authority travels between a client and an API that share no session: the caller attaches a string, the API reads it, and neither end has to remember the other.
- Reach for it when the API is stateless and the callers are many. A signed token validates locally against a public key, so a call costs no round trip to the issuer and no lookup in a shared session store, and that is the whole reason the pattern won.
- It is the wrong tool when the client is a browser you also control end to end. A same-site cookie with `HttpOnly` is a bearer credential too, but the browser attaches it for you and script cannot read it, which removes the largest way a token gets stolen.
- Watch 401 rates and token lifetimes on the same chart. A 401 rate that steps up on a schedule is a lifetime expiring faster than the client refreshes, and one that steps up after a deploy is usually an audience or an issuer that no longer matches.
- Decide up front where a token is allowed to be written down. The answer is almost always "in memory, in the `Authorization` header, and nowhere else", and it is much cheaper to decide it before the first log line than after the first incident.

## Cautions

- Bearer means exactly what it says: anyone holding the token wins. The API cannot tell a copy from the original, so every design question reduces to keeping the number of places a copy can exist small and the time it stays useful short.
- Never put one in a URL. A query string lands in access logs, browser history, proxy logs, and the `Referer` header of the next request, and each of those is a place your token now lives that nobody is watching. The same goes for your own logs: redact the header rather than trusting that nobody logs it.
- Short lifetimes plus refresh rotation beat long-lived tokens every time. Minutes of access token and a refresh token that is replaced on each use gives you a small damage window and a tripwire, because a refresh token presented twice is proof that a copy exists.
- Validate locally and completely. The signature says the token was minted by the issuer you trust, the expiry says it is still true, and the audience says it was meant for this API. Skip the audience check and any token from the same issuer opens your API, including one a user handed to somebody else's app.
- A JWT is readable by anyone holding it, so nothing secret belongs in the claims. Base64 is an encoding, not a cipher, and a payload you would not paste into a support ticket should not be in a token you cannot control the travel of.
- Keep revocation for the exceptional path. Checking every call against a deny list turns your stateless API back into a stateful one, so the usual shape is a short lifetime for the ordinary case and a deny list consulted only for the tokens you actually had to kill.

## In .NET

`AddAuthentication().AddJwtBearer()` wires the whole validation chain into the pipeline, and `TokenValidationParameters` is where the three gates are set: `ValidIssuer`, `ValidAudience`, and `ValidateLifetime` with a `ClockSkew` you should shrink from its five minute default. The signing keys usually come from the issuer's discovery document, so `Authority` is enough and the keys are refreshed for you. Inside an endpoint the token is already a `ClaimsPrincipal`, so `User.FindFirst("scope")` reads what was granted, and authorization policies express the rule rather than the string comparison. On the calling side, set `request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token)` on an `HttpClient` that a `DelegatingHandler` keeps supplied, so the token is fetched, cached, and refreshed in one place instead of at every call site.
