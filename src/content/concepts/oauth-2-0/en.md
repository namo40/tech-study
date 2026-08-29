---
title: "OAuth 2.0"
summary: "OAuth 2.0 replaces handing over your password with delegated, scoped, expiring tokens. The app gets a key that opens one door for a while, rotation turns a stolen token into a detectable event, and OpenID Connect adds the answer to \"who are you\" on top."
category: "Authentication and authorization"
tags: ["oauth"]
scene: oauth-2-0
steps:
  - title: "Don't hand over the key to your whole house"
    text: "The old way, the app asks for your password and holds the power to do anything, forever, as you. OAuth replaces that with delegation: you approve, the server issues a key that opens one door for a while, and the app never sees your password."
  - title: "The code is a receipt; the token is the key"
    text: "The app sends you to the authorization server, you consent, and a one-time code comes back. The app exchanges it for an access token scoped to read, short-lived on purpose, plus a refresh token for later. The API checks the token, not the person."
  - title: "Expiry is the design, and rotation is the alarm"
    text: "The access token dies, the API says 401, and the refresh token quietly buys a new one, plus a new refresh token, because each one works exactly once. When a stolen old refresh token is replayed, the server notices the reuse and revokes the whole family. Theft becomes loud instead of permanent."
  - title: 'OAuth answers "what may it do"; OpenID Connect answers "who are you"'
    text: "Signing in again, the app asks for the openid scope, and an ID token arrives next to the access token: a signed statement about identity, for the app to read, never to send to APIs. Two questions, two tokens, and now both have an answer."
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Key Rotation
    slug: key-rotation
references:
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "Refresh tokens in the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

## When to use

OAuth 2.0 is a delegation protocol. It exists for one situation, and once you can recognize that situation the rest of the design follows from it: some piece of software needs to act on a person's behalf, against a resource that person owns, without becoming that person.

- An app calls an API for a user. A calendar tool that reads your meetings, a photo printer that fetches your album, an internal dashboard that queries an order service as the signed-in employee. The app needs access, not identity, and it needs a bounded amount of it.
- A first-party single page app or mobile app talks to your own API. It is still delegation, because the browser or the phone cannot keep a secret; authorization code with PKCE is the flow, and the reason is that the code has to be useless to anyone who copies it out of a URL.
- A server-rendered web app signs users in and then calls APIs. Authorization code without PKCE is acceptable when the app really can hold a client secret, and even then PKCE costs nothing and closes an injection hole.
- Two services talk with no user in the picture at all. Client credentials is OAuth without the delegation half: the token says which service is calling, and the scopes say what that service may do. It is the right flow precisely because there is nobody to consent.
- Anywhere the alternative would be storing somebody's password. If a design document contains the phrase "we'll need their credentials", that is the moment OAuth is the answer, whether or not anybody has said the word yet.

The one case it is not for is a plain login to your own application with no API in between. OAuth answers "may this app do this thing"; a session cookie answers "is this the same browser as a minute ago". Reaching for tokens because they feel modern is how a simple sign-in ends up with a token cache, a refresh loop, and worse security than a cookie would have given.

## Cautions

- Tokens are bearer instruments. Whoever holds one is you, to the API, until it expires. That single sentence generates most of the rules: short lifetimes, TLS on every hop, never in a URL or a log line or an analytics payload, never in `localStorage` if a cross-site scripting bug can reach it.
- An access token is not a session. It has an expiry, but no logout, no idle timeout, no revocation you can count on before it expires. Building your application's login state out of access tokens gives you a session with none of a session's controls.
- Never send ID tokens to APIs, and never read identity out of an access token. The ID token is addressed to the app, the access token is addressed to the API, and each is signed for its own audience. An API that accepts an ID token is accepting a token minted for a different recipient, which is exactly the confusion `aud` validation exists to prevent.
- Refresh tokens need rotation and reuse detection. Without them, a stolen refresh token is silent and permanent access. With them, the second use of a spent token is a signal, and the correct response is to revoke the whole family rather than the one token.
- Scopes are coarse permissions, not your authorization model. `orders.read` is a gate at the edge; whether this user may read *this* order is a question only your domain can answer. Treating scopes as the whole answer produces APIs that are wide open to any caller who got past the gate.
- Validate every token on every call. Signature against the issuer's published keys, `iss`, `aud`, `exp`, and `nbf`. A token that is merely well formed is not a token that was issued to you, and skipping audience validation is the difference between authorization and decoration.
- Redirect URIs are part of the security model. Exact-match registration, no wildcards, no open redirectors anywhere on the domain. The authorization code is delivered to that URI and to nothing else, which is only true if the server refuses to improvise.
- Consent is not a formality. The scopes you ask for are what the user is agreeing to; asking for more than you need makes the consent screen frightening, the grant harder to justify, and the eventual breach worse.

## In .NET

For an API, the job is validation. `Microsoft.AspNetCore.Authentication.JwtBearer` fetches the issuer's signing keys from its discovery document, checks the signature, and enforces the parameters you name.

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            // The audience check is the one that stops a token minted for
            // somebody else's API from working against yours.
            ValidateAudience = true,
            ValidAudiences = ["api://orders"],
            ValidateIssuer = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
```

Scopes become policies, so the coarse gate is declared once and the endpoints say which gate they sit behind.

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders.read", policy =>
        policy.RequireClaim("scp", "orders.read"));
});

app.MapGet("/orders/{id}", async (string id, ClaimsPrincipal user, IOrders orders) =>
{
    // The scope says the caller may read orders. Whether it may read THIS one
    // is a domain question, and it still has to be asked here.
    var order = await orders.FindAsync(id);
    return order is null || !order.BelongsTo(user.GetObjectId())
        ? Results.NotFound()
        : Results.Ok(order);
}).RequireAuthorization("orders.read");
```

For a web app that signs users in, the OpenID Connect handler runs the authorization code flow, and PKCE is on by default.

```csharp
builder.Services
    .AddAuthentication(OpenIdConnectDefaults.AuthenticationScheme)
    .AddOpenIdConnect(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.ClientId = configuration["Oidc:ClientId"];
        options.ClientSecret = configuration["Oidc:ClientSecret"];
        options.ResponseType = "code";           // never "token" or "id_token token"
        options.UsePkce = true;
        options.SaveTokens = true;
        options.Scope.Add("offline_access");     // this is what asks for a refresh token
        options.Scope.Add("api://orders/orders.read");
    })
    .AddCookie();                                // the ID token becomes a cookie session
```

The last line is the part worth pausing on. The handler does not leave you holding an ID token: it validates it once, turns it into a `ClaimsPrincipal`, and drops a cookie. From then on the app has a session, and the tokens are for calling APIs. That is the correct division, and it is the same one the fourth step of the scene draws.

Acquiring and caching access tokens is what Microsoft.Identity.Web is for. `ITokenAcquisition` holds the refresh token, redeems it when the cached access token is close to expiry, and handles rotation without the calling code knowing it happened.

```csharp
builder.Services
    .AddMicrosoftIdentityWebAppAuthentication(configuration)
    .EnableTokenAcquisitionToCallDownstreamApi(["api://orders/orders.read"])
    .AddDistributedTokenCaches();                // shared cache, so scale-out keeps the grant

public sealed class OrdersClient(ITokenAcquisition tokens, HttpClient http)
{
    public async Task<Order?> GetAsync(string id)
    {
        var token = await tokens.GetAccessTokenForUserAsync(["api://orders/orders.read"]);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await http.GetFromJsonAsync<Order>($"/orders/{id}");
    }
}
```

Two details decide whether this holds up in production. The token cache has to be distributed, or a scaled-out app loses its refresh tokens every time a request lands on a different instance and sends the user back through a sign-in they should never have seen. And the client credentials variant, `GetAccessTokenForAppAsync`, is a different grant with a different audience: reaching for it inside a request because the user token was awkward silently converts "acting for this user" into "acting as the whole service", which is the one substitution OAuth exists to prevent.
