---
title: "Authorization Code"
summary: "The authorization code flow is how an app gets tokens without ever seeing the user's password. The browser is sent to the authorization server to log in and comes back carrying a one-time code, and the app trades that code for tokens on a back channel the browser never touches."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authorization-code
steps:
  - title: "The dance"
    text: "The app sends the browser to the authorization server to log in. The server sends it back with a short-lived code. The app trades the code for tokens over a channel the browser never touches, then calls the API with the access token."
  - title: "Why a code"
    text: "Anything through the browser can leak: URLs, history, referrers, logs. So the front channel carries only a code: single-use, worthless without the app's secret. A token there would land where the code did, so tokens use the back channel only."
  - title: "PKCE"
    text: "A browser or mobile app cannot keep a secret. So it invents one per login: a random verifier, sent as a hash when asking for the code and in clear when redeeming it. A stolen code without the verifier is useless."
  - title: "Short tokens, rotating refresh"
    text: "Access tokens live minutes; when one expires the API says 401 and the app redeems the refresh token for a new pair. Each refresh token works once. Reusing an old one is a sign of theft, and the server revokes the whole family."
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: CORS
    slug: cors
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: "Proof Key for Code Exchange (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
---

## When to use

- Any app where a user signs in through an identity provider: server-rendered web apps with a client secret, single-page apps and mobile apps with PKCE instead.
- Whenever you need an access token to call an API on the user's behalf, rather than as yourself. Machine-to-machine calls with no user in the picture use the client credentials flow, which needs no browser and no code.
- When you want the password to be seen only by the identity provider. The app never receives it, so a compromise of the app is not a compromise of the account.

## Cautions

- Always use PKCE, even when the client has a secret. The implicit flow and the password grant are obsolete; do not add them to a new design, and plan to remove them from an old one.
- Register exact redirect URIs and match them exactly. A wildcard, a loose prefix match or an open redirect anywhere on the registered origin turns the code into a gift for whoever can reach it.
- Validate `state` on the way back, and `nonce` in the ID token when you are doing OpenID Connect. `state` binds the response to the request this browser made; `nonce` binds the ID token to that same request.
- Keep access tokens short-lived and rotate refresh tokens. Treat a reused refresh token as a compromise: revoke the whole family rather than only the token that was replayed.
- Store tokens where the browser cannot read them. For a server-rendered app that means the session or a server-side token store; putting a token in `localStorage` hands it to any script that gets injected.
- Do not send the ID token to your API. It says who signed in, and it is for the client that asked for it; the API wants the access token and its audience check.

## In .NET

An ASP.NET Core web app signs the user in with a cookie handler for the session and an OpenID Connect handler for the flow. With `ResponseType = Code` set, as below, `AddOpenIdConnect` runs the code flow, validates `state` and `nonce`, and turns PKCE on by default; the handler's own default response type is `id_token`, so the code flow is something you ask for rather than something you get.

```csharp
// Web app: sign the user in with the authorization code flow.
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie()
.AddOpenIdConnect(options =>
{
    options.Authority = "https://login.example.com";
    options.ClientId = "shop-web";
    options.ClientSecret = builder.Configuration["Oidc:ClientSecret"];   // absent for public clients
    options.ResponseType = OpenIdConnectResponseType.Code;
    options.UsePkce = true;
    options.SaveTokens = true;                                          // tokens ride in the auth cookie
    options.Scope.Add("openid");
    options.Scope.Add("profile");
    options.Scope.Add("offline_access");                                // ask for a refresh token
    options.Scope.Add("shop.api");
});

// API: accept the access token, and check it was minted for this audience.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        options.Audience = "shop.api";
    });
```

`SaveTokens = true` puts the tokens in the authentication ticket's properties, and that ticket travels inside the encrypted authentication cookie: script cannot read them, but the cookie grows, which is why the option is off by default. To keep the ticket on the server and send the browser only a key, set `options.SessionStore` on the cookie handler. Renewal is not automatic: either call `/token` with the refresh token yourself when the access token is close to expiring, or use a token management library that does it for you and writes the new pair back into the session.

A single-page app or a mobile app has no secret to keep, so it registers as a public client and relies on PKCE. In a SPA, prefer a backend-for-frontend: the server completes the flow, holds the tokens, and gives the browser nothing but a cookie for its own origin.
