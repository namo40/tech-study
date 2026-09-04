---
title: "Endpoint Routing"
summary: "Endpoint routing splits routing in two: `UseRouting` decides which endpoint will run and attaches its metadata to the request, and the endpoint itself runs at the end of the pipeline."
category: ".NET runtime and hosting"
scene: middleware-pipeline
sceneStep: 1
related:
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0
---

Routing happens in two places, not one. `UseRouting` matches the request against the route table, picks the endpoint that will eventually run, and hangs it on the request along with everything declared about it. The endpoint does not execute there; it executes at the very end, where `MapGet` and friends placed it.

The gap between those two points is what makes the design useful. Every middleware registered after `UseRouting` can ask which endpoint was selected and read its metadata, so authorization knows which policy applies, the rate limiter knows which named limit to use, and CORS knows which policy the endpoint declared. None of that would be possible if routing and running were the same step.

That is also why the order is fixed rather than a matter of taste. `UseRouting` has to come before anything that reads endpoint metadata, and the endpoints themselves have to come last, after every middleware that might reject the request has had its turn. Getting this wrong shows up as an `InvalidOperationException` complaining that an endpoint carries authorization metadata but no middleware was found that supports authorization. `WebApplication` inserts `UseRouting`, `UseAuthentication` and `UseAuthorization` for you if you never call them, so the order only becomes yours to get right once you start placing middleware of your own.
