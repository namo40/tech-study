---
title: "Refresh Token"
summary: "A refresh token is what an app redeems for a new access token when the old one expires, without sending the user through a login again. It never leaves the back channel, it is rotated on every use, and a replay of an old one is treated as theft."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authorization-code
sceneStep: 4
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Access Token
    slug: access-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: "OAuth 2.0 for Browser-Based Applications (RFC 10017)"
    url: https://www.rfc-editor.org/rfc/rfc10017
---

Short access tokens create a problem the fourth step of the scene walks through: the token dies while the user is still working. The API answers 401, and something has to produce a new token without interrupting anyone. Sending the browser back to the authorization server would work, but it would happen every few minutes and it would drag the user through a redirect each time. The refresh token exists so that the app can do it alone, on the back channel, with no user interaction and no browser involved.

That makes it the most valuable thing the app holds. An access token is a few minutes of limited permission; a refresh token is the ability to keep minting access tokens for as long as the grant lives. So it is treated differently at every point. It is never put in a URL and never sent to an API, and it is stored where the app stores secrets: the server-side session, a token store, or the platform keychain on a mobile device. It is not handed to a browser either, unless the client is a browser app that cannot avoid holding one — and then it is short-lived, non-extendable, and rotated on every use.

Rotation is what makes it survivable if it does leak. Every redemption returns a new refresh token and invalidates the one that was used, so a stolen copy is only good until the legitimate app refreshes next. Better, it turns theft into something the server can detect. Two parties holding the same refresh token means one of them will eventually present a token that has already been rotated away, and that is not a normal event: a client that follows the protocol never replays a spent one. The server's answer is to revoke the whole family, every token descended from that original grant, which ends both sessions and forces a real login. That is the last thing the scene shows, and it is why the app's own refresh token goes dark along with the copy.

The cost is that a lost response looks exactly like an attack. If the network drops the reply carrying the new pair, the client still holds the old token, retries with it, and gets the family revoked. Guard against it: treat a refresh as non-idempotent, do not retry it blindly, keep a short grace window where the immediately previous token is accepted and returns the same new pair, and make sure only one thread refreshes at a time so two concurrent calls cannot race each other into a revocation.

Ask for one only when you need it. In OpenID Connect that means requesting the `offline_access` scope, and it is worth being deliberate about which clients get it: a server-rendered app with a session usually does, a browser-based app usually should not, and where a SPA cannot avoid it, the token belongs behind a backend rather than in the page. Whatever holds it should also be able to revoke it, so a sign-out means calling the revocation endpoint rather than only dropping a cookie.
