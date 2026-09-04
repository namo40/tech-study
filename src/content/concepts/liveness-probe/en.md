---
title: "Liveness Probe"
summary: "A liveness probe is the check whose answer is a restart: it asks whether the process should keep existing at all, and when it has been refused enough times in a row the kubelet kills the container and starts it again. That is a violent remedy, which is why it should only ever ask about the process itself."
category: "Containers and orchestration"
tags: ["kubernetes"]
scene: readiness-probe
sceneStep: 3
related:
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Load Balancer
    slug: load-balancer
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Connection Draining
    slug: connection-draining
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

The third step of the scene is the whole of it. A process stops answering, the liveness lane fills with refusals, and at the third one in a row the kubelet kills the container and starts it again. The restart counter ticks, the pod says `restarting`, then `starting`, and readiness holds traffic off the fresh instance until it has passed once. Every part of that sequence is worth reading, but the important part is the first: the only thing liveness ever concludes is that this process cannot be rescued by waiting.

That is the test to apply to any liveness check you are about to write. Would a restart fix the condition this check is about to report? A thread pool deadlock, an event loop wedged on a lock, a native heap corrupted past recovery, a state machine that has reached a state it cannot leave: those are all conditions where the process is running, will keep running, and will never make progress again, and killing it is genuinely the shortest path back. A database that is refusing connections is not one of those. Nor is a queue that has grown, a downstream service that is slow, or a certificate that has expired. In every one of those cases the process is fine and the restart accomplishes nothing except a cold start.

The fourth step of the scene shows what happens when that line is crossed, and it is worse than merely useless. Point liveness at a shared dependency and you have wired every replica to the same trigger. The dependency blips, every pod fails its liveness check at once, and the whole fleet restarts simultaneously: capacity goes to zero, every cache is cold, every connection pool re-opens against the dependency that was already struggling, and the restarts continue for as long as the dependency is unwell. It is an outage that the platform manufactured out of a hiccup, and the same blip after the wire is moved to readiness produces nothing worse than a few pods sitting quietly out of rotation.

Slow starts are the other classic way to get this wrong. A process that takes ninety seconds to boot will be killed by a liveness probe tuned for a healthy steady state, and it will be killed again on the next attempt, and the pod will sit in a crash loop that looks like a broken image. The temptation is to relax the liveness probe until the boot fits inside it, but a probe generous enough for a ninety second boot is also generous enough to leave a genuinely hung process running for ninety seconds. A startup probe is the right answer: it gets its own generous budget, liveness does not start until it passes, and each probe keeps the settings that suit it.

Keep the endpoint trivial. `/healthz/live` should touch nothing but the process: no database, no cache, no outbound call, no dependency injection graph that might block. In ASP.NET Core that means a check tagged for liveness that returns healthy unconditionally, or one that reads a flag some background component sets when it knows it has become stuck. The value is not in what such a check reports; it is that the request was served at all, which proves the host is still accepting connections and still running code.

Finally, watch the restart counter as a signal in its own right. Restarts that climb steadily are the platform telling you it keeps trying a remedy that is not working, and the fix is almost never a longer threshold. Either the process really is wedging, in which case the bug is upstream of the probe, or the probe is answering a question that was never liveness. The scene ends with the counter flat and the pods running: after the wire is moved, the same outage that used to restart everything only takes the pods out of rotation, and they come back the moment the dependency does.
