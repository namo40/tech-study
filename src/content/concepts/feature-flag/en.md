---
title: "Feature Flag"
summary: "A feature flag separates deploying code from releasing it: the switch decides who sees what, percentages turn blast radius into a dial, and the kill switch is the cheapest rollback ever built — which is why a flag that is always on is debt to remove."
category: "Containers and orchestration"
tags: ["deployment"]
scene: feature-flag
steps:
  - title: "Deploying is not releasing"
    text: "Without a flag, shipping v2 IS the release: everyone gets it at once, and taking it back means another deploy. Put the code behind a flag and ship it dark — v2 is on every server, and nobody sees it until you say so. The switch, not the ship, decides."
  - title: "Release to 10%, watch, then widen"
    text: "The flag hashes each user into a bucket, so the same person always lands on the same side — a coherent experience, not a coin flip per request. Ten percent becomes fifty when the numbers look right. The blast radius is now a dial you turn, not a fact you accept."
  - title: "The kill switch is the cheapest rollback ever built"
    text: "v2 starts throwing errors at half the users — and one flag flip sends everyone back to v1 in seconds. No build, no deploy, no rollback window: the bad code is still on the servers, it just stopped being reachable. Speed of recovery is the whole reason the flag exists."
  - title: "A flag that is always on is debt with a switch attached"
    text: "Fixed and verified, v2 rolls to 100% — and then the flag comes out, because every flag doubles the paths through your code. Release it, prove it, remove it. The standard API keeps the checks portable, so the discipline survives the vendor."
related:
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: OpenFeature
    slug: openfeature
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
  - label: External Configuration
    slug: external-configuration
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
references:
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
---

## When to use

- For work that is not finished but has to be merged anyway. A flag lets an incomplete feature live on the main branch and ship to production every day without being reachable, which is what makes trunk-based development possible: the branch that never gets long is the branch behind a flag.
- For a release you want to widen gradually. Ten percent, then fifty, then everyone, with the error rate and the latency watched between each move, so the size of the mistake is a number you chose rather than a number you discovered.
- On anything you would want to switch off in a hurry: a new dependency, a rewritten algorithm, a third-party integration you do not control. The question to ask before shipping is not "will this work" but "how would I turn it off", and a flag is the cheapest answer there is.
- For operational toggles that have nothing to do with releases. Shedding an expensive recommendation panel under load, disabling a report that hammers the database at month end, muting an outbound integration while the other side is down: these are the same switch used for a different reason.
- For experiments. An A/B test is a feature flag whose assignment is recorded and whose outcome is measured, so if you already have the flag, you already have most of the experiment.

## Cautions

- A flag check happens on the request path, so it has to be local and it has to be fast. Evaluate against a cached snapshot of the configuration that a background refresh keeps current; a network call per check turns every flag into a dependency and every provider outage into your outage.
- Bucket by a stable identifier, not per request. Hash the user, the account or the tenant so the same caller always lands on the same side. A coin flip per request gives you a user who sees the new checkout, refreshes, and sees the old one, which reads as a bug because it is one.
- Both paths are in production, so both paths are your problem. Test both, monitor both, and split the metrics by cohort: an error rate averaged across the two sides of a flag hides exactly the difference you turned the flag on to see.
- Flags multiply states. Two flags are four combinations and ten are more than you will ever test, so treat a long-lived flag as debt: give it an owner, give it a removal date, and take it out once it has been fully on for a while. The last step of a rollout is deleting the branch, not reaching a hundred percent.
- A kill switch must not depend on the thing it protects. If the flag configuration is served through the failing service, or the cache that refreshes it needs the database that is down, the switch you were counting on is unreachable at the only moment it mattered. Keep a last-known-good value on disk and default to it.
- Flag state is configuration, not code, and that cuts both ways. Changing it is fast, which is the point, but it is also a production change with no review and no build: record who flipped what and when, and treat the audit log as part of the feature rather than as an afterthought.

## In .NET

`Microsoft.FeatureManagement` is the standard implementation. Register it against a configuration section, then ask `IFeatureManager` whether a feature is enabled; the answer comes from the configuration snapshot rather than from a call, so the check costs nothing worth measuring.

```csharp
builder.Services.AddFeatureManagement();

// on the request path
if (await featureManager.IsEnabledAsync("NewCheckout"))
{
    return await newCheckout.PlaceAsync(order, ct);
}
return await legacyCheckout.PlaceAsync(order, ct);
```

Percentages and cohorts are filters rather than code. The targeting filter hashes a supplied identifier, so the same user stays on the same side across requests and across servers, and widening the rollout is an edit to configuration rather than a deployment.

```json
{
  "feature_management": {
    "feature_flags": [
      {
        "id": "NewCheckout",
        "enabled": true,
        "conditions": {
          "client_filters": [
            {
              "name": "Microsoft.Targeting",
              "parameters": { "Audience": { "DefaultRolloutPercentage": 10 } }
            }
          ]
        }
      }
    ]
  }
}
```

In Azure App Configuration the flags live outside the application and a sentinel key drives the refresh, so flipping a switch in the portal reaches every instance within the refresh interval without a restart. `AddAzureAppConfiguration` with `UseFeatureFlags` wires that up, and `ITargetingContextAccessor` is where you decide what the hash is taken of: the user id for a user rollout, the tenant id when a whole customer has to move together.

For anything larger than one application, OpenFeature is the vendor-neutral API. Your code asks a client for a boolean and a provider answers it, so the checks scattered through the codebase stop naming a particular vendor and the decision about which service evaluates flags stays a decision you can change.
