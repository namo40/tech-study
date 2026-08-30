---
title: "Key Rotation"
summary: "Key rotation replaces credentials on a schedule with an overlap: two keys stay valid while callers migrate, signing uses one key while verification keeps a ring, and a leaked key stops being a permanent identity and becomes a closing window."
category: "Authentication and authorization"
tags: ["oauth"]
scene: key-rotation
steps:
  - title: "A key that never changes is a password you can never reset"
    text: "One key, valid forever: every copy ever made — in a config file, a log line, an ex-employee's laptop — stays a working identity. The ghost shows the leak that never expires. Rotation puts a lifetime on trust: keys are editions, not heirlooms."
  - title: "Two keys valid at once is what makes rotation boring"
    text: "Key B is issued while key A still works: the service accepts both, callers migrate one deploy at a time, and nobody is ever refused for being mid-migration. Only when traffic on A goes quiet is A revoked. Rotation without an overlap is an outage with a schedule."
  - title: "Sign with one key; verify with the ring"
    text: "New tokens are signed with the newest key, but yesterday's tokens are still in flight — so the verifier keeps a ring of recent keys and the `kid` header says which one to try. Old signatures stay checkable exactly as long as they need to, and no rotation ever invalidates a token mid-life."
  - title: "A leak is an emergency rotation — the same road, driven faster"
    text: "Key B leaks; because rotation is routine, revoke-and-replace is a practiced motion, not a 3 a.m. invention. The window closes in minutes. What makes it possible is discipline around the keys themselves: kept in a secret store, delivered by reference, every access audited."
related:
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
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

## When to use

- Every long-lived credential you own: API keys, signing keys, connection strings, client secrets, certificates. If a string grants access and nothing in the system will ever replace it, you have not built authentication, you have built a permanent identity that happens to be stored in several places.
- Before the leak, not after it. The reason to rotate on a calendar is that it makes the emergency path a path you have already walked. A team that rotates every quarter can revoke a leaked key in an afternoon; a team rotating for the first time under pressure is inventing the procedure and the deploy at once.
- Whenever a person who has seen a secret stops needing it: an offboarding, a contractor finishing, a laptop lost, a repository made public. Rotation is the only action that actually invalidates what they took, because you cannot un-see a string.
- When a compliance clock says so. PCI DSS, SOC 2 and most customer security reviews ask for it anyway, so the choice is between designing for rotation and suffering it once a year.
- Any credential shared by more than one caller. The more places a key lives, the more the overlap window matters, and the overlap window is the whole engineering problem.

## Cautions

- Rotation without an overlap is an outage you scheduled yourself. The order is issue, distribute, migrate, verify the old key has gone quiet, then revoke. Skipping straight from issue to revoke turns a routine change into a coordinated deploy that has to land everywhere at the same second, which is exactly the thing distributed systems are bad at.
- "Verify the old key has gone quiet" needs a measurement, not a guess. Log which key served each request and revoke when the count for the old one has been zero for longer than your slowest caller's cache window. Without that number, the revoke is a bet.
- Verification and signing rotate on different clocks. Sign with the newest key immediately, but keep verifying against a ring of recent keys until the tokens they signed have expired. A `kid` header and a JWKS document exist precisely so the verifier can hold several keys at once, and the cache window on that document is added to how long revocation takes to bite.
- Rotating the key without rotating what was derived from it leaves ghosts. Sessions minted under the old key, cached tokens, downstream copies pushed into a queue: each one is an independent credential with its own lifetime, and the leak is only closed when the last of them is.
- Distribute by reference or every rotation becomes a redeploy. If callers read the secret from a store at startup and on a refresh interval, rotation is a data change; if the secret is baked into an environment variable at build time, rotation is a release, and releases are the thing you will avoid doing at 3 a.m.
- Audit reads of the key, not just uses of it. When a key leaks, the access log is what tells you the blast radius: who fetched it, when, and from where. Without it the honest answer to "what did they get" is "everything, since forever".
- Test the revocation path as often as the issue path. Issuing a new key is the half that always works, because someone is watching. Revoking is the half that discovers a service nobody remembered, and you would rather discover it on a Tuesday.

## In .NET

Azure Key Vault can own the schedule, so rotation stops being a runbook step and becomes a policy the vault enforces:

```csharp
var keys = new KeyClient(new Uri(vaultUri), new DefaultAzureCredential());

await keys.UpdateKeyRotationPolicyAsync("signing-key", new KeyRotationPolicy
{
    ExpiresIn = "P90D",
    LifetimeActions =
    {
        // Cut the next edition a month before this one expires. That month
        // is the overlap, and the overlap is what makes it uneventful.
        new KeyRotationLifetimeAction(KeyRotationPolicyAction.Rotate)
        {
            TimeBeforeExpiry = "P30D",
        },
    },
});
```

Callers should hold a reference to the secret rather than a copy of it. Cache the fetch so you are not calling the vault per request, but bound the cache deliberately: that window is exactly how long a revocation takes to reach this process.

```csharp
// The cache lifetime is a security parameter, not a performance one.
var connection = await cache.GetOrCreateAsync("orders-db", async entry =>
{
    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
    var secret = await secrets.GetSecretAsync("orders-db");
    return secret.Value.Value;
});
```

ASP.NET Core Data Protection already works this way and is worth reading as a model: it keeps a key ring, retires the active key after ninety days by default, signs new payloads with the newest key, and goes on decrypting payloads made with older ones until they fall out of the ring.

```csharp
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri(blobUri), new DefaultAzureCredential())
    .ProtectKeysWithAzureKeyVault(new Uri(wrappingKeyUri), new DefaultAzureCredential())
    .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
```

For tokens, let the JWKS document do the work. The handler fetches the issuer's public keys, matches on `kid`, and refreshes on its own schedule, so a rotation at the issuer needs nothing deployed here:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        // How long a rotated-out key can still be accepted, and how quickly a
        // new one becomes usable. Both are this number.
        options.AutomaticRefreshInterval = TimeSpan.FromHours(12);
        options.RefreshInterval = TimeSpan.FromMinutes(5);
    });
```

The cheapest key to rotate is the one you never hold. Managed Identity, workload identity federation and `DefaultAzureCredential` replace the stored secret with a token the platform mints and rotates for you, and a credential that never appears in your configuration cannot leak out of it.
