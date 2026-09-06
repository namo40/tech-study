---
title: "Session State"
summary: "Session state is the per-user data a server keeps between one request and the next, addressed by an opaque id the browser carries in a cookie. Where that data lives is the architectural decision: in the process, and one instance owns the user; in a shared store, and any instance will do."
category: "Server state management"
level: 3
scene: sticky-session
sceneStep: 1
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Stateless Server
    slug: stateless-server
  - label: Redis
    slug: redis
references:
  - title: "Session and state management in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
---

In the scene's first step A logs in on instance 1, her next request lands on instance 2, and instance 2 has never heard of her. Session state is exactly what instance 2 is missing: the per-user data a server holds between one request and the next, because HTTP itself remembers nothing. What travels back and forth is only an opaque session id in a cookie, a random string with no meaning outside the server that issued it. The contents stay on the server side, and that is the line between session state and data kept in the cookie itself. Anything in the cookie is carried, visible in shape, and limited to a few kilobytes; anything in the session is looked up by id and can be as large as the store allows.

Where those contents live decides the architecture, and it decides it early. Hold them in a dictionary on the process heap and the id is only meaningful on the one instance that minted it, so the load balancer has to keep sending that user back to it. That is the whole reason stickiness exists, and everything uncomfortable about stickiness follows from this one choice: load spreads by session rather than by request, a restart takes the state with it, and scaling in signs people out. Move the same contents to a store every instance can reach and the id becomes meaningful everywhere, the instances become interchangeable, and stickiness drops to an optional optimisation rather than a requirement. The externalised store has its own concerns, which belong to distributed session; the point here is that the choice of location, not the choice of library, is what sets the shape of the deployment.

Not every per-user value belongs in it. Session is the right home for something that cannot be rebuilt and has not earned a database row yet: a half-finished form, the third step of a wizard, a basket before checkout. A value that can be recomputed from the database is better held in a cache under a per-user key, and a value that must survive a lost store belongs in the database itself. This matters because session entries are best-effort by nature. They expire, they are evicted when the store runs out of room, and they vanish when the store restarts, so every read has to cope with the entry being gone rather than assuming that what was written last request is still there. Identity is a separate matter and worth keeping separate: who the user is rides in the authentication cookie or the bearer token, so losing a session should cost a basket, not a login.

The practical discipline, then, is to keep it small and keep it few. Every value in the session is paid for on each request that touches it, as serialisation and a round trip once the state has moved out of the process, and a session that has quietly grown into a general-purpose scratchpad is the usual reason externalising it feels expensive. Decide where it lives before the second instance exists rather than after, because retrofitting is what turns into the outage in the scene's third step. Keep the contents small enough that moving them out stays a configuration change, and treat anything that would hurt to lose as something that never belonged in a session in the first place.
