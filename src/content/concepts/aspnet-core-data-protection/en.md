---
title: "ASP.NET Core Data Protection"
summary: "Data Protection is the cryptographic API the framework itself uses to protect cookies, antiforgery tokens and TempData: `IDataProtector` encrypts and authenticates a payload, a purpose string isolates one consumer from another, and the key ring supplies the keys underneath."
category: "Application security"
related:
  - label: Key Ring
    slug: key-ring
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Secret Store
    slug: secret-store
  - label: Distributed Session
    slug: distributed-session
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Consumer APIs overview for ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/consumer-apis/overview?view=aspnetcore-10.0
---

## When to use

- Understand it because you are already using it. Cookie authentication, antiforgery tokens and TempData all protect their payloads through this stack whether or not anybody configured it, which means the questions that look like authentication bugs across replicas are usually questions about this API's keys. What you configure is where those keys are stored and how they are protected, and the Key Ring page is where that decision lives.
- Reach for `IDataProtector` when your own code has a short-lived value that must go out and come back unchanged. An email confirmation token, an unsubscribe link, a state parameter round-tripped through a redirect: protect it on the way out, unprotect it on the way in, and a tampered value fails to unprotect rather than quietly decoding into something else.
- Use the purpose string to keep consumers from reading each other's payloads. `CreateProtector("Contoso.EmailConfirmation")` derives a distinct key from the same ring, so a token minted for email confirmation cannot be unprotected by the password reset protector even though both run in the same application with the same keys. That isolation is free, and skipping it is how one feature's token becomes another feature's forged input.
- Take the time-limited variant when the payload should expire on its own. `ToTimeLimitedDataProtector` embeds an expiry in the protected value, so an expired token fails on unprotect without any storage of your own to check against, which is exactly the shape of a password reset link.

## Cautions

- This is not long-term encryption, and treating it as such loses data. Expired keys stay in the ring and still unprotect, but the framework promises nothing beyond that: a revoked key, a deleted key file, a lost ring or a changed application name all make a payload from last year unreadable, and none of them is a bug. Anything that must still be decryptable after one of those events belongs in a purpose-built encryption scheme with a key lifecycle you control.
- Protection is encryption plus integrity, not a public signature. The payload is unreadable and tamper-evident to anyone without the key ring, but only holders of that ring can verify it, so it cannot prove authorship to a third party. If another party has to verify the value without your keys, that is a signature problem rather than a protection one.
- The purpose string is a contract, and changing it invalidates every existing payload. Rename `"EmailConfirmation"` to `"Email.Confirmation"` and every link already in a user's inbox stops unprotecting. Choose the strings deliberately, keep them as constants rather than as inline literals, and treat a change to one as a migration rather than as a tidy-up.
- Multiple instances need a shared key ring before any of this holds. A payload protected by one replica is meaningless to a replica with a different ring, and the default in a container is a ring that dies with the process. Configuring persistence and the application name is the prerequisite for everything above, and the Key Ring page covers how.

## In .NET

- Inject `IDataProtectionProvider`, create a protector with a purpose, and keep the two calls symmetric. `Unprotect` throws on a tampered or expired payload, so the catch is part of the API rather than defensive noise.

```csharp
public sealed class EmailConfirmationTokens(IDataProtectionProvider provider)
{
    // The purpose is a contract: change this string and every issued token dies.
    private readonly ITimeLimitedDataProtector protector =
        provider.CreateProtector("Contoso.Web.EmailConfirmation").ToTimeLimitedDataProtector();

    // The expiry travels inside the payload; there is no table to check.
    public string Issue(Guid userId) =>
        protector.Protect(userId.ToString(), TimeSpan.FromHours(24));

    public bool TryRead(string token, out Guid userId)
    {
        userId = default;
        try
        {
            // Tampered, expired, or protected for a different purpose: all throw here.
            return Guid.TryParse(protector.Unprotect(token), out userId);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }
}
```

- The framework's own consumers do exactly this. Cookie authentication creates a protector with its own purpose chain and protects the ticket with it, which is why a cookie issued by one application cannot be read by another that happens to share the storage but not the application name.
- Purposes can be nested for finer isolation. `CreateProtector("Contoso.Web.EmailConfirmation", tenantId)` derives a per-tenant key from the same ring, so a token from one tenant fails to unprotect for another without a second key store or a second configuration.
- Use `IPersistedDataProtector` only when you understand what you are asking for. Its `DangerousUnprotect` with `ignoreRevocationErrors` allows unprotecting with a *revoked* key — an expired one needs no special handling, since ordinary `Unprotect` still accepts it — and it is a recovery tool for a specific migration rather than a way around the caution above; reaching for it routinely means the payload was never a transient one.
