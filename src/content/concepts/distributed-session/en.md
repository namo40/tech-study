---
title: "Distributed Session"
summary: "A distributed session keeps session state in a store every instance can read, so any instance can serve any user and a restart loses nothing."
category: "Server state management"
scene: sticky-session
sceneStep: 4
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Session State
    slug: session-state
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

The store is what makes the instances interchangeable. Session state moves out of the process into Redis, SQL Server, or whatever else the whole deployment can reach, and an instance that has never served a user before picks up exactly where another one left off. A restart, a scale-in, or a rolling deploy then costs one round trip instead of a login.

In ASP.NET Core, moving the session is only half of it. The session cookie and the authentication cookie are both protected by the Data Protection key ring, which by default is written to the local file system and stays there. Two instances with two key rings cannot read each other's cookies, so people are signed out exactly as often as they were before. Persist the keys to the same shared store and give every instance the same application name.

Expiry is now two clocks rather than one. `IdleTimeout` decides how long a session entry survives without being touched, the cookie carries its own lifetime, and the store's eviction policy is a third. Keep the session small, treat it as a cache of things that can be rebuilt rather than the record of anything that matters, and never assume that an entry which was there on the last request is still there on this one.
