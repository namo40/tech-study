---
title: "SIGTERM"
summary: "The signal that asks a process to stop. It is a request rather than an execution: the process is told, it decides what to finish, and only if it takes too long does something less polite arrive."
category: "Containers and orchestration"
tags: ["kubernetes"]
level: 3
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

The second step of the scene turns on a distinction that is easy to miss because both words end in the same place. SIGTERM is a request. SIGKILL is not. SIGTERM can be caught, and every runtime worth using catches it: the process is told that somebody would like it to stop, and what happens next is entirely the process's decision. SIGKILL cannot be caught, blocked or ignored, and the process does not run another instruction after it arrives.

What the platform actually does, when a pod is deleted, is send SIGTERM to PID 1 of each container. That is a detail with teeth. If your container's entrypoint is a shell script that launches the application, PID 1 is the shell, the shell does not forward signals by default, and your application never hears anything at all — it simply stops existing when the grace period runs out. `exec` in the entrypoint, or a real init as PID 1, is what makes the rest of this page apply to you.

Having caught it, the order matters more than the speed. Stop advertising yourself as ready, so the routing tables start dropping you. Stop accepting new work: close the listener, stop pulling from the queue. Finish what is already in hand, which for an HTTP server means letting the current requests complete and for a consumer means acknowledging the messages it has already taken. Release what you hold: connections back to the pool, leases and locks back to whoever grants them, buffered telemetry flushed. Then exit with a zero status. A process that exits on the first line of that list is not shutting down gracefully, it is crashing politely.

In .NET this is the host's job and it is already wired. `IHost.RunAsync` installs the handler, and when the signal arrives the `ApplicationStopping` token is cancelled, the server stops accepting, in-flight requests are awaited, and every `IHostedService.StopAsync` runs with a token bounded by `HostOptions.ShutdownTimeout`. The two mistakes are almost always the same two: a `BackgroundService` whose loop never checks its cancellation token, so it is still working when the deadline arrives; and a shutdown timeout set above the platform's grace period, which means the code that was written to finish cleanly gets killed while it is finishing cleanly.

The signal is also where a great deal of confusion about restarts comes from. Exit code 143 is 128 plus 15, which is a process that stopped because of SIGTERM; exit code 137 is 128 plus 9, which is SIGKILL. The first is a normal shutdown and usually means the platform asked. The second means either the grace period expired or the kernel's OOM killer got there first, and the difference between those two is written in the pod's events rather than in your logs, because a process killed with SIGKILL never got to write a log line about it.
