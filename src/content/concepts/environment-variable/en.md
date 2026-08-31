---
title: "Environment Variable"
summary: "An environment variable is the most universal injection path there is: the platform fills it before the process starts and every runtime can read it without a library. It also inherits, dumps and prints itself, and its value is frozen until the next restart."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: secret-injection
sceneStep: 2
related:
  - label: Secret Injection
    slug: secret-injection
  - label: Secret Store
    slug: secret-store
  - label: Configuration
    slug: configuration
  - label: Secret Management
    slug: secret-management
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Least Privilege
    slug: least-privilege
  - label: Sidecar
    slug: sidecar
references:
  - title: Configuration in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/
  - title: Distribute Credentials Securely Using Secrets
    url: https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/
  - title: Secrets
    url: https://kubernetes.io/docs/concepts/configuration/secret/
---

The second step of the scene is the one where the easy answer arrives and turns out to have a price tag. A pod is deployed from a clean image, a value climbs up from the store, and the `env` slot is full before the process has run a single line. That is the whole appeal, and it is not a small one: no client library, no filesystem layout, no startup call that can fail, no ordering problem between reading configuration and needing it. Every language, every runtime, every base image agrees on what an environment variable is.

What the environment is, though, is a block of memory the operating system hands to a process and to everything that process starts. That is the definition, and every leak follows straight from it. Spawn a shell to run a migration and the shell has the value. Spawn a sidecar helper, a health-check script, a `git` invocation, and each one has the value. A crash dump is a copy of process memory, so a dump has the value. A diagnostic endpoint that renders configuration for support, an unhandled-exception page in the wrong environment, a logging enricher that decided to capture the environment for context — all of them have the value, and none of them thought of themselves as a security boundary. The environment is not leaking despite being an environment; it is doing exactly what an environment is for.

The second cost is time. The variable is handed over at process start and there is no mechanism to hand over a new one, because the whole point of the block is that it does not change under the process's feet. That is why the scene draws the fourth step the way it does: when the store swaps the version, the mounted file refreshes where it stands and the environment simply keeps holding the value it was given until the pod is replaced. Rotation on the environment path is not a configuration reload, it is a restart, and a restart is a real event with real consequences — connection churn, warm caches lost, a rolling update to schedule, a maintenance window if the workload is a singleton.

None of that makes environment variables wrong. It makes them a choice with known properties, which is the only kind of choice worth making. A feature flag, a log level, a public endpoint URL, a bucket name, a timeout in seconds: these belong in the environment, and putting them anywhere fancier is a cost with no benefit. A database password that also opens the reporting replica, the signing key for your session cookies, a payment provider's live API key: these want a mounted file or a client that fetches them at start, because the difference between a leak and no leak is the difference between one careless diagnostic page and none.

The manifest is where the discipline is enforced, and it is enforced by never spelling out a value. A container's `env` entry can carry a literal, and the moment it does, the secret is in version control and in every rendered template and in the audit log of whatever applied it. The alternative costs one more line: the entry names a store entry with `secretKeyRef`, and the platform resolves it at start. The distinction is visible in a code review, which is exactly where you want it to be visible.

There is one more thing worth knowing about how .NET reads them. Configuration keys are hierarchical and environment variables are flat, so the double underscore is the bridge: `ConnectionStrings__Orders` becomes `ConnectionStrings:Orders`, and a nested options object can be overridden one leaf at a time without the deployment having to know anything about the shape of the rest. Because environment variables are usually added last in the source chain, that override wins over the JSON file, which is what lets one image behave differently in two clusters. It is also why an accidentally set variable on a developer's machine can silently shadow a value from a file, and why "it works in the container but not locally" is so often a configuration-precedence bug rather than a code bug.

The honest summary is the one the caption gives. Environment variables are the easiest road, they work everywhere, and they leak accordingly. Use them for the values whose disclosure would be embarrassing rather than expensive, know that rotating them means restarting, and when you find yourself writing a redaction rule to keep one out of a log, take that as the signal that the value belonged on the other path.
