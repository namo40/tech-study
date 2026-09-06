---
title: "Authentication"
summary: "Authentication is proving an identity claim: a claim plus evidence, verified fresh at the door — passwords with defenses for people, keys for machines, certificates for both sides — and the system is exactly as strong as the weakest evidence it accepts."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: authentication
steps:
  - title: "A claim is free; authentication is the evidence check"
    text: "A bare name costs nothing to say — the ghost walks straight past a door that only asks for one. Real authentication demands evidence and verifies it fresh: something you know, have, or are. The door stops being decoration the moment it checks."
  - title: "Evidence can be stolen, and the system is as strong as its weakest evidence"
    text: "The right password in the wrong hands passes the same check — the verifier sees evidence, not intent. That is why passwords travel with defenses around them rather than on their own. Verification is a door, not a vault."
  - title: "Machines have identities too, and no fingers to type passwords"
    text: "With nothing to show, the service is refused like anyone else. With a key — issued once, presented on every call, checked against a registry — it passes. Possession is the evidence, which is why a leaked key is an identity leak."
  - title: "mTLS makes the proof mutual: both sides show certificates"
    text: "So far only callers proved themselves — the server was taken on faith. With mutual TLS each side presents a certificate signed by an authority the other trusts, and the connection itself becomes the identity. No secret crosses the wire, and impersonating either end now requires stealing a private key, not overhearing one."
related:
  - label: Authorization
    slug: authorization
  - label: API Key
    slug: api-key
  - label: Mutual TLS
    slug: mutual-tls
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
references:
  - title: "Overview of ASP.NET Core authentication"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "What is Microsoft Entra authentication?"
    url: https://learn.microsoft.com/en-us/entra/identity/authentication/overview-authentication
---

## When to use

- On every endpoint whose answer depends on who is calling, as the first question. A public price list needs nobody's identity; an order history needs exactly one. The moment a response would differ per caller, something has to establish which caller this is, and it has to be established from evidence rather than from a header somebody typed.
- For signing people in. A password is the common first factor, and it comes with a whole apparatus that is not optional: an adaptive hash at rest, a session issued on success, a cookie that carries the session, a second factor for the operations that would hurt. The password is the smallest part of the design.
- For service-to-service calls, where nobody is present to type anything. A background worker, a webhook receiver, one microservice calling another: each of them needs an identity of its own, proved by something it holds — an API key, a client certificate, or a platform-issued token that removes the secret entirely.
- Before authorization ever runs. The two questions are separate and ordered: authentication produces an identity, authorization consumes it. A permission check against an identity nobody established is a permission check against a guess, which is what the first step of the scene is drawing.
- Wherever evidence crosses a network. Every method here reduces to sending something the other end can check, so the channel is part of the mechanism rather than a deployment detail. Evidence sent in the clear is evidence donated, and the strongest verifier in the world cannot fix a wire anybody can read.

## Cautions

- A successful login is not a permission. Authentication answers "who is this" and stops there; whether this caller may do this, to this thing, is a second decision with its own rules. Treating the first answer as the second is broken access control, and it is one of the most common serious findings in real applications.
- Never store passwords reversibly. Encryption is reversible by anybody who gets the key, and the key lives near the data. Use a salted, adaptive hash — PBKDF2, bcrypt, scrypt or Argon2 — sized so that verifying one password is cheap for your server and testing a billion is not for an attacker. Do not invent the scheme; use the one your framework ships.
- Rate-limit and lock on failure, or the verifier becomes an oracle. A door that answers instantly and forever will happily confirm a few million guesses, and if it distinguishes "no such user" from "wrong password" it will enumerate your accounts first. Slow down after a handful of failures, answer the same way for both cases, and log what happened.
- Reissue the session on login. If the identifier the browser is already holding survives sign-in, an attacker who planted that identifier is now signed in as the victim. Session fixation is closed by one rule: the session that carries an authenticated identity is never the session that existed before authentication.
- API keys are identities, so treat them as such. Scope each key to the smallest thing it needs, store it as a secret rather than in configuration you check in, keep it out of URLs and logs, and rotate it on a schedule you can survive. A leaked key is not a leaked password; it is a leaked account with nobody to notice.
- Do not roll your own token format, and do not skip the validation of somebody else's. A signature is only worth what the verification is: check the algorithm, the issuer, the audience and the expiry every time, and never accept an algorithm the token itself proposes.
- The weakest accepted method defines the system. A carefully built mTLS path plus a forgotten basic-auth endpoint left over from an integration is a system with basic auth. Enumerate every way in, including the ones the current team did not build, and delete the ones you are not defending.

## In .NET

ASP.NET Core splits authentication into schemes. A scheme is a named handler that knows how to read evidence out of a request and turn it into a `ClaimsPrincipal`; the default scheme is what runs when nothing else is asked for. Cookies for browsers and bearer tokens for APIs are the two ordinary cases, and an application can carry both. Only one of them can be the default, though, so the API endpoints have to name the other one: `[Authorize(AuthenticationSchemes = "api")]`, or a policy built with `AddAuthenticationSchemes("api")`.

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
        // An absolute eight hours: activity does not extend it, so every session
        // has an end somebody chose. Sliding expiration is the other reasonable
        // answer, and the Cookie Authentication page argues for it.
        options.SlidingExpiration = false;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
    })
    .AddJwtBearer("api", options =>
    {
        options.Authority = "https://login.example.com/";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidAudience = "orders-api",
            // Every one of these is checked on every request. A validator that
            // skips one of them is a signature check and nothing more.
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
        };
    });

app.UseAuthentication();
app.UseAuthorization();
```

Password storage is the part worth not writing. ASP.NET Core Identity ships a hasher with a current iteration count and a versioned format, so an upgrade re-hashes on the next successful sign-in instead of breaking every account.

```csharp
// SignInManager does the whole sequence: hash comparison, lockout counting,
// and a fresh session on success. The password never becomes a variable here.
var result = await signInManager.PasswordSignInAsync(
    userName, password, isPersistent: false, lockoutOnFailure: true);

if (result.RequiresTwoFactor) return Results.Redirect("/mfa");

// A lockout is not announced to the caller: a distinct answer would confirm
// which accounts exist, since only a real account can be locked. Log it, alert
// on it, and reply exactly as for a wrong password.
if (result.IsLockedOut) logger.LogWarning("Lockout on {UserName}", userName);
if (!result.Succeeded) return Results.Unauthorized();
```

Lockout is configuration rather than code, and it is the difference between a door and an oracle.

```csharp
builder.Services.Configure<IdentityOptions>(options =>
{
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.User.RequireUniqueEmail = true;
});
```

For the machine side, certificate authentication is a scheme like any other. The handshake happens in the server before the request reaches the pipeline, so the handler validates the chain and the revocation state of the certificate that already arrived, and then `OnCertificateValidated` asks the question only you can answer: whether this known-good certificate belongs to a caller you registered. Kestrel has to ask for a certificate in the first place, which is a transport setting rather than a scheme option — that side is on the Mutual TLS page.

```csharp
builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
        options.Events = new CertificateAuthenticationEvents
        {
            OnCertificateValidated = context =>
            {
                var thumbprint = context.ClientCertificate.Thumbprint;
                if (!registry.IsKnown(thumbprint))
                {
                    context.Fail("unknown client certificate");
                    return Task.CompletedTask;
                }

                context.Principal = registry.PrincipalFor(thumbprint);
                context.Success();
                return Task.CompletedTask;
            },
        };
    });
```

The best secret is the one that does not exist. On Azure, a managed identity gives the running workload a credential the platform issues and rotates, so the connection string holds a host name and nothing else.

```csharp
// No key in configuration, no key in the vault, no key to rotate.
var client = new BlobServiceClient(
    new Uri("https://contoso.blob.core.windows.net"),
    new DefaultAzureCredential());
```

Two habits are worth keeping. Put the identity in claims and read it from `ClaimsPrincipal` rather than from a parameter the caller supplied, because the whole point of the scheme was to stop trusting the caller about that. And return `401` when the caller has not proved who it is and `403` when it has and is still not allowed: the first invites a sign-in and the second does not, and mixing them up is how an authenticated user ends up in a login loop.
