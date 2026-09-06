---
title: "Pre-Stop Hook"
summary: "A command the platform runs inside the container immediately before SIGTERM. It exists to hold the pod still while the routing tables that still name it catch up, which is the one thing the application cannot do for itself."
category: "Containers and orchestration"
tags: ["kubernetes"]
level: 4
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Container Lifecycle Hooks"
    url: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/
  - title: "Attach Handlers to Container Lifecycle Events"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/attach-handler-lifecycle-event/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
---

The hook runs first, before the signal, and it is the only part of the ritual the application does not perform on itself. When a pod is marked for deletion two things start at once and they do not finish at the same speed. The kubelet on this node begins terminating the container, and the endpoint controller begins removing this pod from every Service that names it. The second one is a broadcast to every node in the cluster, and until it lands somewhere out there is a kube-proxy or an ingress that still believes this pod is a good place to send a request.

The hook is the pause that lets the broadcast win the race. In the scene it is the stretch where the pod's badge reads `preStop` and its `req` count is falling: no new work is arriving, because the deletion has already marked this pod's endpoint as terminating and the routing tables are dropping it one by one, and the requests it already had are draining away. Nothing clever happens in it. The overwhelmingly common implementation is a sleep, and that is not a workaround for a missing feature — it is the feature. There is no event the pod can subscribe to that says "every routing table has heard about me now", so a pause long enough to cover the propagation is the honest answer.

Two things about the timing are worth writing down. The hook is synchronous: SIGTERM is not sent until it returns, so its duration is spent from the same budget as everything after it. `terminationGracePeriodSeconds` has to cover the hook plus the shutdown, and a hook that sleeps for the whole grace period leaves the application no time at all and turns a graceful shutdown into a SIGKILL. And the hook's clock starts at deletion, not at SIGTERM, which is why a grace period computed only from how long the app takes to finish is always a little short.

The hook is also not a substitute for handling SIGTERM, and it is not a place to do work. It runs in the container, so a `sleep` needs a shell or a binary that provides one, which distroless images famously do not; `sleep` is a hook type of its own, beta and on by default from Kubernetes 1.30 and stable since 1.32, and it needs neither. Failures are logged as an event and then ignored, so a hook that exits non-zero degrades quietly into no hook at all. If you find yourself flushing buffers or deregistering from a service registry in there, move it into `ApplicationStopping` where you can see the errors, and leave the hook doing the one thing only the platform's ordering makes possible: standing still.
