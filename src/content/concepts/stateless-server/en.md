---
title: "Stateless Server"
summary: "A stateless server holds nothing between requests that a replacement instance would miss. The state has not disappeared, it has moved to a store, a cache or the request itself, and what that buys is that any instance can serve any request."
category: "Server state management"
level: 5
scene: sticky-session
sceneStep: 4
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Stateful Server
    slug: stateful-server
  - label: Session State
    slug: session-state
  - label: Horizontal Scaling
    slug: horizontal-scaling
  - label: Bearer Token
    slug: bearer-token
  - label: Rolling Update
    slug: rolling-update
references:
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
---

The scene's fourth step externalises the session, and the moment it does, the instances change character. Any instance can now serve any user, and that is the definition of the property rather than a consequence of it: a stateless server is one that holds nothing between requests which a fresh replacement would be missing. The name is the misleading part. Stateless does not mean an application without state, which would be an application that does nothing useful. It means the state is somewhere every instance can reach, so that correctness never depends on which process answered.

There are three places it goes. A shared store keeps whatever must be looked up by identifier, which is what the scene's fourth step does with the session and what distributed session covers in detail. A cache holds what can be recomputed, which is the crucial distinction: a stateless instance may keep a local cache and still be stateless, because a cold instance is slower rather than wrong. Or the state travels in the request itself, carried by the caller and verified on arrival, which is what a bearer token does with identity. That last one is worth naming separately because authentication is usually the last thing to be externalised. A server that validates a signed token instead of looking up a session id has made even the login stateless, at the cost that a token cannot be revoked before it expires, which is why such tokens are short-lived.

What the property buys is that most operational events stop being events. Adding capacity is adding instances, since the new one is useful the moment it accepts traffic and needs no warm-up to be correct. A rolling update replaces instances one at a time and no user notices, because there was nothing in the replaced process to lose. Failover is a routing change rather than a recovery, and load balancing can go back to spreading individual requests instead of pinning users, which is what actually makes utilisation even. Stickiness survives only as an optional optimisation for cache locality, and it is now safe to lose. The reason this list is so long is that the awkward parts of deployment, scaling and failure recovery were mostly not deployment problems at all. They were consequences of state living in the wrong place.

The property is easier to claim than to hold, and it leaks in ordinary ways. A file saved to the container's own disk, a counter that enforces a limit per process, a scheduled job pinned to whichever pod woke first, an in-process cache used for correctness rather than speed, a real-time hub with no backplane: each of these quietly reattaches a request to an instance, and none of them shows up until the second instance exists. There is a price to pay as well, which is that state kept elsewhere is fetched over a network, so every request pays a round trip or carries a larger token, and the store becomes a dependency whose failure is now everyone's failure. Keep what travels small, treat local caches as caches, and verify the property the only way it can be verified: kill an instance under load and see whether anybody notices.
