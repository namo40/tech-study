---
title: "Cross-Site Request Forgery"
summary: "A cross-site request forgery is a page you did not write making your browser send an authenticated request to a site you are logged into. The browser attaches the cookie because the request goes to that site, not because the page asking for it belongs there, and the server runs the call before anyone has looked at where it came from."
category: "Application security"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
---

The fourth step of the scene is the whole attack in one move. The `evil.example` tab sends `POST /transfer` to `api.example`, the browser attaches the user's cookie because the cookie belongs to `api.example` and that is where the request is going, and the server runs it. The counter goes up. Only afterwards does the browser refuse to hand the response back to the page, and by then the money has moved. That gap between "the server did it" and "the page may not read the answer" is where every cross-site request forgery lives.

What makes it work is that the browser's credentials are ambient. A cookie is attached by destination, and a session that was established by a real login is indistinguishable, on the wire, from a session being ridden by a page the user never trusted. The attacking page does not need to read anything. A form that posts on load, an image tag pointing at a state-changing URL, or a `fetch` with `credentials: "include"` is enough, because the result was never the point: the side effect was.

CORS is not the defence, and the scene is deliberate about showing why. The gate only inspects the response, so a blocked response is a blocked *answer*, not a blocked request. Worse, the shapes that matter most are often simple requests, which get no preflight at all: a form-encoded `POST` leaves the browser without asking anyone's permission. Relying on `Access-Control-Allow-Origin` to keep strangers out is relying on a check that runs after the damage.

Four things actually stop it, and they stack. Declare session cookies `SameSite=Lax` or `Strict` so the browser does not attach them to a cross-site request in the first place; that alone removes the ambient credential this attack depends on. Require an antiforgery token on every state-changing endpoint, so a request has to carry a value only a page served by your own origin could have read. Validate the `Origin` header on state-changing requests as a cheap second check, and reject the ones that arrive without one. And never make a `GET` change anything, because a `GET` is the one shape an attacker can trigger with a bare image tag.

In ASP.NET Core, `AddAntiforgery` and `app.UseAntiforgery()` cover this for form posts and for minimal API endpoints that accept form data; Razor Pages and MVC views emit the hidden field automatically, and a JavaScript client reads the token from the antiforgery cookie and sends it back in a request header. A pure token API is a different case: an `Authorization: Bearer` header is not ambient, so nothing attaches it automatically and a forged request simply arrives unauthenticated. That is the real reason bearer tokens are said to be immune, and it stops being true the moment you decide to keep the token in a cookie for convenience.
