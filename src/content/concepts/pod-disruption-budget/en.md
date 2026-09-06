---
title: "Pod Disruption Budget"
summary: "A pod disruption budget limits how many pods may be voluntarily taken down at once, and each pod that does go down leaves through a ritual — preStop, SIGTERM, a grace period — so that planned maintenance never looks like an outage."
category: "Containers and orchestration"
tags: ["kubernetes", "deployment"]
level: 5
scene: pod-disruption-budget
steps:
  - title: 'The budget turns "take them down" into "one at a time"'
    text: "The drain wants two pods gone; the budget requires two ready. So exactly one eviction proceeds and the other waits — not refused, just held. Maintenance becomes a queue instead of an outage."
  - title: "Leaving is a ritual, not a power cut"
    text: "First the preStop hook: stop taking new work, drain the connections. Then SIGTERM — a request, not an execution — and the app finishes what it holds. Every step exists so that no request dies mid-flight."
  - title: "The grace period is patience with a deadline"
    text: "The app finished in time, so termination stayed graceful. Had it dawdled past the deadline, SIGKILL ends the conversation — no flush, no goodbye. Set the grace to your longest honest shutdown, not to a hopeful default."
  - title: "What the budget actually bought"
    text: "A replacement comes up, readiness returns to three, and only then does the second eviction begin. Through the whole drain, ready never dropped below two and the SLO lamp never blinked. That is the entire product: planned work that users cannot detect."
related:
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Rolling Update
    slug: rolling-update
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Health Check
    slug: health-check
references:
  - title: "Disruptions"
    url: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
  - title: "Specifying a Disruption Budget for your Application"
    url: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## When to use

- On any Deployment whose replica count exists for availability rather than for throughput. If you run three copies so that losing one is survivable, the budget is what stops the platform from taking all three, and it is the only thing that does. Nothing else in Kubernetes knows that your three pods are three copies of the same promise.
- Before the first node drain that happens while people are using the service. A drain, a cluster upgrade, a node pool rotation and an autoscaler consolidating half-empty nodes are all the same event from the workload's point of view: something outside the application decided a pod has to move. A budget is what makes that decision safe to take at two in the afternoon instead of at three in the morning.
- When the thing doing the draining is a controller rather than a person. Cluster autoscaler, Karpenter, the managed node upgrade, the descheduler: they all go through the eviction API, they all respect a budget, and none of them will ask you first. A budget is the only instruction they read.
- When you need `minAvailable` to mean something an SLO can be written against. Two of three ready is not a number a platform team invented; it is a statement about how much capacity the service can lose and still answer inside its latency objective. Write the budget from that number, not from the replica count.
- When you have more than one workload on a node and they do not degrade alike. A drain moves everything on the node at once, so the budget of the noisiest workload sets the pace for that node, and a workload with no budget at all sets no pace whatsoever.

## Cautions

- A budget only guards voluntary disruptions. A kernel panic, a failing disk, a node that loses power, an OOM kill: none of these ask the eviction API for permission, and none of them consume the budget. `minAvailable: 2` does not mean two pods will always be ready. It means the platform will not be the reason fewer than two are, which is a much smaller promise and still the one worth having.
- `minAvailable` equal to the replica count deadlocks every drain. Three replicas with `minAvailable: 3` allows zero disruptions forever, so the node drain that started your cluster upgrade blocks, retries, and blocks again, and the upgrade never finishes. The failure is quiet: nothing crashes, the drain simply never returns. `maxUnavailable: 0` is the same mistake written the other way round.
- The budget is arithmetic on a readiness count, and if readiness lies the arithmetic is worthless. A pod whose readiness probe returns 200 while it is refusing connections counts toward `minAvailable` and is doing nothing for anybody. Everything the budget protects rests on the probe being an honest answer to "can this pod serve a request right now".
- The pod is dropped from the endpoints when it is deleted, but the copies take time. The endpoint lists that name this pod live on every node in the cluster, so there is a window between "this pod is going away" and "nobody is routing to me any more". The preStop hook exists to sit in that window. Skip it and the pod stops accepting while traffic is still arriving, which is a 502 with a graceful shutdown wrapped around it.
- The grace period is a deadline, not a suggestion. When it expires the process is killed outright, so a shutdown that has not finished becomes a crash with whatever half-written state that implies. Measure the longest honest shutdown you have, including connection draining and the last slow request, and set the grace above it. Setting it from the average is how a service loses one request in a thousand at every deployment and nobody can reproduce it.
- Do not put a budget on a workload with one replica and expect it to help. One replica with `minAvailable: 1` blocks every drain; one replica with `maxUnavailable: 1` permits the only disruption there is. The budget cannot create availability that the replica count does not have, and pretending otherwise moves the outage from the pod to the upgrade.
- A budget rations disruption, it does not make disruption safe. It buys the time in which a pod can leave properly; whether the pod uses that time is the application's problem, and an application that ignores SIGTERM will drop requests at exactly the same rate with a budget as without one. The two halves only work together.

## In .NET

The host already implements most of the ritual. `IHost.RunAsync` registers a handler for SIGTERM, and when it arrives the host stops the server from accepting new connections, waits for in-flight requests, runs every `IHostedService.StopAsync`, and exits. What you configure is how long it is willing to wait.

```csharp
builder.Services.Configure<HostOptions>(options =>
{
    // Strictly below terminationGracePeriodSeconds. The application should give
    // up and exit tidily with seconds to spare, not be interrupted by the
    // platform while it is still tidying.
    options.ShutdownTimeout = TimeSpan.FromSeconds(25);
});
```

The one thing the host does not know about is your readiness endpoint, and that is the piece the budget reads: it counts pods whose `Ready` condition is true, so the arithmetic is only as good as the probe while the pod is running. Fail readiness the moment shutdown starts as well, so that routers which probe this pod directly stop sending it work — on Kubernetes the Service endpoints were already told at deletion.

```csharp
// Registered as the readiness probe's target. It answers "route to me", which
// is a different question from "am I alive": a pod that is finishing its last
// requests is healthy and must not be routed to.
var shuttingDown = new CancellationTokenSource();
app.Lifetime.ApplicationStopping.Register(() => shuttingDown.Cancel());

app.MapGet("/healthz/ready", () =>
    shuttingDown.IsCancellationRequested ? Results.StatusCode(503) : Results.Ok());
```

`ApplicationStopping` fires when SIGTERM arrives and before the server stops accepting, which is the only place this check belongs. `ApplicationStopped` fires after everything has finished and is where you flush what nobody will ask for again.

```csharp
public sealed class OutboxPump(IHostApplicationLifetime lifetime) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        try
        {
            while (!stopping.IsCancellationRequested)
            {
                // The token is cancelled by the host on SIGTERM. A loop that
                // ignores it is a loop the grace period will kill mid-write.
                await PumpOnceAsync(stopping);
                await Task.Delay(TimeSpan.FromSeconds(1), stopping);
            }
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            // The cancellation nearly always lands inside the delay, and it
            // arrives as an exception. Without this the drain below never runs.
        }

        // Not `stopping` — that one is already cancelled. Finishing what is in
        // hand is what the grace period is for.
        await DrainAsync(CancellationToken.None);
    }
}
```

On the platform side the budget is four lines, and the pod spec is where the ritual gets its timings. The preStop sleep is not a hack: the endpoint lists started dropping this pod the moment it was deleted, and the sleep is the window in which those copies catch up.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2          # of three replicas, so one eviction at a time
  selector:
    matchLabels:
      app: api
---
spec:
  template:
    spec:
      # Covers the preStop sleep, the in-flight requests and the host's own
      # shutdown timeout, with room left over.
      terminationGracePeriodSeconds: 45
      containers:
        - name: api
          lifecycle:
            preStop:
              exec:
                # The deletion already marked this pod's endpoint terminating;
                # this is the pause that lets every routing table hear about it
                # before the listener closes. Nothing else happens in it.
                command: ["/bin/sleep", "10"]
          readinessProbe:
            httpGet: { path: /healthz/ready, port: 8080 }
            periodSeconds: 2
            failureThreshold: 2
```

The three numbers have to be read together. The endpoints change starts at deletion, the hook holds the pod for ten seconds while it propagates, the host then has up to twenty-five to finish, and the platform allows forty-five before it stops asking. Readiness only turns 503 when SIGTERM arrives at the end of the hook, which is early enough for a router that probes the pod itself; if you need it to fail while the hook is still running, the hook has to signal the application — touch a file it watches, call a local endpoint — instead of sleeping. Change any one of them and check the other two, because the only symptom of getting it wrong is a small number of requests that fail during deployments and never fail anywhere else.

Finally, check the budget before you trust it. `kubectl get pdb` reports what the cluster currently believes, and `ALLOWED DISRUPTIONS: 0` on a healthy-looking service is the deadlock above, waiting for someone to start an upgrade.

```bash
# ALLOWED DISRUPTIONS is the number that matters: it is `currentHealthy` minus
# `desiredHealthy`, recomputed continuously, and it is what an evicting
# controller reads before it takes anything.
kubectl get pdb api -o wide
```
