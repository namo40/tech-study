---
title: "Connection Draining"
summary: "Connection draining is the interval between an instance being taken out of the routing table and the instance actually closing: it stops being sent new work, keeps serving what it already has, and only then goes away. The interval exists because routing tables are copies, and copies take time to catch up."
category: "Containers and orchestration"
tags: ["kubernetes", "deployment"]
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Kubernetes: EndpointSlices"
    url: https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/
  - title: "Kubernetes: pod termination"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: "ASP.NET Core: host shutdown"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/generic-host
---

Look at the gap in the third step. The pod is told to stop, and the chip for it stays lit in the endpoints list for another beat before it dims. Nothing is broken during that beat. It is simply how long it takes for the decision to reach whoever is doing the routing, and requests that arrive inside it are still sent to a pod that has already been told to go away.

That is the whole reason draining exists. The Service, the load balancer, the sidecar proxy, and every client that caches a resolved address are all holding copies of the same list, and the list is updated by a notification that travels. A pod that closes its listener the instant it receives SIGTERM is closing it while several copies still name it, and every request routed from one of those copies gets a connection refused. The failure looks like a deployment bug, because it is one, but it is not in the deployment: it is in the assumption that removal is instantaneous.

The fix is to keep serving for a little longer than you feel you should. A `preStop` hook that sleeps for a few seconds does exactly this, because Kubernetes runs the hook before it sends SIGTERM, so the container is still listening while the endpoints removal propagates. Five seconds is the usual starting point and it is not a magic number: it should be longer than the propagation time you actually observe, which on a large cluster with a busy API server is longer than on a small one.

Once the listener does close, draining is about what is already in flight. HTTP is easy, because a request either has arrived or has not, and finishing the ones that have takes as long as the slowest of them. Keep-alive connections are less easy: a connection is idle between requests, and closing it politely means sending `Connection: close` on the next response rather than dropping it mid-stream, which is what ASP.NET Core does for you when the host is stopping. What is left is the traffic that does not fit the request-response shape at all.

Long-lived connections do not drain, they expire. A WebSocket, a SignalR hub connection, and a server-streaming gRPC call are all designed to stay open, so waiting for them to finish means waiting past the grace period and then being killed anyway. The answer is to close them deliberately: on `ApplicationStopping`, send whatever the protocol's goodbye is and let the client reconnect, which it will do to a pod that is still there. A client that reconnects on its own is the difference between a deploy the user does not notice and a deploy where every open page goes quiet.

The same shape appears outside HTTP. A queue consumer drains by stopping its prefetch and acknowledging what it holds; a load balancer target group drains by moving to a draining state and waiting out a deregistration delay. In all three cases the instance is unreachable for new work before it is gone, and the interval between those two facts is the thing worth tuning.
