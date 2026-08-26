---
title: "JSON Web Token"
summary: "A JWT is three base64 segments joined by dots: a header saying how it was signed, a payload of claims, and a signature over both. The signature makes it unforgeable without making it secret, which is why anyone holding one can read every claim inside it."
category: "Authentication and authorization"
tags: ["oauth"]
scene: bearer-token
sceneStep: 2
related:
  - label: Bearer Token
    slug: bearer-token
  - label: Claims
    slug: claims
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: Refresh Token
    slug: refresh-token
  - label: Authorization Code
    slug: authorization-code
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: JSON Web Token (RFC 7519)
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: Security tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/security-tokens
---

The second step of the scene takes the token apart, and what it finds is three pieces of base64 with dots between them. The first is the header, and it is small and dull on purpose: which algorithm signed this, and which key. The second is the payload, the claims, and it is the part everything else in the flow actually reads. The third is the signature, computed over the first two, and it is the only part that anyone has to hold a key to produce.

The reason the panel opens rather than unlocks is the point the step is making. Base64 is a transport encoding, chosen so a token survives a URL, a header, and a copy-paste, and reversing it takes no key and no permission. Anyone who has ever pasted a token into a decoder has already proved this. So the signature is not privacy, and it was never meant to be: it proves that the bytes you are holding are the bytes the issuer produced, and it proves nothing whatsoever about who is holding them. That is exactly the property a bearer credential has, described from the inside.

What follows is a short list of things you now know not to do. Do not put a secret in a claim, because a claim is public to whoever has the token, including the user, including whatever their browser extensions can read. Do not use a JWT as a place to cache data you would rather not fetch; the token travels on every request, and a payload that grew to two kilobytes is two kilobytes on every call plus a header limit you will eventually hit. And do not treat "it decoded cleanly" as validation, because decoding is something an attacker can do to a token they wrote themselves.

Validation is the signature plus the registered claims around it, and the algorithm is part of what you check rather than part of what you are told. The historic failure here is a library that read `alg` from the header and believed it, which let an attacker set `alg` to `none` or downgrade an RSA token to an HMAC signed with the public key. Modern libraries refuse both by default, and the way you keep that true is to pin the algorithms you accept rather than accepting whatever arrives.

Symmetric or asymmetric decides who can mint. `HS256` uses one shared secret, so every service that can validate a token can also create one, which is fine inside a single application and a bad idea the moment two teams are involved. `RS256` and `ES256` sign with a private key and validate with a public one published at a well-known JWKS endpoint, so a hundred APIs can check a token while exactly one service can issue it. Key rotation then becomes a property of that endpoint: the issuer publishes the new key alongside the old, validators pick up both by `kid`, and the old one is retired once nothing signed with it is still alive.

The last thing worth knowing is what a JWT costs you in exchange for being self-contained. Because validation needs no call to the issuer, nothing the issuer learns after minting can reach a token already in flight. A session ended, a role removed, a device deauthorized: none of it changes a signature. That is the trade the format makes, and the two ways out of it are the same two the fourth step of the scene shows, a lifetime short enough that the window does not matter, and a deny list checked by id for the times when it does.
