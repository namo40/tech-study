---
title: "Cookie Authentication"
summary: "Cookie authentication signs a user in by setting a cookie the browser then attaches to every request for that site, automatically, whether the request came from your page or from someone else's. That automation is the convenience, and it is exactly what cross-site request forgery exploits."
category: "Authentication and authorization"
level: 5
scene: cookie-authentication
steps:
  - title: "Signed in by a cookie"
    text: "Log in once and the server sets a cookie; from then on the browser attaches it to every request for this site on its own. HttpOnly keeps scripts from reading it — the browser carries what the page cannot touch."
  - title: "Automatic means indiscriminate"
    text: "A page you never wrote submits a form to your site, and the browser attaches the cookie just the same. The server sees a signed-in request — it cannot tell your page from theirs. That is cross-site request forgery, and the cookie is the vehicle."
  - title: "SameSite draws the first line"
    text: "Mark the cookie Lax and it stops riding cross-site POSTs; the forged request arrives naked and fails. Top-level navigation still carries it — Strict closes even that door, at the cost of every inbound link starting signed out."
  - title: "The token only your page can echo"
    text: "The server hides an antiforgery token in the form; a real submission returns cookie and token together, a stale form that still lacks it gets a 400 of its own, and the forged POST arrives with neither. Layer it with SameSite and an origin check, so no one line has to hold alone."
related:
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
references:
  - title: "Use cookie authentication without ASP.NET Core Identity"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Set-Cookie"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
---

## When to use

- First-party browser apps, where the browser is the client. Server-rendered pages, Razor Pages, MVC, Blazor Server: the thing making the request is the same thing that stores the credential, so letting it carry the credential costs no code at all.
- A backend-for-frontend in front of a single-page app. The browser talks to the BFF with a cookie, the BFF talks to the APIs with a token, and the token never reaches JavaScript. The pattern exists because a cookie is the safer half of that pair.
- Anywhere a script must not be able to read the credential. `HttpOnly` is the property a token in `localStorage` cannot have, and it is the reason a cross-site scripting bug that would have exfiltrated a token merely gets to use the session while the page is open.
- Sessions that should survive a tab close, a reload, or a crash without the app writing storage code. Expiry, renewal and the size limit are the browser's problem, not yours.
- Sign-out that has to mean something. A cookie session backed by server state can be revoked on the spot, which a self-contained token cannot.

## Cautions

- Cookie authentication without a cross-site request forgery defence is an open door, and it is open by default. The browser attaches the cookie because the request went to your site, not because your page sent it. Assume every state-changing endpoint is reachable from a page you did not write.
- Set `SameSite=Lax` deliberately rather than relying on the browser default. Some browsers apply `Lax` when the attribute is absent and others do not, so a cookie written without it is at the mercy of what the user's browser decided this year, and older clients still default to `None`.
- `Lax` is not the whole answer. It holds the cookie back from a cross-site POST, but a top-level GET navigation still carries it, which means any endpoint that changes state on a GET is still forgeable. Never change state on a GET, and put an antiforgery token on the ones that do change state.
- `Strict` closes the navigation door too, and charges for it: a user arriving from a search result or an email link lands signed out, then signs in again on the next click. It is the right setting for a bank and the wrong one for a content site.
- `HttpOnly` and `Secure` always, and `__Host-` prefixes where you can. `HttpOnly` keeps the cookie out of `document.cookie`; `Secure` keeps it off plaintext connections; the `__Host-` prefix binds it to one exact host with no `Domain` attribute, which stops a compromised sibling subdomain writing a cookie your site will accept.
- Reissue the cookie at sign-in. Session fixation is the attack where somebody plants a known session identifier in the victim's browser before they log in and then rides the session they already know. Calling `SignInAsync` after authentication is what mints a new one.
- A long-lived cookie widens every window it touches. Sliding expiration keeps an active user signed in without giving an idle one an open-ended session; an absolute expiry on top of it puts a ceiling on how long a stolen cookie is worth anything.
- A cookie is only a browser credential. A mobile app, a daemon, a service calling your API from a datacentre: none of them have a cookie jar, and none of them are protected by SameSite. Those callers want a token, and mixing the two schemes on one endpoint means the endpoint is only as safe as its weakest one.
- Scale is a real constraint. A cookie holding an encrypted principal travels on every request, and browsers stop at about 4 KB each; ASP.NET Core works around that by splitting a larger one into chunks, which is more bytes on every request rather than fewer. The real answer for a large claims set is `SessionStore` — an `ITicketStore` that keeps the ticket server-side and leaves the cookie carrying only a key.

## In .NET

The scheme is registered once and the options are the whole security posture. Nothing below is a default worth leaving alone.

```csharp
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "__Host-session";
        options.Cookie.HttpOnly = true;                        // no script may read it
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;            // set it, never inherit it
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.LoginPath = "/signin";
        // An API call must get a status code, not a redirect to a login page.
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
```

`SignInAsync` is what mints the cookie, and calling it is what closes session fixation: whatever identifier the browser was holding before is replaced by one the server just created.

```csharp
var claims = new List<Claim>
{
    new(ClaimTypes.NameIdentifier, user.Id),
    new(ClaimTypes.Name, user.DisplayName),
};
var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

await HttpContext.SignInAsync(
    CookieAuthenticationDefaults.AuthenticationScheme,
    new ClaimsPrincipal(identity),
    new AuthenticationProperties { IsPersistent = rememberMe });
```

The antiforgery half is separate, and it is the half people forget. In MVC and Razor Pages a form tag helper writes the hidden field for you and `[ValidateAntiForgeryToken]` checks it; `[AutoValidateAntiforgeryToken]` applied globally is usually the better shape, because it validates every unsafe method and leaves GET alone rather than relying on somebody remembering the attribute on a new action.

```csharp
builder.Services.AddControllersWithViews(options =>
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
```

Minimal APIs get the same protection from the antiforgery middleware, which runs after authentication and validates every unsafe request to an endpoint that carries antiforgery metadata, which form-binding endpoints get automatically:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPost("/transfer", ([FromForm] TransferRequest request) => Results.Ok())
   .RequireAuthorization();
```

The binding is what earns the protection, so an endpoint that reads its body as JSON carries no such metadata and the middleware lets it through. For those — and for a fetch from a script that sends the token in a header — `IAntiforgery.ValidateRequestAsync` is the call, and `GetAndStoreTokens` is what hands the page a token to send back.

```csharp
app.MapGet("/antiforgery/token", (IAntiforgery antiforgery, HttpContext context) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { token = tokens.RequestToken });
});

app.MapPost("/api/transfer", async (IAntiforgery antiforgery, HttpContext context) =>
{
    await antiforgery.ValidateRequestAsync(context);   // throws when it does not match
    return Results.Ok();
});
```

The token is a pair, not a single value: one half is written into a cookie of its own and the other into the form or a header, and validation checks that the two match. That is why a forged page cannot produce it. It can make the browser send the session cookie, and it can make the browser send the antiforgery cookie, but it cannot read your page to learn what to put in the field, and the two halves have to agree.

Two more pieces belong to the same posture. `CookieAuthenticationEvents.OnValidatePrincipal` is where a session gets re-checked against the database mid-life — ASP.NET Core Identity wires `SecurityStampValidator` into it and paces the check with `ValidationInterval` — which is how a disabled account stops being able to use the cookie it already has. And the cookie is encrypted with a data protection key, so a farm of servers has to share a key ring — an unshared key ring shows up as users being signed out at random as requests land on different machines.
