---
title: "Graceful Shutdown"
summary: "A graceful shutdown is what a process does between being asked to stop and stopping: it reports itself unavailable, stops accepting new work, finishes what it already has, releases what it holds, and exits before the deadline. SIGTERM is the request; the termination grace period is the deadline."
category: "Containers and orchestration"
tags: ["kubernetes", "deployment"]
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Connection Draining
    slug: connection-draining
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Readiness Probe
    slug: readiness-probe
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Cancellation Token
    slug: cancellation-token
references:
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

The third step of the scene is the whole of it. A pod is told to stop partway through, keeps answering for a moment, finishes the requests already standing on it, and only then goes dark. `SIGTERM` and `30 s` appear together under it because they are two halves of the same sentence: stop, and you have thirty seconds to do it in.

The order inside those thirty seconds is what makes the difference between graceful and merely slow. Report unavailable first. The readiness endpoint should start failing the instant shutdown begins, because the routing table that still lists this instance is a copy somewhere else, and the sooner it is told the shorter the window in which new work arrives. Then stop accepting: close the listener, or stop pulling from the queue, but only after the first step has had a moment to take effect. Then finish what is in flight, which for an HTTP server means letting the current requests complete and for a consumer means acknowledging the messages it has already taken. Then release: connections back to the pool, leases and locks back to whoever grants them, buffered telemetry flushed. Then exit, with a zero status, before the deadline.

The deadline is not advisory. When the grace period expires the process is killed outright, so a shutdown that has not finished is a shutdown that becomes a crash, with whatever half-written state that implies. That is why the application's own shutdown timeout belongs strictly below the platform's grace period rather than above it: you want the code to give up and exit tidily with a few seconds to spare, not to be interrupted by the platform while it is still tidying.

In .NET the plumbing is mostly there already. The Generic Host handles SIGTERM, runs `ApplicationStopping`, waits for hosted services to return from `StopAsync`, and then fires `ApplicationStopped`. What you configure is `HostOptions.ShutdownTimeout`, which has defaulted to 30 seconds since .NET 8 and to five before that. Thirty is the same number as Kubernetes' default grace period, which is exactly why one of the two has to move: keep the host timeout strictly below the grace period, the way the rolling update and pod disruption budget examples do with twenty and twenty-five seconds, and make the readiness check reflect `ApplicationStopping` so the two ends line up. ASP.NET Core already stops accepting new connections and drains the ones it has, so the work left to you is the parts the framework cannot know about.

Those parts are usually background work. A `BackgroundService` receives the stopping token, and a loop that ignores it is the single most common reason a shutdown runs to the deadline. A message consumer needs to stop prefetching before it stops processing, or it will be holding messages it has no time to finish and they will be redelivered. A long job that cannot finish in thirty seconds should not be trying to: it should checkpoint what it has done and let the next instance pick it up, which is a design decision made long before the deploy.

The last thing to check is what the process does with work it could not finish. Leaving a message unacknowledged is right, because the broker will redeliver it. Leaving a lease held is wrong, because nobody else can take over until it expires. Between those two, a shutdown that releases everything it borrowed is the one that makes the restart invisible.
