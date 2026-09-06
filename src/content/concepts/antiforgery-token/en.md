---
title: "Antiforgery Token"
summary: "An antiforgery token is a value the server puts in the page and expects back with the next state-changing request, paired with a second half kept in a cookie of its own. A forged page can make the browser send cookies, but it cannot read your page, so it cannot echo the half that has to match."
category: "Application security"
level: 6
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Origin Validation
    slug: origin-validation
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "IAntiforgery Interface"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.antiforgery.iantiforgery
  - title: "Authentication and authorization in minimal APIs"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/security?view=aspnetcore-10.0
---

The fourth step of the scene puts a chip in the form and a gate on the server, and from then on a submission that echoes the token passes while one that cannot is refused with `400`. The refused one in the scene is not the forged request — that arrives with no cookie at all and is turned away as unauthenticated long before the token is asked for. It is an honest submission from a page the browser rendered before the token existed, and it arrives carrying the same session cookie as the one that passed. The server still tells them apart, which is worth being precise about because it is the one thing SameSite cannot do on its own.

The token is a pair, not a value. The server generates two related halves: one is written into a cookie of its own, and the other is rendered into the page, usually as a hidden form field and sometimes handed to script for a request header. A valid submission returns both, and validation passes only when the two agree. The browser sends the cookie half automatically to anybody who asks, exactly as it sends the session cookie, so that half alone proves nothing. The other half has to be read out of the page, and the same-origin policy is what stops a page on another site from reading yours. That asymmetry is the whole mechanism: cookies are attached by destination, page content is readable only by origin, and the token requires both.

Two properties follow from the shape and are worth holding on to. The token has to be bound to the user, not just to the session, or a token minted for an anonymous visitor stays valid after they sign in and a fixation-style attack comes back through the side door; ASP.NET Core binds it to the authenticated user's identity for this reason, which is also why a token rendered before sign-in stops working after it. And the token has to be unpredictable, which means a cryptographically random value from the framework rather than anything derived from the session id, the user id or the clock.

The failure modes are boring and common, which is what makes them worth listing. A cached page carries a stale token and every submission fails until the user reloads; the framework already sets `Cache-Control: no-cache, no-store` on the response that renders a token, so this one shows up when a CDN or an output cache overrides it. A single-page app that never renders a form has to fetch a token and put it in a header, and the header name has to be one the server was configured to read. A form posted after the session expired fails validation rather than redirecting to sign-in, and the fix is a handler that recognises the antiforgery exception and sends the user somewhere sensible instead of a bare `400`. And a token rendered on one server and validated on another fails unless the data protection key ring is shared, which is the same key ring the authentication cookie depends on and shows up as intermittent failures behind a load balancer.

There is also a case where the token is the wrong tool, and reaching for it there causes more trouble than it prevents. An API authenticated with a bearer token has no forgery problem to solve: the browser does not attach an `Authorization` header on its own, so a page on another site cannot cause an authenticated request in the first place. Adding antiforgery to such an endpoint buys nothing and breaks every non-browser client. The rule is that antiforgery belongs wherever the credential is attached automatically, which in practice means cookies.

In ASP.NET Core the pieces are small. `AddAntiforgery` configures the cookie and the header name; the form tag helper writes the hidden field into any form with a method of POST; `[ValidateAntiForgeryToken]` validates one action and `[AutoValidateAntiforgeryToken]` applied globally validates every unsafe method, which is the shape that survives new endpoints being added by people who have not read this page. Minimal APIs get the same from `UseAntiforgery` for endpoints that bind form data, which carry the antiforgery metadata by default; an endpoint that reads a JSON body is not covered until it opts in with that metadata or calls `ValidateRequestAsync` itself. Place the middleware after authentication so the token can be bound to the user who is signed in. For anything hand-rolled, `IAntiforgery.GetAndStoreTokens` produces the pair and `ValidateRequestAsync` checks it, throwing rather than returning false so that a forgotten `await` cannot silently pass a request through.

Finally, keep the layering straight. `SameSite=Lax` stops most forged requests before they leave the browser, the antiforgery token catches the ones the SameSite rule still permits, and an origin check catches what neither did. The token is the middle layer and the only one that works entirely inside your own application, which makes it the one you can be certain is deployed.
