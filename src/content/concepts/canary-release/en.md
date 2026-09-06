---
title: "Canary Release"
summary: "A canary release sends a small share of real traffic to the new version, watches what that share does, and widens or rolls back on the answer. The percentage is not a schedule; it is the size of the damage you have agreed to accept."
category: "Containers and orchestration"
tags: ["deployment", "metric"]
level: 4
scene: blue-green-deployment
sceneStep: 3
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Traffic Manager routing methods"
    url: https://learn.microsoft.com/en-us/azure/traffic-manager/traffic-manager-routing-methods
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
---

Watch the third step of the scene and notice what changes and what does not. The two environments are the same two environments. The lanes are the same lanes. The database is the same database. The only thing that changed is the control at the top: a switch that had two positions has become a dial that has many, and the version being tested is now holding a tenth of the traffic instead of all of it or none of it. Everything a canary release is follows from that one substitution.

The number on the dial is doing something more precise than it looks. When Green is broken and Green holds 10% of the traffic, the worst error rate the whole system can show is 10%, because the other nine requests in ten never touch it. That is why the readout in the scene climbs to exactly ten and stops there: it is not measuring how broken the new version is, it is measuring what the new version is being allowed to break. The dial is a ceiling on the damage, and choosing 10% rather than 50% is choosing how much you are willing to lose while you find out.

Which makes the metric, not the clock, the thing that moves the dial. A canary that widens on a timer is a slow deployment, not a safe one, because the schedule advances whether or not the numbers said anything. What you want is a comparison: the error rate, the latency at the tail, and one or two signals that mean something in your domain, measured on the canary and on the stable side at the same time, over the same window. Same window matters more than it sounds, because a canary observed for thirty seconds during a quiet minute has told you nothing at all.

The awkward part is that small samples are noisy. Ten percent of a service that handles thirty requests a second gives you three requests a second to reason about, so a single slow dependency call or one unlucky client can look exactly like a regression, and the release gets rolled back for nothing. The usual answers are to keep the first stage long enough to accumulate a real sample, to compare against the stable side rather than against a fixed threshold, and to be honest that below a certain traffic volume a canary cannot tell you anything a good staging environment could not have told you first.

Two failure modes are worth naming because they are silent. The first is a canary that never sees the traffic that would break it: if the routing is weighted per connection rather than per request, or if the 10% is drawn from one region or one client version, the sample is not a sample, it is a subset with an opinion. The second is state. A canary writing to the same database as the stable side can leave rows the old version cannot read, and unlike a request, a row does not roll back when the dial does. Everything the fourth step of the scene says about expand and contract applies here with more force, not less, because a canary means the two versions are writing at the same time by design.

So treat the dial as an exposure control that happens to be attached to a deployment. What you are choosing is not how fast to release; it is how much of your traffic gets to be the test, how long you will watch it, and what number will make you turn it back. Write those three down before the release rather than during it, and the rollback becomes a decision rather than an argument.
