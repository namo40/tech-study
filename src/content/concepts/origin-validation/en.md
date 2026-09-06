---
title: "Origin Validation"
summary: "Origin validation is the server checking, on its own, which site a request was started from, by reading the Origin header the browser attaches and refusing anything that does not name a host it expects. It is the third line behind SameSite and an antiforgery token, and it fails in a different way from both."
category: "Application security"
level: 5
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Origin"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
  - title: "Referer"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

The fourth step of the scene lights a third gate after `SameSite` and `token`, and the summary beside it says all three hold. The obvious question is why a third one is worth the trouble when the first two already stopped the forged request. The answer is that the three fail differently, and defence in depth is only real when the layers do not share a failure.

`SameSite` lives in the browser, so it fails when the browser is old, when the cookie was written without the attribute, or when the request is one the rule still permits — a top-level GET navigation under `Lax` being the case the scene shows. An antiforgery token lives in your application, so it fails when a new endpoint forgets the attribute, when a form is rendered by something outside the framework's knowledge, or when a token is cached along with a page and served to somebody else. Origin validation lives in the server and reads a header the page cannot set, so it survives all of that; what it fails on is a caller with no `Origin` header at all.

The mechanics are short. Browsers attach `Origin` to every cross-origin request and to every request with an unsafe method, including same-origin POSTs, and the value is a scheme, host and port only, with no path — deliberately, so that sending it leaks nothing about which page the user was on. It can also be the literal `null`, which a cross-origin redirect or a sandboxed iframe produces; treat that as a foreign origin rather than as a missing one. `Origin` is on the forbidden header list, which means script cannot set or change it: a page can send whatever body it likes, but the browser writes this one. That is the whole property the check rests on.

So the rule is: for every state-changing request, read `Origin`, compare it against the set of origins you serve, and refuse anything else. Compare full origins, never a substring — `https://your-site.example.evil.example` starts with your host under a naive `StartsWith`, and `https://evil-your-site.example` contains it. Parse the header as a URI and compare scheme, host and port for exact equality against an allow list.

The gap is a request with no `Origin` at all. Older browsers omitted it on same-origin requests, and non-browser callers such as `curl` or a service-to-service client never send it. `Referer` is the traditional fallback and works the same way, comparing only its origin part, but users and proxies do strip it. There are three honest ways to handle a missing header, and which one is right depends on the endpoint: refuse outright, which is safest and breaks the callers that have no browser; fall back to `Referer` and refuse only when both are missing; or accept the absence but require a credential that a browser would not attach automatically, such as a bearer token, which is exactly the case where forgery is not the threat. What is never right is treating a missing `Origin` as a pass on an endpoint that a cookie can authenticate, because that turns the check into one an attacker only has to avoid triggering.

`Sec-Fetch-Site` is the newer and more direct version of the same idea. The browser sends it on every request to an HTTPS origin with the values `same-origin`, `same-site`, `cross-site` or `none`, so the server can read the relationship straight off instead of deriving it, and script cannot set that one either. It is well supported now and worth checking first, with `Origin` behind it for the clients that do not send it.

In ASP.NET Core this belongs in middleware ahead of the endpoints rather than sprinkled through handlers, so that a new endpoint is covered by existing code instead of by somebody remembering. A short filter that lets through safe methods, compares `Origin` against the configured hosts, and returns `400` otherwise, sits naturally between `UseAuthentication` and `UseAntiforgery`. Do not reach for the CORS middleware for this: CORS decides who may read your responses and is enforced by the browser after the fact, which means a permissive CORS policy will happily let a forged request through, while a strict one still does not stop a simple request such as a form post from being sent — only preflighted ones are held back. Origin validation is a server-side refusal, and it has to be written as one.
