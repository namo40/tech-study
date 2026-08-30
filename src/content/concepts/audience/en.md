---
title: "Audience"
summary: "The audience is the name a token is addressed to. Validating it is what stops a receiver from accepting proof that was minted for somebody else, which is the difference between a signature that is valid and a signature that is valid here."
category: "Authentication and authorization"
tags: ["oauth"]
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Issuer
    slug: issuer
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Least Privilege
    slug: least-privilege
  - label: Mutual TLS
    slug: mutual-tls
references:
  - title: Access token claims reference
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0
  - title: Workload identity federation
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
---

The third step of the scene turns on two names, and the second one is the interesting one. The cloud reads the issuer and decides the token came from a signer it has agreed to trust; that check passes for both tokens it is handed. Then it reads the audience, which says who the token was addressed to, and only one of the two says "me". The other one is refused on the spot even though it is perfectly genuine, and that refusal is the whole reason the check exists.

A signature only proves that the issuer wrote the token. It says nothing at all about who was supposed to receive it. Without the audience check, every service that trusts a given issuer will accept every token that issuer ever signed, which means any one of those services can take a token it was legitimately given and present it to any of the others. That is the confused deputy: a component with more reach than the caller, doing the caller's bidding with the caller's proof. The audience is what closes it, by making a token useful in exactly one place.

The mechanics are small. In a JWT the audience is the `aud` claim, and the receiver compares it against the identifier it knows itself by. In the OAuth flows the client asks for a token for a particular resource, and the authorization server writes that resource's identifier into `aud`. In workload identity federation the same rule runs one level up: the platform mints a token whose audience is the identity provider it is going to be exchanged at, so a token intended for one cloud cannot be replayed at another.

Three ways to get this wrong are worth naming. Turning the check off is the obvious one, and it is usually done to make an integration work on a Friday; the setting is `ValidateAudience = false`, and once it is in a configuration file nobody reads it again. Widening the accepted set is the quieter version: an API that accepts three audiences because three callers asked for tokens differently has three chances to be handed somebody else's proof. And accepting the wrong kind of identifier is the subtle one. Access tokens for your own API should carry your API's identifier, not a client id and not a graph endpoint; a receiver that accepts tokens minted for a different resource has effectively federated with that resource's audience without saying so.

In .NET the check belongs in `TokenValidationParameters`, next to the issuer, and it is worth writing out rather than inheriting.

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
    ValidateAudience = true,
    ValidAudience = "api://orders",   // one name, and it is mine
    ValidateLifetime = true,
};
```

When you are the one asking for a token rather than the one checking it, the audience is decided by the scope you request, so the same discipline applies from the other side: ask for a token for the resource you are about to call, and do not reuse it against a different one because it happens to be accepted.

The habit worth keeping is to read the two names as a sentence. "This was written by someone I trust" is authentication of the issuer. "This was written for me" is what makes it mine to act on. A system that checks only the first has decided that anything genuine is also addressed to it, and that is a decision nobody made on purpose.
