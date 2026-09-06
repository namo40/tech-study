---
title: "Error Budget"
summary: "An error budget is the failure you are allowed: the gap between a 100% dream and the SLO you actually promised, spent down by every bad minute, and whoever holds the budget holds the argument about when to ship and when to stop."
category: "Observability and operations"
tags: ["metric"]
level: 5
scene: error-budget
steps:
  - title: "Flip the goal over and it becomes a budget"
    text: "99.9% promised means 0.1% allowed — forty-three minutes of failure a month, funded in advance. Perfection was never the target: the unspent budget is risk you are allowed to take."
  - title: "The SLI measures; the SLO promises; the budget is the gap"
    text: "A bad stretch arrives, the measured good-rate dips, and every minute below target burns budget at eight times the break-even pace. The incident ends — the spending stays spent. Thirty-eight percent of the month's failure is already gone."
  - title: "The budget makes the decision so people don't have to"
    text: "At 62% remaining, shipping is fine — that is what the margin is for. At 8%, the gate freezes: features wait, reliability work goes first. Nobody argues about how safe is safe enough; the number already answered."
  - title: "The month ends; the budget refills; the history doesn't"
    text: "A fresh 43 minutes, the gate reopens, and the record of how the last budget died becomes the argument for the next one — maybe the SLO was too strict, maybe the system was. The budget resets. What you learned shouldn't."
related:
  - label: SLO
    slug: slo
  - label: SLI
    slug: sli
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Tail Latency
    slug: tail-latency
  - label: Health Check
    slug: health-check
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Rollback
    slug: rollback
  - label: Canary Release
    slug: canary-release
references:
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: "Overview of Azure Monitor alerts"
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview
  - title: "Embracing Risk"
    url: https://sre.google/sre-book/embracing-risk/
---

## When to use

An error budget is not a monitoring feature. It is what you get for free the moment you write down a reliability target below 100%, and the only question is whether anybody is spending it deliberately.

- Reach for it when "can we ship this?" is being settled by seniority. The argument has no natural end, because both sides are right in the abstract: shipping is how the product survives and stability is how the customers stay. A budget ends it by making the answer a subtraction. Nobody has to be persuaded that 8% left is not much.
- Adopt it as soon as you have an SLO that somebody outside the team can see. A target with no budget attached is a wish, because nothing changes when you miss it and nothing changes when you beat it by a mile. The budget is what turns the number into a lever, in both directions: it also says when you are being too careful.
- Use it to price risk rather than to forbid it. A budget with 70% left is permission — to run the migration in business hours, to take the canary to 50%, to skip the third approval. Teams that never spend their budget are not safe; they are slow, and the unspent minutes are the proof.
- Reach for it when incidents are being argued about one at a time. Two hours of downtime is either a catastrophe or a rounding error depending on what the month already spent, and only the budget knows which. It converts a stream of individual dramas into one running total that everybody reads the same way.
- Pair it with a release gate you actually wire up. The budget is a number until something reads it: a pipeline check, a change-approval rule, a standing agreement about what freezes. The scene's third step is the whole point, and it only works because the gate is a consequence rather than a suggestion.
- Do not reach for it as a performance metric for people. The moment a burnt budget becomes something an engineer is blamed for, the SLI starts being defined to look good, and you have replaced a decision-making tool with a reporting one. The budget measures the system, and the point of it is to be spent.

## Cautions

- The SLI has to measure what the user feels. A success rate computed from your own server logs cannot see a request that never arrived, a DNS failure, a load balancer returning 503 before your code runs, or a 200 that took nine seconds. Measure at the edge — the ingress, the CDN, the client — or accept that your budget is a measure of the part of the system that was working.
- A 100% SLO is a zero budget and a permanent freeze. It sounds like ambition and it is arithmetic: if nothing is allowed to fail, every deployment is a violation, and the honest response is to stop deploying. Whenever somebody asks for "no downtime", the useful question is which number below 100% they mean, because they do mean one.
- Burn-rate alerts need at least two windows or they page on noise. Burn rate is the multiple of the pace that would spend exactly the budget over exactly the window, so 1 is on plan, and 14 means a month's allowance is gone in about two days. A single short window catches every blip; a single long one notices the outage after it is over. The standard shape is a fast pair (a high multiple over an hour, confirmed over five minutes) that wakes somebody, and a slow pair (a low multiple over a day, confirmed over hours) that files a ticket. One window is a pager nobody trusts inside a week.
- A freeze that gets overridden every time is a dashboard, not a policy. The budget only makes decisions if the people who outrank the gate agreed in advance to be bound by it, and that agreement has to be made while the budget is full and nothing is on fire. Write down who may override it and what that costs; an exception process is fine, an unremarked habit is not.
- The period boundary refills the budget and explains nothing. A month that ended at 4% remaining and a month that ended at 4% remaining for a completely different reason look identical on the first of the next month, and the reset will quietly bury both. The review before the reset is the part that matters: what spent it, whether the target was right, and whether the system or the promise should change.
- Watch the size of the budget as well as the burn. 99.9% over thirty days is 43 minutes, and over one day it is 86 seconds. Teams routinely promise a monthly figure and then reason about it weekly, which is the same promise with a quarter of the room. Say the window out loud whenever you say the target, because the two together are the budget and neither alone is.
- One budget for one journey. A single availability number over every endpoint lets a healthy checkout hide a broken search, and the aggregate stays green while the thing people came for does not work. Pick the handful of user journeys that matter, give each its own SLI, and accept that some services need three budgets rather than one.

## In .NET

- Compute the SLI from the same telemetry you already emit. ASP.NET Core's built-in `http.server.request.duration` metric carries the status code and the route as tags, so the good-rate is a ratio over one counter rather than a new pipeline. Decide what "good" means once — this excludes 4xx, because a client sending a malformed request is not the service failing — and keep that definition next to the SLO.

```csharp
// The metric the SLI is computed from: served requests, tagged with status and route.
// 5xx is the service failing; 4xx is the caller, and does not spend budget.
builder.Services.AddOpenTelemetry().WithMetrics(metrics => metrics
    .AddAspNetCoreInstrumentation()
    .AddOtlpExporter());
```

The SLI itself is a query over that metric rather than a line of C#, and it belongs written down next to the target it is compared against. In PromQL, the good share over the window is:

```text
sum(rate(http_server_request_duration_seconds_count{http_response_status_code!~"5.."}[30d]))
  / sum(rate(http_server_request_duration_seconds_count[30d]))
```

- Put the target and the window in configuration, not in a query. The budget is `1 - SLO` over a stated window, and every alert threshold is a multiple of it, so writing the target once means the alerts move when the promise does.

```csharp
public sealed record ReliabilityTarget(double Slo, TimeSpan Window)
{
    // 99.9% over 30 days is 43.2 minutes of failure, funded in advance.
    public TimeSpan Budget => Window * (1 - Slo);

    // A burn rate of 1 spends exactly the budget over exactly the window.
    public double BurnRate(double goodRatio) => (1 - goodRatio) / (1 - Slo);
}
```

- Shape the alert as two windows, not one. In Azure Monitor a metric alert rule with a short evaluation frequency over a long aggregation granularity gives the long window, and a second rule with both short gives the confirming one; the pair fires only when the slow signal and the fast signal agree. Model the fast rule on a burn rate around 14 over an hour and the slow one around 6 over six hours, then tune the multiples against a month of real traffic before anybody's phone is attached to them.
- Read the budget from the pipeline rather than from a person. An Azure Pipelines gate, a GitHub Actions job or a deployment ring check can query the metric and fail the stage, which is what makes the freeze real. Keep the check cheap and the failure message specific: the number, the window, and the threshold it crossed.

```csharp
// A release gate: the deployment stage fails when the budget is spent.
var remaining = 1 - spentMinutes / target.Budget.TotalMinutes;
if (remaining < 0.10)
{
    Console.Error.WriteLine(
        $"error budget {remaining:P0} remaining over {target.Window.TotalDays:N0} days; releases are frozen");
    return 1;
}
```

- Availability tests give you an SLI for the endpoints nobody exercises. A standard test in Application Insights runs from several regions on a schedule and records success and duration, which is exactly the measurement a client would make and the one your server-side metrics cannot produce. It is the cheapest way to notice that the service is unreachable rather than merely unhappy.
- Health checks are not an SLI. `AddHealthChecks` answers "should this instance receive traffic", which is a question about one process at one instant; the budget is a question about what users got over a month. Wire both, keep them apart, and never compute availability from readiness results — an instance that was correctly taken out of rotation did not fail anybody.
