---
title: "Claims"
summary: "Claims are the key-value statements a token makes about who it is for, what it allows, and how long any of it is true. Validation is not a general reading of them: it is a fixed set of gates, each one comparing a named claim against something the API already knows."
category: "Authentication and authorization"
tags: ["oauth"]
scene: bearer-token
sceneStep: 2
related:
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Authorization
    slug: authorization
  - label: Token Revocation
    slug: token-revocation
  - label: Authorization Code
    slug: authorization-code
  - label: Refresh Token
    slug: refresh-token
references:
  - title: "JSON Web Token (RFC 7519), registered claim names"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Provide optional claims to your app
    url: https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims
  - title: ClaimsPrincipal
    url: https://learn.microsoft.com/en-us/dotnet/api/system.security.claims.claimsprincipal
---

The third step of the scene puts every request through the same short row of gates, and each gate is one claim being compared against one thing the API already knows. That is what validation is. It is not the API forming an opinion about the caller; it is four or five equality checks against values in configuration, which is why they are cheap enough to run on every call and local enough to need no network.

The gates come from the registered claims, and each one answers a different question. `iss` says who minted this, and it is checked against the issuer you decided to trust. `aud` says who it was minted for, and it is checked against this API's own identifier, which is what stops a perfectly valid token for the reporting API from opening the payments one. `exp` says when it stops being true, and `nbf` says when it starts, and both are compared against the clock with a small tolerance for drift. `sub` names the principal, and it is the one you should be storing when you record who did something, because it is stable in a way an email address or a display name is not.

Then there are the claims that carry authority rather than identity. `scope` says what the user agreed the app could do, and it is a coarse fence around the whole delegation: an app with `orders.read` cannot write orders no matter who is signed in. Roles and groups say what this principal is allowed to do, and they are a different axis entirely. Keeping the two apart matters, because a request needs both to be true and conflating them produces an API that either trusts an app with a user's permissions or refuses a user their own data because the app asked for too little.

Everything else is a design decision with a bill attached. Claims travel on every request, so each one you add is bytes on every call and a header size limit somewhere downstream that will eventually reject the whole thing. Group claims are the classic version of this: a directory that emits every group a user belongs to will, for some users, emit hundreds, and identity providers deal with it by replacing the list with a pointer you have to go and fetch, which is the round trip you were trying to avoid. Emit the few claims your authorization rules actually read, and look the rest up.

The other trap is staleness, and it is the same trade the whole format makes. A claim is a statement about the moment the token was minted, frozen for the token's lifetime. Remove someone from a group and their current token still says they are in it, until it expires. That is not a bug to work around with a lookup on every call, because a lookup on every call is the stateless design thrown away; it is a lifetime to choose deliberately, short enough that the stale window is one you can live with.

In .NET the whole of this arrives as a `ClaimsPrincipal` on `HttpContext.User`, and the individual statements come back through `User.FindFirst("scope")` or `User.FindFirstValue(ClaimTypes.NameIdentifier)`. Two details save time. The framework maps some short JWT claim names onto long WS-Federation URIs by default, so `sub` arrives as `nameidentifier` unless you set `MapInboundClaims = false` on the handler options — `JwtBearerOptions` for an API, `OpenIdConnectOptions` for a sign-in, both defaulting to true — and a name you expected to find missing is almost always this. And authorization belongs in a policy rather than in an `if`: a policy that requires a scope, or a claim with a given value, keeps the rule in one place and out of every handler that depends on it.
