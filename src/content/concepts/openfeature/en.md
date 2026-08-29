---
title: "OpenFeature"
summary: "OpenFeature is a vendor-neutral API for evaluating feature flags: your code asks a client for a value and a provider answers, so the checks scattered through a codebase stop naming whoever happens to be storing the flags."
category: "Containers and orchestration"
tags: ["deployment"]
scene: feature-flag
sceneStep: 4
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: Canary Release
    slug: canary-release
  - label: External Configuration
    slug: external-configuration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rollback
    slug: rollback
  - label: Fallback
    slug: fallback
  - label: Cache-Aside
    slug: cache-aside
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
---

The fourth step of the scene ends with the switch coming out, and that is the moment worth thinking about when choosing how flags are evaluated. Every flag you add is a branch you will one day have to find and delete, and how easy that is depends almost entirely on whether all the checks look the same. If half of them call one vendor's SDK, a few read an environment variable and the rest ask a database table you wrote yourself, removing a flag is an archaeology exercise. OpenFeature exists to make the check one shape.

The shape is small. Code asks a client for a typed value by flag key, passing a default and an evaluation context; a provider registered once at startup answers. That is the whole surface a caller sees, which is why the interesting part is what it hides: which service stores the flags, how the percentage is worked out, whether the answer came from a cache or a stream, and what happens when the provider cannot be reached. None of that belongs in the call site, and once it is not in the call site you can change any of it without touching the code.

The default value in every call is doing more work than it looks like. It is what the caller gets when the provider is missing, misconfigured, slow, or has never heard of that key, and it is therefore the answer during exactly the incidents you were relying on the kill switch for. Choose it as the safe state rather than the new state: `false` for a feature being rolled out, and for a switch that guards something, whichever position keeps the system running when everything else has stopped. A flag whose default is the risky path has quietly made the flag system a hard dependency of the thing it was protecting.

The evaluation context is where the percentage in the second step actually comes from. It carries a targeting key and whatever attributes the rules are allowed to read, and the provider hashes the targeting key to place the caller in a bucket. Set it once, high up, from whatever identity you already have in the request, and pass it down rather than reconstructing it per call, or two checks in one request can disagree about who is calling. Keep the attributes minimal for the same reason you keep any payload minimal: everything you put in the context is something the flag rules may come to depend on, and a rule that reads six attributes is a rule nobody will dare delete.

Hooks are the part that makes flags observable without every call site remembering to log. A hook runs before and after each evaluation, so one registration gives you the flag key, the value returned, the reason it was returned and the variant, on every check in the process. That is what makes cohort-split metrics possible, and it is also what tells you a flag is dead: a key that always returns the same value for everybody, for weeks, is a branch waiting to be removed, and you only know that because something was watching.

In .NET the package is `OpenFeature`, with providers published separately, including one over `Microsoft.FeatureManagement` so an application already using it can adopt the neutral API without changing where the flags live. Register the provider at startup, resolve `IFeatureClient` from the container, and keep the call sites boring: one key, one default, one context. The vendor is then a line in `Program.cs`, which is the point of the whole exercise.
