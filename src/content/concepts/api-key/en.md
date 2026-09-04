---
title: "API Key"
summary: "An API key is a machine's evidence of identity: a long secret issued once, presented on every call, and checked against a registry. Possession is the whole proof, which is why a leaked key is a leaked identity."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authentication
sceneStep: 3
related:
  - label: Authentication
    slug: authentication
  - label: Mutual TLS
    slug: mutual-tls
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization
    slug: authorization
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "Subscriptions in Azure API Management"
    url: https://learn.microsoft.com/en-us/azure/api-management/api-management-subscriptions
  - title: "AzureKeyCredential Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.azurekeycredential
  - title: "Azure Key Vault Overview"
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/overview
---

Watch the third step of the scene and notice what the machine does not have. There is no password on the `service` capsule, because there are no fingers to type one and nobody to remember it. What travels instead is a plate riding beside the dot: a thing the caller holds rather than a thing it knows. The Verifier reads it, looks it up in a registry, and the answer is the same shape as the answer for the person a step earlier. The mechanism changed; the question did not.

That is really the whole of an API key. It is a long, random, opaque string with no structure the server has to parse and no claims inside it to argue about. The server keeps a table of the keys it issued and what each one belongs to, and verification is a lookup. Nothing is derived, nothing is computed, nothing expires on its own. The key is not evidence *about* an identity; for the purposes of the check it simply is the identity, which is a much stronger statement than it first sounds.

The consequence is the one the scene marks in the third step: a leaked key is an identity leak, immediately and completely. There is no second factor behind it, no device binding, no user to notice the unfamiliar login. Whoever holds the string is the service, from anywhere, until somebody revokes it. That is why every practice around keys is really a practice about limiting what a copy is worth. Scope each key to the narrowest set of operations that lets its holder do its job, so a copy inherits a small thing. Give each caller its own key rather than sharing one, so a copy can be traced and revoked without taking everybody else down. And rotate on a schedule, so a copy that nobody noticed has a shelf life even when nothing was detected.

Rotation is the part that gets skipped, and it is skipped because doing it naively means an outage. The fix is to make two keys valid at once. Issue the new key, deploy it to the callers, wait until traffic on the old key stops, and only then revoke the old one. Every key store that is pleasant to use supports exactly that overlap, and once the overlap exists rotation stops being an event and becomes a schedule.

Where a key must never be is almost as important as where it is. Not in a URL, because URLs land in access logs, browser history, referrer headers and error reports. Not in a repository, not in a container image, not in a client-side bundle, since anything shipped to a browser or a phone is published rather than stored. A key belongs in a secret store the platform gives you, injected at run time and never written anywhere by your own code, and its handling should include not logging it: a key that appears in a stack trace has left the building.

In .NET the client side is a header on an `HttpClient` configured once, and the value comes from configuration that is bound to a secret store rather than to a file in the repository.

```csharp
builder.Services.AddHttpClient("billing", client =>
{
    client.BaseAddress = new Uri("https://billing.internal/");
    // The key is a header, never a query string: URLs are logged by default,
    // headers only if somebody turns request logging on.
    client.DefaultRequestHeaders.Add("X-Api-Key", builder.Configuration["Billing:ApiKey"]);
});
```

The server side is a small authentication handler, and the two details that matter are both in the comparison. Look the key up by a hash rather than storing the key itself, so a copy of your database is not a copy of every key; and compare in fixed time, because a comparison that returns early leaks the prefix it matched to anybody patient enough to measure.

```csharp
var provided = context.Request.Headers["X-Api-Key"].ToString();

// No header, or one too short to hold a prefix: there is nothing to look up,
// and indexing into it would throw rather than refuse.
if (provided.Length < 8) return AuthenticateResult.NoResult();

var digest = SHA256.HashData(Encoding.UTF8.GetBytes(provided));

// One lookup, then a constant-time comparison of the stored digest.
var record = await registry.FindByPrefixAsync(provided[..8]);
if (record is null || !CryptographicOperations.FixedTimeEquals(digest, record.Digest))
{
    return AuthenticateResult.Fail("unknown api key");
}
```

The honest last word is that an API key is the weakest of the three mechanisms the scene shows, and it is worth being clear about why. A password has a human behind it who can be asked for a second factor; a certificate proves possession of a private key that never crosses the wire. A key is a secret sent on every call, so every hop that can read the request can read the identity. It is the right answer when the alternative is nothing, when the caller is a third party you cannot issue certificates to, or when the platform you are on has no better primitive. When the platform does have one — a managed identity, a workload identity, mutual TLS — the better mechanism is better precisely because it removes the string you would otherwise have to keep safe.
