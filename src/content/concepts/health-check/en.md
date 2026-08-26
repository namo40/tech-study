---
title: "Health Check"
summary: "A health check is a small endpoint a supervisor calls on a schedule to decide something about the instance behind it. The mechanism is always the same: ask, wait, count the answer. What differs, and what matters, is which question you asked and what the caller does with the answer."
category: "Containers and orchestration"
scene: readiness-probe
sceneStep: 1
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

The first step of the scene shows the skeleton every health check is built on, and it has only four parts: a schedule, a timeout, a threshold, and something that acts on the verdict. A supervisor asks every couple of seconds, gives the answer a moment to arrive, counts consecutive refusals, and once the count reaches the threshold it does whatever it was configured to do. Nothing about that skeleton is specific to Kubernetes. A load balancer polling a backend pool, a service registry expiring a stale entry, a cluster manager watching a leader: all of them are the same loop with a different verb at the end.

Which is why the interesting question is never how to write the endpoint. It is what the endpoint should answer, and there are only really two answers worth distinguishing. One is about the process: is it still there, is it still able to run code at all. The other is about the service: can it usefully handle a request at this moment. They come apart constantly, and every serious probe bug is a case of one being asked when the other was meant. A pod filling a cache is alive and not able to serve. A pod whose database is unreachable is often able to serve some things and not others. A pod deadlocked on a lock is neither.

The threshold is the part people leave at its default and then find surprising. A single failed sample is almost never worth acting on, because a dropped packet, a garbage collection pause, or a probe that landed during a redeploy all look identical to a real fault at one sample. So supervisors count: three refusals in a row, five, whatever you set. The cost is that the reaction is late by the threshold times the period, and during that window the supervisor is still acting on stale information. In the scene, traffic keeps arriving at a pod for the whole of that window, which is exactly what happens in production and exactly why the numbers are worth choosing rather than inheriting.

The timeout deserves the same attention. A check with no timeout, or with a timeout longer than the period, turns a slow dependency into a queue of overlapping probes, and an instance that was merely slow becomes an instance that is also being hammered by its own supervisor. Give the check a deadline shorter than the interval, and make the check itself honour that deadline internally rather than relying on the caller to hang up.

Keep the check cheap, and keep it honest about what it touched. Cheap, because it runs on every instance several times a second forever: a check that opens a connection, runs a query and serialises a report is a background load generator that grows with your fleet. Honest, because a check that returns healthy without looking at anything is worse than no check at all. It gives the supervisor confidence it has not earned, and the failure it hides will surface as errors to users rather than as an instance quietly leaving the pool.

Finally, treat the check as an interface with a contract, not as a debugging page. It has one consumer, it is called by a machine, and its whole vocabulary is a status code. Detail belongs in logs and metrics where a human can read it; the endpoint that a supervisor polls should stay small enough to reason about, cheap enough to ignore, and specific enough that when it says no, you know which of the two questions it was answering.
