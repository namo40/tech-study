---
title: "Same-Origin Policy"
summary: "The same-origin policy is the browser's default boundary between one site and another: a page may read what its own origin returns, and may not read another origin's. It restricts reading, not sending, which is why a form on any page can still post to your site."
category: "Application security"
scene: cookie-authentication
sceneStep: 2
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
references:
  - title: "Same-origin policy"
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Window: postMessage() method"
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
---

The second step of the scene is a page nobody at your company wrote submitting a form to your server, and the browser attaching the session cookie to it. A reasonable first reaction is that the browser should not have let that happen at all, because the browser is supposed to keep sites apart. It does keep them apart. The same-origin policy is that separation, and understanding exactly what it separates is what makes the rest of the scene make sense.

An origin is the triple of scheme, host and port, all three matching exactly. `https://shop.example` and `https://api.shop.example` are different origins, and so are `https://shop.example` and `http://shop.example`, and so are the same host on port 443 and port 8443. There is no notion of "close enough": a subdomain is as foreign as a stranger's domain. That is deliberate, because the alternative is a rule with a fuzzy edge, and security rules with fuzzy edges get argued into uselessness.

What the policy actually forbids is one origin reading another origin's data. A script on `evil.example` cannot read the response body of a fetch to your API. It cannot reach into a frame holding your page and read the DOM. It cannot read `document.cookie` for your host. It cannot read the pixels of an image drawn from your origin onto a canvas it then reads back. Everything in that list is a read, and the pattern is consistent: the browser will happily make the request, and then refuse to hand the answer to the page that asked for it.

What the policy does not forbid is sending. Embedding is allowed by design, because the web is made of pages that pull in other people's images, scripts, stylesheets, fonts and videos, and every one of those is a cross-origin request that the browser sends and acts on without ever letting the embedding page read the bytes. Forms are the same: HTML has always let any page submit a form to any URL, and the browser sends it with whatever cookies that destination has stored. Top-level navigation is the same. None of this is a hole that was left open; it is the behaviour the platform is built on, and it predates the security model by years.

Once those two halves are clear, the scene stops being surprising. The forged submission goes out because sending was never restricted. The cookie rides along because cookies are attached by destination, not by who asked. And the attacker learns nothing from the response, because reading is restricted, which is exactly why cross-site request forgery is an attack about causing effects rather than stealing data: the attacker can make your server do something, but cannot see what it said back.

Two more consequences are worth carrying around. First, CORS is not a hole in the policy but a controlled exception to it, and it relaxes only the read half: a server can say which origins may read its responses, and nothing about that changes who may send. A team that adds a permissive CORS policy hoping to fix a forgery problem has changed the wrong half of the rule and has usually made things worse, because `Access-Control-Allow-Origin` with credentials enabled hands the attacker the reading half too.

Second, the policy is a browser rule and only a browser rule. `curl`, a mobile app, a backend service and a scraper have no origin and no policy; anything they can reach on the network, they can read. So a private API that is safe only because browsers refuse to read it is not private, and an endpoint's real defence has to be authentication and authorization on the server. The same-origin policy is a boundary between the pages a user has open, not a boundary around your server.
