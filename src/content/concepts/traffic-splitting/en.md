---
title: "Traffic Splitting"
summary: "Traffic splitting sends a chosen share of requests down the new path and the rest down the old one. The share is not a schedule; it is the ceiling on how much the new path is allowed to break."
category: "Containers and orchestration"
tags: ["deployment"]
scene: feature-flag
sceneStep: 2
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: OpenFeature
    slug: openfeature
  - label: Sticky Session
    slug: sticky-session
  - label: Load Balancer
    slug: load-balancer
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
---

Watch the second step of the scene and notice where the split is actually made. Nothing moved. The same servers are running, the same code is on all of them, and no traffic manager was touched. What changed is a number in configuration, and the consequence of that number is visible one band lower: ten dots that were all on one side, with exactly one of them now on the other. The split is a decision the application makes about each caller, not a decision the network makes about each packet. The same term also names weighted routing at a load balancer, a service mesh or a traffic manager, which is the dial a canary release turns; this page is about the split a flag performs inside the application.

The strip in the middle is the whole mechanism drawn out. Each caller sits at the height of its hash, and the shaded band rises to the percentage; a caller under the band is admitted and a caller above it is not. That is all a percentage rollout is: a stable hash of something about the caller, compared with a number. It is why exactly one of the ten is admitted at ten percent rather than roughly one, and it is why the same caller is admitted again the next time it appears without anybody remembering that it was admitted before.

Hashing the caller rather than the request is the part that matters, and it is the part that is easiest to get wrong. A random draw per request would give you the same average and a completely different experience: a user lands on the new checkout, refreshes the page, and is back on the old one, with a half-finished cart that only one of the two paths knows about. Bucketing makes the assignment a property of the caller, so it survives refreshes, retries, multiple tabs and whichever server happens to answer.

The choice of what to hash is a design decision with consequences. Hash the user id and individuals move independently, which is right for a consumer product and wrong for a shared workspace where two colleagues would see different things in the same document. Hash the tenant and a whole customer moves at once, which is right for business software and coarse enough that ten percent of tenants may be far more or far less than ten percent of traffic. Whatever you pick, add a per-flag salt to the hash, or every flag at ten percent will admit the same unlucky tenth of your users and one cohort will absorb every experiment you ever run.

A percentage also has to be a sample, and a small percentage often is not. Ten percent drawn from one region, one client version or one plan tier is a subset with an opinion rather than a slice of the population, and it will happily report that everything is fine right up to the moment you widen. Check that the admitted cohort looks like the whole, and be honest about volume: below a certain number of requests, a ten percent bucket cannot tell you anything you did not already know.

The last thing the second step is worth watching for is what the percentage is not. It is not a schedule and it is not progress. Moving from ten to fifty because a day has passed is a slow release, not a safe one, because the clock advanced whether or not the numbers said anything. What makes the dial useful is that the error rate, the latency and one or two signals that mean something in your domain are compared between the two cohorts over the same window, and that somebody wrote down beforehand which number would make them turn it back.
