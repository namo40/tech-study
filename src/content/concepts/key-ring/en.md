---
title: "Key Ring"
summary: "The key ring is the rotating set of keys ASP.NET Core Data Protection uses to protect cookies, antiforgery tokens and short-lived payloads: one key is current, the older ones stay for decryption, and every instance of the application has to be looking at the same ring."
category: "Application security"
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

## When to use

- Configure it deliberately the first time the application runs behind a load balancer. Cookie authentication, antiforgery tokens and TempData are all protected payloads, and a payload protected by one instance is unreadable to an instance holding a different ring. Two replicas without a shared ring means every second request looks unauthenticated.
- Read this page when the symptom is "it works on one machine and logs everybody out when we scale". That is almost never an authentication bug and almost always a key ring that lives in a container filesystem, a per-pod volume or memory, which is to say a ring per instance instead of a ring per application.
- Set it explicitly when a deployment must survive a restart. A ring that is regenerated on startup invalidates every cookie the previous process issued, so a rolling update signs users out as it rolls, and a crash loop signs them out repeatedly.
- Point several applications at one ring when they legitimately share protected data. A web front end and a background site that both read the same protected payload need the same storage and the same application name, because the name is part of what the protection is bound to.

## Cautions

- The container default is an ephemeral ring, and nothing warns you. With no configured persistence the keys go to a directory inside the writable layer or to memory, so they are lost on every restart and never shared between replicas. The application starts, logs a warning nobody reads, and works perfectly on the developer's single machine.
- The ring storage is itself a top-grade secret. Keys sitting unencrypted in a blob container are the whole authentication system in one file, so persistence and protection are two separate decisions: store the ring somewhere durable and shared, then encrypt it at rest with a key management service so that reading the blob is not the same as holding the keys.
- Data Protection is for transient payloads, not for archival encryption. Keys expire and are eventually removed, and anything encrypted with a key that has aged out becomes unreadable along with it. A field that must still be decryptable in three years belongs in a purpose-built encryption scheme with a key lifecycle you own.
- Rotation happens on its own, and old keys stay for a reason. The default lifetime is ninety days, after which a fresh key becomes the one used for new payloads, while previous keys remain in the ring so existing cookies keep working until they expire. Deleting old keys to tidy up is what turns a routine rotation into a mass sign-out.

## In .NET

- Persist the ring outside the instance and encrypt it where it lands. These two calls are the production configuration in full, and the application name is what lets a second application read the same payloads.

```csharp
builder.Services.AddDataProtection()
    // Shared and durable: every replica reads the same ring.
    .PersistKeysToAzureBlobStorage(blobUri, credential)
    // Encrypted at rest: reading the blob is not the same as holding the keys.
    .ProtectKeysWithAzureKeyVault(keyIdentifier, credential)
    // Part of the protection binding; changing it invalidates existing payloads.
    .SetApplicationName("contoso-web");
```

- Choose the storage that matches where the application runs. `PersistKeysToFileSystem` over a shared volume is the on-premises answer, blob storage is the cloud one, and a Redis or database-backed store fits when one already exists; what matters is that the location outlives the instance and is visible to all of them.
- `SetApplicationName` is a deliberate coupling, not boilerplate. Leaving it unset derives the name from the content root path, which changes between a local run and a container, and two applications that need to share payloads will silently fail to until both are given the same string.
- `SetDefaultKeyLifetime` changes the rotation interval and nothing else. Shortening it produces keys more often and leaves the expired ones available for decryption exactly as before, so the safe knob for a stricter policy is the lifetime rather than any attempt to remove keys by hand.
