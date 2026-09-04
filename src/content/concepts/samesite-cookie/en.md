---
title: "SameSite Cookie"
summary: "SameSite is the attribute that tells the browser whether a cookie may travel on a request started by another site. Lax keeps it off everything except top-level navigations, Strict keeps it off those too, and None puts it back on everything and demands Secure in return."
category: "Application security"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

In the fourth step of the scene, the same forged `POST` is sent twice and the second one never reaches the server. Nothing about the server's CORS policy changed between the two; what changed is that the session cookie is now declared `SameSite=Lax`, so the browser stops attaching it to a request started by another site. The request arrives with nothing to identify a user, and the endpoint turns it away at the door. That is the difference between hiding an answer and not making the call in the first place.

The attribute has three values. `Strict` means the cookie goes only on requests where the site being asked and the site doing the asking are the same, which includes not being attached when a user follows a link to you from somewhere else, so the first page after that link looks logged out. `Lax` relaxes exactly one case: a top-level navigation with a safe method, which is the ordinary link click, so the user arrives logged in but a cross-site `POST`, `fetch`, image, iframe or form submission still carries nothing. `None` restores the old behaviour of attaching the cookie everywhere, and browsers only accept it together with `Secure`, so it cannot be sent over plain HTTP.

"Same site" is not "same origin", and the difference matters when you draw the boxes. Sites are compared by registrable domain, so `app.example.com` and `api.example.com` are the same site and `Lax` will happily attach a cookie between them, while `shop.example` and `api.example` are different sites and it will not. Scheme counts too in the specification's definition of a site, so an `http` page calling an `https` one is cross-site. This is why a front end and an API placed under one parent domain can keep cookie sessions with `Lax`, and a front end on a genuinely separate domain has to choose between `None` plus every other defence, or dropping cookies for a token it sends explicitly.

Chromium-based browsers treat a missing attribute as `Lax`, in a more permissive form that still allows a `POST` within two minutes of the cookie being set, and not every browser does the same — which is the strongest reason to write the value down: defaults have moved before, clients differ, and an explicit value is a decision a reader can see. Set the value deliberately for each cookie rather than globally. A session cookie usually wants `Lax`; a cookie an embedded widget or a payment redirect needs in a third-party context has to be `None` and `Secure`, and then it needs an antiforgery token doing the work `SameSite` was going to do.

In ASP.NET Core the value is on the cookie builder for each feature: `options.Cookie.SameSite = SameSiteMode.Lax` on the cookie authentication handler, the same on `AddAntiforgery`, and `SameSiteMode.Lax` on the session cookie. `SameSiteMode.None` has to be paired with `CookieSecurePolicy.Always` by you — nothing in the framework checks, and a `None` cookie that goes out without `Secure` is one the browser discards — and `SameSiteMode.Unspecified` omits the attribute entirely rather than choosing for you. Treat it as one layer: it removes the ambient credential from cross-site requests, and antiforgery tokens and origin checks still have to cover what it does not.
