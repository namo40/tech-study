---
title: "OpenID Connect"
summary: "A thin identity layer on top of OAuth 2.0. Asking for the openid scope adds an ID token beside the access token: a signed statement about who signed in, addressed to the app rather than to any API."
category: "Authentication and authorization"
tags: ["oauth"]
scene: oauth-2-0
sceneStep: 4
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: ID Token
    slug: id-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "OpenID Connect Core 1.0"
    url: https://openid.net/specs/openid-connect-core-1_0.html
---

The fourth step of the scene adds one word to the request and one card to the wallet. The word is `openid`, the card is the `id` token, and the reason both exist is that OAuth 2.0 answers a question nobody asked when they said "let users log in with this". OAuth answers "may this app do this thing". It has no opinion about who the person is, and the access token it hands back is deliberately opaque to the app that holds it.

That gap was filled badly for years before OpenID Connect standardized it. Applications would take an access token, call whatever profile endpoint the provider happened to offer, and treat a successful response as proof of a login. It works right up until the token came from somewhere else. An access token is a bearer credential minted for an API, and an app that infers "this user is signed in" from the fact that a token worked has just accepted anybody's token as anybody's identity. The vulnerability has a name and a long history, and the fix is structural rather than careful: identity has to arrive in a token addressed to the app itself.

That is what an ID token is. It is a JWT, signed by the issuer, whose `aud` is the client ID of the app and whose claims describe the sign-in: `sub` for the stable identifier of the user, `iss` for who is asserting it, `iat` and `exp` for when, `nonce` to bind it to the request the app started, and whatever profile claims the scopes asked for. The app validates it once, at sign-in, and then it is finished with it. There is no renewal, no long life, and no reason to keep it around, because it is a statement about a moment rather than a key to anything.

The rule that follows is the one the scene holds up, and it is worth being absolute about: an ID token never goes to an API, and an API never reads identity out of an access token's raw contents without validating it as its own. Each token is signed for a specific audience. Sending the ID token to your API means presenting a credential minted for a different recipient, and an API that accepts it has disabled the check that makes audiences mean anything. If the API needs to know who the user is, that belongs in the access token as claims the authorization server put there, validated by the API against its own `aud`.

The three scopes worth knowing are small and do different jobs. `openid` is what turns an OAuth request into an OpenID Connect one and is what produces the ID token at all. `profile` and `email` add claims about the person. `offline_access` is unrelated to identity and is what asks for a refresh token, which is why it appears in the sign-in configuration next to the others despite belonging to the other half of the protocol.

In .NET the handler does the work, and the shape of what it does is the point. `AddOpenIdConnect` runs the authorization code flow with PKCE, validates the ID token against the discovery document's keys, checks issuer, audience, lifetime and nonce, and then hands the result to `AddCookie`, which turns it into a session. The ID token is consumed and discarded; what survives is a `ClaimsPrincipal` and a cookie. That is the correct division and the one most sign-in bugs come from missing: the ID token establishes the session, the access token calls the API, and the two are never substituted for each other. A `[Authorize]` attribute on a page is asking about the cookie, and a `[Authorize]` policy on an API endpoint is asking about the access token, and it is worth knowing which one you are looking at.

One last distinction saves a lot of confusion later. OpenID Connect tells you a login happened; it does not manage what happens after. Session lifetime, idle timeout, sign-out across applications, and forced re-authentication for a sensitive action are all your application's decisions, made with the cookie and with the `prompt` and `max_age` parameters when you need the provider to prove the user is still there. Treating the ID token's `exp` as a session expiry is the same category error as building login state out of access tokens: a token's lifetime describes the token, not the relationship.
