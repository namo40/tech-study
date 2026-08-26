---
title: "ID Token"
summary: "An ID token is the authorization server's signed statement that a particular user signed in, at a particular time, in answer to a particular request. It is proof of authentication for the client that asked for it, and it is not a credential for calling an API."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Authentication
    slug: authentication
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

The `/token` exchange in the first step hands back more than the access token. When the app asked for the `openid` scope it also gets an ID token, and the two are not interchangeable. The access token answers "what may this call do", and the app never has to understand it. The ID token answers "who just signed in, and did they really", and it exists to be read and checked by the app itself.

That is what OpenID Connect added to OAuth 2.0. OAuth on its own is a delegation protocol: it can get an app permission to call an API without saying anything trustworthy about the person behind it. Trying to infer a login from a successful token response is a known mistake, because an access token can be obtained in ways that have nothing to do with this user at this moment. The ID token closes that gap with a signed statement whose claims are about the sign-in itself: `sub` for the stable user identifier, `iss` for who is vouching, `aud` for which client the statement was made to, `iat` and `exp` for when, `auth_time` for when the user actually authenticated, and `nonce` for which request this answers.

Validating it is the whole point, so do all of it: verify the signature against the issuer's published keys, check `iss` and that `aud` is your own client id, check that it has not expired, and check that `nonce` matches the value you generated for this login. The `nonce` check is what stops an ID token that was minted for some other session from being replayed into yours. In ASP.NET Core the OpenID Connect handler does every one of these for you, which is the strongest reason to use the handler rather than to hand-roll the flow.

Once it has been validated, the ID token has done its job. The usual pattern is to turn its claims into the local session and then leave it alone: sign in a cookie, keep `sub` as the account key, and store the display name or email if you need them. Do not send the ID token to an API, and do not accept one at an API. Its audience is the client, not the service, so an API that accepts it is accepting a token minted for somebody else's ears, and the safety of the whole arrangement rests on that distinction.

The one thing to plan for is what the ID token does not contain. It is a snapshot of a login, not a user profile and not an authorization decision. Roles that change during a session, permissions that depend on the resource, and profile fields that are edited elsewhere all belong outside it: the userinfo endpoint, your own database, or a claims transformation that runs when the session is created and refreshed on a schedule you control.
