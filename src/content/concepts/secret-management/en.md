---
title: "Secret Management"
summary: "A secret should have exactly one home and every other place should hold a reference to it. Deliver by reference and rotation is a data change rather than a release; audit every read and a leak has a blast radius you can actually measure."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: key-rotation
sceneStep: 4
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
  - label: Mutual TLS
    slug: mutual-tls
  - label: Authentication
    slug: authentication
references:
  - title: Azure Key Vault configuration provider
    url: https://learn.microsoft.com/en-us/aspnet/core/security/key-vault-configuration
  - title: Safe storage of app secrets in development
    url: https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets
  - title: Azure Key Vault logging
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/logging
---

Secret management starts from one rule: a secret has exactly one home, and everywhere else holds a reference to it rather than a copy. The moment a connection string is pasted into an appsettings file, a CI variable, a deployment manifest and a colleague's message, you no longer have one credential, you have four, each with its own lifetime and its own way of getting out. That is why the interesting question is never "where do we encrypt it" but "how many places would we have to change to replace it", and a good answer to the second question is one.

Delivery by reference is what makes that answer possible. The application is configured with the name of a secret and an identity that is allowed to read it; at startup, and again on a refresh interval, it fetches the current value from the store. Nothing about the credential is baked into the image or the manifest, so rotating it is a data change rather than a release, and the time between the store being updated and the process noticing is a number you chose rather than a queue of pull requests. That number is a security parameter: it is exactly how long a revoked value goes on working inside a process that already had it, so pick it deliberately, keep it short enough that an emergency rotation finishes inside your incident, and make sure a failure to refresh is loud rather than a silent fallback to the value from last week.

Auditing reads is the part teams skip and then wish they had. A store that logs who fetched which secret, when, and from where turns the worst question after a leak into an answerable one: instead of "assume everything, since forever", you get a list of identities and a window. That only works if the identities are worth listing, which means one identity per service rather than one shared application account, and permissions scoped to the handful of secrets that service actually needs. Least privilege here is not paperwork; it is what converts an audit log from a wall of noise into a blast radius, and it is what stops one compromised job from being able to read the whole vault.

The cheapest secret to manage is the one that does not exist. Managed identities, workload identity federation and short-lived tokens replace a stored string with a credential the platform mints on demand and rotates without telling anyone, and a credential that never appears in your configuration cannot leak out of it. Where a real secret is unavoidable, close the other doors around it: secret scanning and push protection on the repository so a paste is caught at the commit rather than in a breach report, redaction in the logging pipeline so a value cannot arrive in a log sink that is readable by more people than the vault is, and a rehearsed revoke-and-replace path, because the plan you have never run is not a plan.
