---
title: "Stateful Server"
summary: "A stateful server keeps data in its own process between requests, which binds those requests to that one instance. The property is sometimes deliberate and valuable, and sometimes accidental, and the difference decides whether deploys, scale-in and failover are routine or painful."
category: "Server state management"
level: 5
scene: sticky-session
sceneStep: 1
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Stateless Server
    slug: stateless-server
  - label: Session State
    slug: session-state
  - label: Distributed Session
    slug: distributed-session
  - label: Failover
    slug: failover
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

The scene's first step ends with a signed-in user suddenly signed out, and nothing in the picture misbehaved: her second request simply arrived at a different instance from her first. What the session contains is one question; the property on display here is a different one. Instance 1 is a stateful server: it holds data in its own process that outlives the request which created it, and nothing else in the deployment has a copy. That single fact is what makes the instances non-interchangeable. From the outside they look identical and the load balancer treats them as identical, but for this user only one of them can actually answer, and every mechanism that follows in the scene exists to work around that.

The costs all descend from the same root. Because the state lives in memory, its lifetime is the process lifetime, so a deploy that restarts the instance destroys it and every rollout signs somebody out. Scaling in is no longer free capacity management but a decision about whose work to discard, which is why teams with stateful instances quietly stop scaling in and pay for the peak all day. Failover has nothing to fail over to, since the replacement instance starts empty and the failure is visible to users rather than absorbed. Traffic is bound to sessions instead of to individual calls, so one heavy user can saturate one instance while its neighbours idle, and the average utilisation that autoscaling reads no longer describes what any individual instance is experiencing. None of these are separate problems to solve one at a time. They are one property, seen from four angles.

That does not make the property a mistake. Plenty of systems are stateful on purpose because the state is the whole point and moving it out would cost more than it saves. A game server runs a simulation tick over a world that would be absurd to reload from a database sixty times a second. A real-time collaboration or hub server holds live connections, and a connection is by definition attached to one process. An actor system makes single-threaded stateful entities its central abstraction, keeping each entity's data in memory precisely so that operations on it are cheap and serialised. Stream processors hold windows and running aggregates for the same reason. What these designs have in common is not that they ignore the costs but that they answer them explicitly: state is placed by key rather than by luck, it is checkpointed or replayable so a lost process is recoverable, connections drain on shutdown, and the routing layer knows where each piece of state lives instead of guessing.

The failures come from the other kind of stateful server, the kind nobody decided to build. A static dictionary that grew into a cache the code now trusts for correctness. A timer that runs on whichever instance happened to start first. An uploaded file written to local disk. A rate limiter counting in memory, which means the real limit is the configured one multiplied by the instance count. The useful test is blunt: if this instance were killed in the middle of a request, would anything be lost that a replacement could not reconstruct? A deliberate stateful design has an answer involving checkpoints, drains and key-based routing. An accidental one has an incident report. When the answer is that nothing would be lost, what you have is the other property, and that is what the scene's fourth step is working toward.
