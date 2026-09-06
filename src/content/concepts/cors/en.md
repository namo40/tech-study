---
title: "CORS"
summary: "CORS is the browser asking a server whether a page from another origin may read its response. The request usually still reaches the server, and what CORS controls is whether the page gets to see the answer, which is why it is not a security boundary for anything that is not a browser."
category: "Application security"
level: 4
scene: cors
steps:
  - title: "Request out, answer blocked"
    text: "A page on shop.example calls its own origin — no permission needed — then calls api.example, and the server handles that one twice. The browser drops the response both times because the server never said this origin may read it."
  - title: "Allow it, precisely"
    text: "The server names the origins that may read it, and the browser lets those responses through. A wildcard is fine for public data, but never together with cookies."
  - title: "Preflight"
    text: "For anything beyond a simple GET or form post, the browser first asks with OPTIONS which methods and headers are allowed, caches the answer, and only then sends the real request. A method the server did not list never leaves the browser."
  - title: "Not a security boundary"
    text: "A server, a script, or curl never sees the browser's gate. A malicious page can still make the browser send your cookies to the API; CORS only hides the answer. SameSite keeps the cookie off the request; the antiforgery token refuses it."
related:
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Authorization Code
    slug: authorization-code
  - label: API Gateway
    slug: api-gateway
references:
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Fetch Standard, CORS protocol"
    url: https://fetch.spec.whatwg.org/#http-cors-protocol
---

## When to use

- A browser page on one origin needs to read responses from an API on another origin: a single-page app calling its own API on a different host, a widget embedded on a customer's site, a front end split across subdomains.
- Any public API consumed by third-party web apps. Without CORS headers those apps can call you and get nothing back, which looks to their developers like your API is broken.
- Whenever a browser is the client. Server-to-server calls, background jobs, mobile apps and command-line tools do not consult CORS at all, so adding headers for them changes nothing.

## Cautions

- CORS does not stop requests from reaching the server; it stops the page from reading the response. Protect state-changing endpoints with SameSite cookies and antiforgery tokens, not with CORS.
- Never combine `Access-Control-Allow-Origin: *` with credentials; list exact origins. A wildcard is the browser's signal that the data is public, and it refuses to pair that with a cookie or an `Authorization` header.
- Do not reflect the `Origin` header back without checking it against a list. A reflected origin with `Allow-Credentials: true` is an open door for every site on the internet.
- Preflights cost a round trip; set `Access-Control-Max-Age` and keep custom headers to a minimum. Staying inside the simple set of methods and content types avoids the question entirely.
- Put `UseCors` after routing and before authentication and authorization so preflights are answered before auth rejects them. An `OPTIONS` request carries no credentials, so an authorization filter that runs first will turn it away and the real request will never be sent.
- Do not "fix" CORS by proxying everything through your own origin without understanding what you just exposed. A proxy makes every call same-origin, which means the browser stops checking anything at all.

## In .NET

ASP.NET Core builds CORS as a named policy and applies it as middleware, and the antiforgery services are configured next to it because the two answer different halves of the same question.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("shop", policy => policy
        .WithOrigins("https://shop.example")
        .WithMethods("GET", "PUT")
        .WithHeaders("Content-Type", "Authorization")
        .AllowCredentials()
        .SetPreflightMaxAge(TimeSpan.FromHours(1)));
});
builder.Services.AddAntiforgery(options => options.Cookie.SameSite = SameSiteMode.Lax);

var app = builder.Build();
app.UseRouting();
app.UseCors("shop");          // after routing, before auth
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPut("/orders/{id:int}", UpdateOrder).RequireCors("shop").RequireAuthorization();
```

`WithOrigins` takes exact origins including the scheme and any non-default port, and it compares them as strings, so `https://shop.example` and `https://shop.example/` are not the same value. `AllowAnyOrigin` and `AllowCredentials` throw when combined, which is the framework refusing to write a header the browser would reject anyway. If you need to accept a family of origins, use `SetIsOriginAllowed` with a predicate you wrote, and make it a check rather than an echo.

Server-to-server calls and mobile apps never see any of this, so authorization has to be done separately with tokens and policies. A background service calling the same `PUT /orders/{id}` gets no CORS treatment and no antiforgery check either, and the only thing standing between it and the endpoint is `RequireAuthorization`. Treat CORS as a browser convenience layered on top of real authorization, never as the authorization itself.
