---
title: "Termination Grace Period"
summary: "The time a pod is given between being told to stop and being killed outright. It is a deadline rather than an allowance: whatever has not finished when it expires does not get to finish."
category: "Containers and orchestration"
tags: ["kubernetes"]
level: 3
scene: pod-disruption-budget
sceneStep: 3
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "HostOptions.ShutdownTimeout"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.hostoptions.shutdowntimeout
---

The ring in the third step of the scene is this number, and the first thing to know about it is where its clock starts. It starts when the pod is marked for deletion, not when SIGTERM arrives. The preStop hook runs inside it, the signal is sent inside it, and the application's own shutdown happens inside what is left. A grace period sized from "how long does my app take to stop" is therefore always short by the length of the hook, which is exactly the mistake that produces a service that loses one request per deployment.

The second thing is that it is a deadline and nothing softer. When it expires the container gets SIGKILL, which cannot be caught, and the process stops between two instructions: no flush, no final log line, no `finally` block, no chance to acknowledge the message it was halfway through. A shutdown that goes over its deadline is not a slow shutdown, it is a crash that happened to be scheduled. In the scene the pod finishes with time to spare and the `SIGKILL` mark appears afterwards only to show the road it did not take.

Setting it is a measurement rather than a guess, and the number to measure is the longest honest shutdown, not the average one. Add up the preStop pause, the time in-flight work needs to complete, and the time to release what is held, and then take the tail rather than the median, because the request that decides whether this works is the slow one. A workload with a p99 of two hundred milliseconds and a p999 of eight seconds needs a grace period built from the eight. The default is thirty seconds, which is generous for a stateless API and nowhere near enough for a consumer holding a long-running batch.

Inside the container, .NET's `HostOptions.ShutdownTimeout` is the same idea one level down, and the two have to be ordered. The host's timeout must sit strictly below the platform's grace period, with real margin: the application should give up on its own terms and exit tidily with seconds left, rather than being interrupted by the platform while it is still tidying. Five seconds of headroom is a reasonable starting point, and the symptom of getting the order backwards is a shutdown path that logs "stopping" and then nothing at all.

Two smaller things are easy to trip on. The value is a property of the pod, so changing it is a new rollout rather than a live edit. And a deletion may override it — `kubectl delete --grace-period=0 --force` skips the whole ritual and removes the object from the API server whether or not the process has stopped, which is a tool for a stuck node and not a way to make a deployment faster.
