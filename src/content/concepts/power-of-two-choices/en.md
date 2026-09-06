---
title: "Power of Two Choices"
summary: "Power of two choices samples two servers at random and sends the request to whichever is less busy. It is a probabilistic stand-in for least connections that needs no global view, and the second sample is where almost all of the benefit comes from."
category: "Edge, routing and service networking"
level: 6
scene: load-balancer
sceneStep: 2
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Round Robin
    slug: round-robin
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
---

The scene's second step is round robin sending work to a server that is already holding three slow requests, and the answer it offers is to look at what is in flight and send the next request where there is room. Least connections is that answer stated exactly, and its page owns the full comparison and everything that follows from measuring every destination. This page is about the version that stops short on purpose: pick two destinations at random, compare only those two, and send the request to the one holding fewer. It is the default policy in YARP and the algorithm behind Envoy's `LEAST_REQUEST`, it is common in large deployments, and it is worth understanding why an approximation is preferred over the thing it approximates.

The first reason is cost, and it is the easier one. An exact policy needs a count for every destination that is both current and consistent at the moment of the decision, which is affordable over five destinations in one process and much less so over a few hundred behind several proxy instances. Reading two entries is constant work regardless of how large the pool is, so the decision does not get more expensive as the fleet grows, and nothing needs to be aggregated, published or kept fresh between balancers.

The second reason is the interesting one, because it is about correctness of behaviour rather than expense. Always choosing the global minimum sounds ideal and behaves badly the moment more than one chooser exists. Every balancer looking at the same counts in the same instant identifies the same idlest server and sends it everything, so the idlest becomes the busiest, the next round sends everything somewhere else, and load oscillates instead of settling. The same herd forms whenever a fresh instance joins with a count of zero. Randomising which two destinations are even eligible breaks the correlation: two balancers deciding at the same moment are very unlikely to be looking at the same pair, so their choices stop reinforcing each other and the pool fills smoothly.

What makes the trick work rather than merely be cheap is how much the second sample buys. Choosing one destination at random leaves the busiest server's load growing roughly with the logarithm of the pool size; taking the better of two independent samples reduces that to something closer to the logarithm of the logarithm, which is an enormous improvement for one extra lookup. Sampling three or more improves it again only by a small constant, so two is where the curve flattens and where implementations stop. The practical consequence is that this is not a policy you reach for when you want accuracy — it deliberately does not find the least loaded server, and on a small pool with uniform work it is indistinguishable from round robin. Its value shows up exactly where least connections is attractive and expensive: many destinations, uneven request costs, several balancers, and no appetite for shared state between them. The cautions that apply to counting in-flight requests apply here unchanged, including the one that matters most, that a server failing instantly looks idle and will win every comparison it enters until a health check removes it.
