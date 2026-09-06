---
title: "Issuer"
summary: "The issuer is the party that minted a token, named by the iss claim. Validating it is not a string comparison but a trust chain: the issuer identifies a discovery document, the document names the signing keys, and the keys are what the signature is checked against."
category: "Authentication and authorization"
tags: ["oauth"]
level: 5
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
  - label: JSON Web Token
    slug: json-web-token
  - label: Signature
    slug: signature
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "JSON Web Token (RFC 7519)"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
---

The scene's third step asks two names of the token, and the issuer is the first of them: who minted this. In a JWT it is the `iss` claim, and it is a URL rather than a friendly name, because the value has to be unique across the whole internet and because the receiver is going to do something with it. The second question, who the token is for, is the audience, and the two are only useful together.

What a receiver actually does with `iss` is the part usually skipped. The string comparison everyone pictures is the last link of a chain, not the check itself. The issuer value identifies a discovery document, fetched from the issuer's well-known path; the document declares its own `issuer` and points at a `jwks_uri`; that endpoint serves the public keys; and the token's signature is verified against the key its header names. Only then does the comparison mean anything, because it now says that this token was signed by a key published by the party the receiver decided to trust.

```text
GET https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration

  "issuer":   "https://login.microsoftonline.com/<tenant>/v2.0"
  "jwks_uri": "https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys"
```

Reading it as a chain explains the operational details that otherwise look arbitrary. The keys are fetched rather than configured because issuers rotate them, and a receiver that pinned a key is a receiver that breaks on a rotation day nobody told it about. The document is cached with a refresh, so a signature failure for an unknown key id should trigger a re-fetch instead of a rejection. The issuer must be `https`, and the discovery document's own `issuer` value has to equal the one in the token, which is what stops a discovery URL supplied by an attacker from redefining who a trusted issuer is. In .NET this is what setting `Authority` arranges for you, and `ValidIssuer` is the end of the chain rather than the whole of it.

The classic failure is multi-tenant. In a tenanted identity provider the issuer contains the tenant id, so an API built against the common endpoint sees a different `iss` for every customer, and the quickest way to make all of them work is to stop checking. What that actually does is accept tokens minted for any tenant in the world, including one the attacker created five minutes ago and controls completely, since those tokens are properly signed by the same provider. The correct shape is an allow-list, or an issuer validator that checks the tenant id against the tenants you have onboarded. Workload identity federation is the same rule expressed as configuration: the cloud stores the exact issuer of the cluster's token service together with the subject it will accept, so the scene's third step is a lookup of a trust relationship someone registered on purpose, not a decision made at request time.
