---
title: "Token Revocation"
summary: "Revocation is how a token stops working before it expires, and a signature cannot be taken back, so it has to be a lookup the API agrees to pay for. That makes it the exceptional path: short lifetimes handle the ordinary case, and a deny list handles the tokens you actually had to kill."
category: "Authentication and authorization"
tags: ["oauth"]
scene: bearer-token
sceneStep: 4
related:
  - label: Bearer Token
    slug: bearer-token
  - label: Token Rotation
    slug: token-rotation
  - label: Refresh Token
    slug: refresh-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization Code
    slug: authorization-code
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "OAuth 2.0 Token Revocation (RFC 7009)"
    url: https://www.rfc-editor.org/rfc/rfc7009
  - title: "OAuth 2.0 Token Introspection (RFC 7662)"
    url: https://www.rfc-editor.org/rfc/rfc7662
  - title: Refresh tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
---

The fourth step of the scene adds a gate the first three did not need, and the reason it has to be added rather than simply being there is the whole subject. The other gates read the token: the signature is checked against a key, the expiry against a clock, the audience against a string in configuration. None of them asks anyone anything. A revocation check cannot work that way, because "this token has been withdrawn" is not a fact the token carries and never will be. It is a fact somebody recorded after the token was already in the world, and the only way the API learns it is by going and looking.

So revocation is a lookup, and a lookup is exactly the cost that self-contained tokens were adopted to avoid. That framing keeps the design honest. The question is not whether to have revocation, it is which calls pay for it, and the usual answer is that access tokens are given a lifetime short enough that nobody needs to withdraw them, while refresh tokens, which live for days, are revocable by design. Kill the refresh token and the session ends within one access token lifetime, without a single extra lookup on the hot path.

When you do need the deny list, keep it small by construction. It only ever has to hold tokens that have been withdrawn and have not yet expired, so every entry has a natural time to die and the store can be a cache with a TTL rather than a table someone has to garbage collect. The key is the token's own id, the `jti` claim, which is why a token you might ever want to withdraw needs one; hashing the whole token works too, but it is longer and it tells you nothing when you are staring at the list wondering what is on it. Load the list into each API instance and refresh it on a short interval, and the check costs a hash set lookup rather than a network call, at the price of a propagation delay you should be able to state in seconds.

The alternative shape is introspection, where the API stops validating locally and asks the authorization server about every token it receives. That gives an instant, exact answer and it gives up everything the local check bought: the issuer is now on the path of every request, its availability is your availability, and its latency is added to yours. It suits opaque tokens and low-volume, high-sensitivity APIs. It does not suit the general case, and reaching for it because revocation felt untidy is how a stateless design quietly becomes a stateful one with extra steps.

Rotation is the other half, and it is the part the honest client experiences. When a token is withdrawn the client is not being punished, it is being asked to come back for a new one, and a client that already refreshes on a schedule notices nothing at all. Refresh token rotation makes this useful rather than merely tidy: each refresh returns a new refresh token and retires the old one, so a refresh token presented for the second time is evidence that a copy exists somewhere, and the correct response is to revoke the whole family and make the real user sign in again. That turns theft from something you hope to prevent into something you can detect.

What is left is the operational part, and it is worth deciding before you need it. Know what a compromise is going to require: revoking one session, every session for one user, or every token issued by one client. Know how long the propagation delay is, because that number is what you will be asked during an incident. And confirm that the deny list is checked on the paths that matter and skipped on the ones that do not, since a revocation nobody consults is a database row with no effect at all.
