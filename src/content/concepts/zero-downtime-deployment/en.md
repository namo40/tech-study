---
title: "Zero-Downtime Deployment"
summary: "A zero-downtime deployment is one where no request fails because of the deploy. It is not a strategy on its own: it is three conditions holding at the same time, that new instances only take traffic once they can serve it, that old ones finish what they were given before they exit, and that the two versions are compatible while both are running."
category: "Containers and orchestration"
tags: ["deployment"]
scene: rolling-update
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

The whole scene is one answer to one question: what has to be true for a deploy to be invisible? Watch the request stream at the top rather than the pods, and the answer is easier to see. It never stops, and across the four steps only two dots come back with a cross. Both of those are in the last step, and neither of them is caused by the deploy mechanics.

The first condition is that capacity never dips. `maxSurge 1` with `maxUnavailable 0` says the fleet may briefly have five pods but never three, so a new pod is always paid for before an old one is taken away. The order matters more than the numbers. Start, wait, then stop. Reverse it and there is a window where four replicas' worth of traffic is arriving at three replicas, and whether anyone notices is a question about headroom rather than about the deploy.

The second condition is that readiness is honest in both directions. Step 2 shows the entry half: a pod that fails its probe never enters the endpoints, so a broken build costs nothing but a stalled rollout. Step 3 shows the exit half, which is the one people forget: a pod that is going away has to say so before it stops listening, because the routing table that sends it work is a copy and copies take time to update.

The third condition is compatibility, and it is the one the deployment platform cannot enforce. During the rollout both versions are live against the same database and the same API, so anything either of them cannot understand is a failure the manifest never sees. That is the pair of crosses in step 4, and the fix is not a deployment setting but a discipline: expand, migrate, contract, spread across releases.

Nothing here is specific to Kubernetes. A load balancer draining a target group, a Windows service behind a reverse proxy, a queue consumer that stops taking messages and finishes the ones it has, all need the same three things. Kubernetes is only where the three have names.

What is worth measuring is whether it actually worked. Deploys are the only kind of incident you can schedule, so put a marker in the dashboard at every rollout and watch error rate and p99 across it. A deployment that is zero-downtime in the manifest and visible in the tail is a deployment where one of the three conditions is missing, and the tail is usually the first place it shows.
