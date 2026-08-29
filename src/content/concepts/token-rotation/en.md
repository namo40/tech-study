---
title: "Token Rotation"
summary: "A refresh token is replaced every time it is redeemed, so each one works exactly once. That makes the second use of a spent token evidence of theft, and the server's answer is to revoke the whole family rather than the single token."
category: "Authentication and authorization"
tags: ["oauth"]
scene: oauth-2-0
sceneStep: 3
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Refresh Token
    slug: refresh-token
  - label: Access Token
    slug: access-token
  - label: Token Revocation
    slug: token-revocation
  - label: Authorization Code
    slug: authorization-code
  - label: Bearer Token
    slug: bearer-token
  - label: OpenID Connect
    slug: openid-connect
  - label: JSON Web Token
    slug: json-web-token
  - label: Key Rotation
    slug: key-rotation
  - label: Authorization
    slug: authorization
references:
  - title: "Refresh tokens in the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

The third step of the scene turns on one rule, and everything visible follows from it: a refresh token may be redeemed once. The app presents `refresh #1`, gets a new access token and `refresh #2` back, and `#1` stops existing. Nothing in the animation decides that the theft will be caught later; it is caught because the ticket the thief presents is one the server has already spent.

That is worth stating plainly, because the usual mental model of a refresh token is a long-lived password for tokens, and long-lived is exactly the property that makes it dangerous. A refresh token is the most valuable thing in the whole flow. It lives for days or weeks rather than minutes, it is not sent to APIs so it is not scattered across logs and proxies, and anyone holding it can mint access tokens indefinitely. Rotation does not make it harder to steal. It makes theft *observable*, which is a different and better property, because you cannot respond to something you never learn about.

The mechanism has two halves and both are required. Rotation is the first: every redemption returns a new refresh token and invalidates the one presented. Reuse detection is the second: the server remembers spent tokens and treats a second presentation as an alarm. Rotation without detection just moves the target around, since a thief who redeems a stolen token gets a valid replacement and the legitimate app is the one that silently breaks. Detection is what converts that breakage into a decision.

The decision is deliberately blunt. When a spent token comes back, the server cannot tell which of the two callers is the real app: the thief may have redeemed first and the app is now presenting the stale copy, or the reverse. Both stories fit the same evidence. So the correct response is not to reject the one request but to revoke the entire token family descended from that login, which is what the scene draws when the `revoked` lamp comes on and the wallet empties. Both parties lose access, the user signs in again, and the thief's copy is worth nothing. Annoying the real user once is the cheap outcome; the expensive one is leaving an attacker with a renewable grant nobody noticed.

Two practical hazards come out of that bluntness. The first is a race with itself: a mobile app that resumes on three threads at once, or a page that fires two API calls into an expired token, can send two redemptions of the same refresh token milliseconds apart and revoke its own family. The fix is on the client, and it is the ordinary one for shared mutable state: a single-flight lock around refresh, so concurrent callers await one redemption rather than each starting their own. Servers usually help with a short grace window in which the immediately preceding token is still accepted, but that window is a courtesy, not something to build on.

The second is storage. A rotated token is only as safe as the write that persists it. If an app redeems, receives `#2`, and crashes before the new token reaches disk, it wakes up holding `#1`, presents it, and revokes itself. Persist the new refresh token before you use the access token that came with it, and treat the pair as one transaction. In .NET this is the argument for `AddDistributedTokenCaches` over the in-memory default: a scaled-out app whose instances each hold their own idea of the current refresh token is a family revocation waiting for the next load-balancer decision.

Rotation is also what makes the difference between a public and a confidential client survivable. A single-page app cannot keep a secret, so its refresh token is exposed to anything that can run script in the page; with rotation, an exfiltrated token has a short useful life and its use leaves a mark. That is why refresh tokens for browser clients are short-lived, non-extendable, and rotated on every use, and why storing one where a cross-site scripting bug can read it is still a serious bug rather than a mitigated one. Rotation limits the blast radius; it does not remove the explosive.
