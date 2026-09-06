---
title: "External Configuration"
summary: "External configuration is everything the build does not carry: the settings that arrive from outside the artefact at start-up, so one image behaves differently in every environment it runs in — and so a shadow deployment can be caged without becoming a different build."
category: "Containers and orchestration"
tags: ["deployment"]
level: 3
scene: shadow-deployment
sceneStep: 3
related:
  - label: Shadow Deployment
    slug: shadow-deployment
  - label: Secret Injection
    slug: secret-injection
  - label: Environment Variable
    slug: environment-variable
  - label: Feature Flag
    slug: feature-flag
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Configuration
    slug: configuration
references:
  - title: External Configuration Store pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/external-configuration-store
  - title: Configuration in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration
  - title: The Twelve-Factor App - Config
    url: https://12factor.net/config
---

External configuration is a rule about where a value is allowed to come from. Anything that differs between environments — a connection string, an endpoint, a timeout, a flag, the name of the queue this instance should read — is not compiled into the artefact and not shipped inside it. It is supplied from outside at start-up, by environment variables, a mounted file, a configuration service, or whatever the platform provides, and the artefact reads it through one interface that does not care which of those it was.

The practical consequence is the one this scene is built on. If the settings live outside, the same image can be started twice with two different sets of them, and the two processes will behave differently while remaining the same build. That is exactly what a shadow deployment needs: the copy under test has to be the artefact you intend to promote, or the test proves nothing about what you promote, and yet it has to write nowhere, charge nobody and send no mail. Those two requirements are only compatible because the difference between the caged instance and the serving one is a set of values rather than a branch in the code.

It also decides how a change gets made. Editing a value that lives outside the build is a configuration change: no compile, no artefact, no queue of pull requests, and a rollout that is a restart or a reload rather than a deployment. Editing a value that was baked in is a code change with everything that implies. The line between the two is worth drawing deliberately, because it is the line between "we can turn this down in a minute" and "we can turn this down after a build".

The interface matters as much as the storage. In .NET the pattern is a layered `IConfiguration`: `appsettings.json` for defaults that travel with the build, `appsettings.{Environment}.json` for per-environment overrides, environment variables above those, and command-line arguments above everything, with each layer replacing keys from the ones below. A class does not read any of it directly; it takes `IOptions<T>` in its constructor and receives a bound object, which keeps the settings substitutable in a test and keeps the provider chain a deployment concern rather than a code one. `IOptionsSnapshot<T>` gives a fresh binding per scope and `IOptionsMonitor<T>` notifies on change, which is what makes reloadable settings possible without restarting anything.

Reloading is a promise that has to be kept end to end, though. A provider that watches its source, a binder that rebinds, and a consumer that reads through the monitor rather than caching the first value it saw are three separate conditions, and a value injected once into a singleton at start-up will never change no matter what the provider does. Decide per setting whether it is start-up-only or live, and be honest about it: a "hot reloadable" timeout that is really read once is worse than one everybody knows requires a restart.

Two boundaries keep the pattern from turning into its own problem. The first is secrets: passwords, keys and tokens are external configuration in the sense that they arrive from outside, but they need a store that encrypts them, audits reads and rotates them, so they belong in a secret manager rather than in the same file as the page size. The second is validation: because these values arrive at run time, the compiler cannot check them, so bind them to a typed options class, validate them at start-up with data annotations or a validation delegate, and fail fast. A misconfigured process that refuses to start is a good outcome; one that starts and points a caged instance at the primary database is the outcome this whole pattern exists to prevent.
