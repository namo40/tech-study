---
title: "Signature"
summary: "A signature is proof of origin that cannot be forged: it says a particular key produced these exact bytes and nothing has changed since. The `kid` header names which key, so a verifier can hold a ring of them and rotation never invalidates what is already in flight."
category: "Authentication and authorization"
tags: ["oauth"]
scene: key-rotation
sceneStep: 3
related:
  - label: Key Rotation
    slug: key-rotation
  - label: JSON Web Token
    slug: json-web-token
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Mutual TLS
    slug: mutual-tls
  - label: Workload Identity
    slug: workload-identity
  - label: Authentication
    slug: authentication
references:
  - title: Configure cryptographic key auto-rotation in Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Rotation tutorial for resources with two sets of credentials
    url: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation-dual
---

A signature is not encryption. The payload of a signed token is usually readable by anyone who has it; what the signature adds is a claim nobody else can make, which is that a particular key produced these exact bytes and that not one of them has changed since. Change a single character of the payload and the check fails, because the signature was computed over the payload and the two no longer agree. That is the whole of what it proves, and it is enough to carry an identity across a network you do not control, because a claim you cannot forge is worth more than a channel you have to trust.

There are two shapes of it and the difference decides who can hold what. A symmetric signature, HMAC over a shared secret, is cheap and small, but the same key both makes and checks it, so every verifier is also a potential forger. An asymmetric signature is made with a private key and checked with the matching public one, so the verifier can be a service you have never met and still be certain of the origin: it can tell that you signed something and it cannot sign anything itself. That asymmetry is why public token formats are asymmetric, and why the public half can sit on an open URL where anyone is welcome to fetch it.

The header carries a `kid`, and that small field is what makes rotation survivable. A signature names the key that made it, so a verifier does not have to guess and does not have to hold exactly one: it keeps a ring of recent public keys, looks up the one the token names, and checks against that. New tokens are signed with the newest key from the moment it is cut, while tokens signed yesterday go on verifying until they expire on their own schedule. Nothing is invalidated mid-life, no caller has to be told to reauthenticate, and the retirement of a key is a quiet event that only shows up as the ring dropping an entry once nothing can still name it.

What a signature does not say is at least as important as what it does. It says who made this and that it is unchanged; it says nothing about whether the statement is still true. Expiry, audience, issuer and revocation are separate checks, and a verifier that stops at "the signature is valid" will happily accept a token issued for another service, or one whose session was ended an hour ago. Two more rules follow from the same care: never let the token choose its own algorithm, because `alg: none` and the RS256-verified-as-HMAC confusion are both attacks on a verifier that took the header's word for it, and never accept a `kid` you have not seen before by fetching whatever URL it points at. Pin the algorithm, look the `kid` up in a ring you control, and treat everything else in the header as a hint rather than an instruction.
