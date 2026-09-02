---
title: "SLI"
summary: "An SLI is the measurement itself: the ratio of good events to valid events that stands in for how the service felt to use. Everything downstream inherits its blind spots, so where you measure it decides whether the budget is telling you the truth."
category: "Observability and operations"
tags: ["metric"]
scene: error-budget
sceneStep: 2
related:
  - label: Error Budget
    slug: error-budget
  - label: SLO
    slug: slo
  - label: p95
    slug: p95
  - label: Tail Latency
    slug: tail-latency
  - label: Health Check
    slug: health-check
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Sampling
    slug: sampling
  - label: Rollback
    slug: rollback
  - label: Canary Release
    slug: canary-release
references:
  - title: "Embracing Risk"
    url: https://sre.google/sre-book/embracing-risk/
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: "Overview of Azure Monitor alerts"
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview
---

A service level indicator is a ratio with two carefully written halves: good events over valid events. Both halves are decisions. "Good" might mean a 2xx or 3xx response, or it might mean a 2xx that arrived inside 300 milliseconds, because a checkout that succeeds after nine seconds did not succeed as far as the person waiting was concerned. "Valid" is the harder one: a 400 caused by a malformed request is not the service failing and should leave the denominator, while a 429 you returned because you were out of capacity absolutely is. Write both definitions down in one sentence, because the difference between two teams' availability numbers is almost never the system and almost always this sentence.

Where you take the measurement matters more than how you compute it. A success rate assembled from your own application logs is blind to every failure that happened before your code ran, which is most of the interesting ones: the request that never resolved DNS, the connection the load balancer refused, the gateway timeout that returned 504 without ever reaching you, the deploy during which the process was not listening. Server-side metrics report on the requests that arrived at a healthy instance, which is a survivorship-biased sample by construction. Measuring at the ingress, at the CDN, or from a synthetic client outside your network costs more and tells the truth. The scene's second step is what that truth looks like when it is honest: the measured rate dips before anything is declared an incident, and the budget starts draining at the moment the users started noticing rather than at the moment somebody opened a channel.

Averages are the other place indicators go wrong. A mean latency hides exactly the requests the objective is about, because the slow tail is small in count and enormous in effect, so an SLI phrased on latency uses a percentile threshold and a count: not "average latency under 300 ms" but "the share of requests served under 300 ms". That phrasing turns a latency target back into a ratio, which is what makes it composable with the availability indicator and spendable as one budget. It also stops the number from improving when a batch of fast health checks arrives, which a mean would happily let it do.

Keep the number of indicators small and keep each one attached to something a person does. A service with one indicator per endpoint has a wall of numbers nobody reads and an aggregate that hides everything; a service with three, one per user journey, has a conversation. The test for a good indicator is whether a drop in it would make you stop what you are doing, and whether a user would agree that something was wrong. Anything that fails both tests is a metric worth having on a dashboard and not worth attaching a budget to, and mixing the two categories is how teams end up freezing releases over a graph nobody can connect to a complaint.
