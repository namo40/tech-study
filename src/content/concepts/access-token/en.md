---
title: "Access Token"
summary: "An access token is the credential an app presents to an API to act on a user's behalf. It is short-lived, addressed to one audience, and carries only the scopes that were granted, so a leaked one is worth little for long and worth nothing anywhere else."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Refresh Token
    slug: refresh-token
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens (RFC 9068)"
    url: https://www.rfc-editor.org/rfc/rfc9068
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
---

The access token is what the first step of the scene is working towards. Everything before it exists to get one safely: the browser goes to the authorization server, the user's password is typed only there, a code comes back, and the code is traded for this. From then on the app does not think about the user's identity at all. It attaches the access token to each API call and the API decides what that token is allowed to do.

Three things on the token decide that. The audience says which API it was minted for, so a token for the orders API is refused by the payments API even though both trust the same issuer. The scopes say which parts of that API it may touch, and they are the subset the user consented to rather than everything the app can do. The expiry says how long any of it is true, and it is deliberately short: minutes, not days. Nothing else about the token matters to the API, which is why an access token should be treated as opaque by the app that carries it, even when it happens to be a readable JWT.

Short lifetimes are the main defence, because an access token is a bearer credential: whoever holds it can use it, and the API has no way to tell a copy from the original. That is the trade the design makes. Rather than trying to make theft impossible, it makes a stolen token expire on its own, and it keeps the thing that would let an attacker mint new ones, the refresh token, off every channel a browser can see.

Most access tokens are signed JWTs, which lets an API validate one without calling the authorization server: check the signature against the published keys, check the issuer, the audience and the expiry, and read the claims. That is fast and it scales, and it has one consequence worth planning for. A JWT stays valid until it expires, so revoking a session does not stop a token that was already handed out. Either accept a window equal to the token's lifetime, or introspect at the authorization server for the calls where that window is too long.

Two habits keep the rest of it safe. Send the token in the `Authorization` header rather than in a query string, so it does not land in logs, browser history, or a referrer. And keep it out of the browser's storage: in a server-rendered app the token belongs in the session on the server, and in a single-page app it belongs behind a backend that holds it for you.
