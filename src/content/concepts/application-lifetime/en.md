---
title: "Application Lifetime"
summary: "The application's lifetime is the container's lifetime: it is built once at startup, it opens and closes a scope around every unit of work, and at shutdown it releases what it is still holding in reverse order of creation — so where a thing is created decides when it dies."
category: ".NET runtime and hosting"
tags: ["queue"]
level: 5
scene: dependency-injection
sceneStep: 4
related:
  - label: Dependency Injection
    slug: dependency-injection
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Background Service
    slug: background-service
  - label: IHostedService
    slug: ihostedservice
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: DbContext
    slug: dbcontext
references:
  - title: .NET Generic Host
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/generic-host
  - title: Dependency injection in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview
  - title: Dependency injection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection
---

A container is not a lookup table that happens to be alive for a while. It is an object with a beginning, a middle and an end, and almost every lifetime bug is really a disagreement about which of those three a piece of code is in. The host owns that shape. It builds the container once, runs the application inside it, and disposes it on the way out, and everything your code ever resolves is either the container's own or borrowed from a scope the container opened.

The beginning is `Build`. Up to that call the service collection is a mutable list of descriptions; after it the registrations are closed and the provider is the only thing that will ever create anything. That instant is the cheapest place in the whole system to be wrong, which is why it is worth making it strict. `ValidateOnBuild` walks every registration and checks that it can be resolved, without creating the instances, so a missing dependency becomes a startup exception instead of a request that fails in an hour. `ValidateScopes` adds the rule this scene is about: a singleton may not hold a scoped service. Both are on by default only in the Development environment, so if your continuous integration runs with the environment left at Production, the checks you think are protecting you are not running.

The middle is a rhythm of scopes. In a web application the framework opens one around each request and disposes it when the response is finished, and every `AddScoped` registration means one instance per turn of that rhythm. Outside a request the rhythm is yours to define, and the unit is whatever "one piece of work" means in your application: a message consumed from a queue, one iteration of a polling loop, a single row of a nightly import. Background code that skips this is the common way a captive dependency gets in, because a hosted service is a singleton and anything it holds is held for the life of the process. Open a scope from `IServiceScopeFactory` per unit, resolve inside it, and let it go at the end.

The end is a sequence, and the order is not arbitrary. On a stop signal the host raises `ApplicationStopping` first, which is the moment to stop accepting new work while the current work is still allowed to finish. Then it stops the hosted services, in the reverse of the order they were started, so a service that came up depending on another is always shut down before the thing it depends on. Then `ApplicationStopped` fires, and finally the provider itself is disposed, releasing every disposable it created in the reverse of the order it created them. The container was the first thing built and it is the last thing released, which is the whole meaning of the phrase "the application's lifetime is the container's lifetime".

Two details make the end honest rather than decorative. The first is that shutdown is bounded: `HostOptions.ShutdownTimeout` caps how long the host will wait, and work still running when that window closes is abandoned mid-flight. If a consumer needs twenty seconds to finish a batch, the timeout has to say so, and so does whatever is sending the stop signal, because an orchestrator that kills the process on its own schedule does not read your configuration. The second is that disposal only reaches what the container owns. Anything you constructed yourself and handed to a registration as an already-built instance is yours to dispose, and anything resolved from a scope you never closed will wait for the process to exit instead.

The lifetime events are also the natural home for the things that must happen exactly once per process. Warming a cache, registering with service discovery, writing a startup record: `ApplicationStarted` is where those belong, not in a constructor that might be called before the server is listening. Draining, deregistering and flushing belong in `ApplicationStopping`, early enough that the work still has a live container to run in. Put either of them in the wrong half and you get the same class of bug from the other direction: a dependency that is not ready yet, or one that is already gone.

Knowing which phase you are in is most of the skill. A class that behaves correctly during a request and wrongly during startup is usually not broken; it has simply been resolved from the root provider instead of from a scope, and the container did exactly what it was asked to. Ask what created this instance, and what will dispose it, and the answer to every question about how long it lives falls straight out.
