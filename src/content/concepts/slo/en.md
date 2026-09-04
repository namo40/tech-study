---
title: "SLO"
summary: "An SLO is the reliability target you set for yourself: a number, a window and a threshold that together say how good is good enough. It is the promise the error budget is the change from, which is why picking it is an engineering decision rather than an aspiration."
category: "Observability and operations"
tags: ["metric"]
scene: error-budget
sceneStep: 1
related:
  - label: Error Budget
    slug: error-budget
  - label: SLI
    slug: sli
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Tail Latency
    slug: tail-latency
  - label: Latency
    slug: latency
  - label: Capacity Test
    slug: capacity-test
  - label: Canary Release
    slug: canary-release
  - label: Rollback
    slug: rollback
references:
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: "Embracing Risk"
    url: https://sre.google/sre-book/embracing-risk/
  - title: "Overview of Azure Monitor alerts"
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview
---

A service level objective is a target you choose for a measurement you already take, over a window you state out loud. "99.9% of checkout requests succeed, measured over thirty rolling days" is a complete one: an indicator, a threshold, and a period. Drop any of the three and it stops being an objective. A target with no window can be met and missed on the same afternoon depending on how you squint, and a target with no stated indicator is an argument waiting to happen about whether that redirect counted. The scene's first step is what the completed sentence buys you: because the objective is a share and the window is a length, the failure it permits is a quantity, and a quantity can be spent.

The number is not a discovery, and there is no measurement that produces it. It is a decision about how much unreliability the people who depend on the service can absorb, and it costs real money in both directions. Every nine you add multiplies the engineering it takes to hold: redundancy across zones, then across regions, then a second provider, then a team on call for a system nobody is allowed to touch during business hours. Every nine you leave off is a customer noticing. The useful way to set it is from the outside in: look at what users actually tolerate, what the dependencies underneath you can promise, and what the last few months of real measurement produced, then pick a target you are already close to and will have to work to keep. A target you meet effortlessly is a target that tells you nothing, and one you have never met is one people learn to ignore.

An SLO is not an SLA, and confusing the two is expensive. The SLA is the contractual version with money attached, negotiated with somebody outside the company, and it is set deliberately looser than the internal objective — often by a whole nine — precisely so that missing the internal target is a signal rather than a refund. The internal SLO is where you want the alarm to go off, which is well before anyone outside notices. Teams that publish their SLA as their SLO have removed the margin that was supposed to give them time to react, and their first warning of a problem is the customer's lawyer.

Where a target sits also decides what a violation means. A monthly 99.9% objective permits 43 minutes of failure, which one bad afternoon can spend in a single sitting; the same objective over a rolling window instead of a calendar month never gives you the fresh-start effect of the first of the month, and that difference changes behaviour more than the number does. Rolling windows are the honest choice for anything users experience continuously, because the budget you have today reflects the outage you had three weeks ago. Calendar windows are easier to explain and easier to game, and their one real advantage is that they line up with the review that the reset is supposed to force. Whichever you choose, the objective belongs somewhere versioned, next to the definition of what it measures, because an objective that lives in a dashboard's settings is one refactor away from having quietly changed.
