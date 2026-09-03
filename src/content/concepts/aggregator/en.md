---
title: "Aggregator"
summary: "An aggregator is the component that fans a request out to several services and joins the answers into one. The join is where the latency arithmetic turns against you: the caller waits for the slowest branch, so the aggregator's job is deciding what to do about that branch rather than making it faster."
category: "Requirements and quality attributes"
tags: ["latency"]
scene: tail-latency
sceneStep: 2
related:
  - label: Tail Latency
    slug: tail-latency
  - label: Hedging
    slug: hedging
  - label: p99
    slug: p99
  - label: Request Timeout
    slug: request-timeout
  - label: gRPC
    slug: grpc
references:
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

The scene's second step is the page that makes ten calls and waits for the slowest one, and the aggregator is the thing standing at that join. Its arithmetic is the uncomfortable part. Its own latency is not the average of its branches and not their sum if it calls them in parallel; it is their maximum, and a maximum is drawn from the tail of every branch at once. Ten branches whose slow tail is one percent give roughly one page in ten a slow branch to wait for, which is why a fan-out turns a service's p99 into a page's typical experience. The parent page owns that observation. What is left, and what this page is about, is that the join point is also the only place in the system with enough information to do something about it, because it is the only place that can see all the branches at the same time.

The first lever is admitting that the response can be incomplete. A slow branch is an outcome the aggregator has to have a plan for, and the plan is either wait, fail, or return without it, so the design work is deciding which branches are load-bearing and which are decoration. A product page needs its price and its title and can render honestly without its recommendation strip; a checkout total cannot be assembled from three of its four components. That decision has to reach the response contract: a partial answer needs a shape that says which parts are missing, so the caller can retry the gap, hide the section, or show something in its place rather than treating a null as data. A cached previous value for an optional branch is often better than either waiting or a hole, and it belongs at the join because that is where the missing piece is noticed.

The second lever is a budget shared across the whole fan-out. Give each branch its own timeout and you have given the aggregator a worst case equal to the largest of them plus everything it does afterwards, with no relationship to what the caller is prepared to wait. The discipline is one deadline for the request, established when it arrives, propagated to every branch, and reduced by the time already spent, so a slow first phase shortens the second rather than pushing the total past the limit. Branches that are still running when the deadline passes are cancelled, not abandoned, or the work continues to occupy the downstream service after nobody is waiting for it. gRPC carries a deadline on the call for exactly this reason, and the equivalent in .NET is passing one cancellation token, derived from the incoming request's, down every branch.

Two habits at the join are worth naming. Fan-out is amplification: one inbound request becomes ten outbound, so an aggregator sized for its own traffic is a load multiplier on everything below it, and a retry policy at this layer multiplies again at exactly the moment the downstream is least able to absorb it. Where the same branch is called repeatedly with different keys, a batch endpoint that takes all the keys at once removes both the amplification and most of the tail exposure, because there is one branch to be slow instead of ten. And when a branch's tail is the problem rather than its median, hedging is the technique aimed precisely at that, with its own page and its own cautions about the load it adds.
