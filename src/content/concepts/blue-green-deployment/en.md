---
title: "Blue-Green Deployment"
summary: "Blue-green deployment keeps two identical environments and moves traffic between them in one switch: the new version proves itself beside production, the cutover is instant, and so is the way back — as long as the database is changed with the same care."
category: "Containers and orchestration"
tags: ["deployment"]
scene: blue-green-deployment
steps:
  - title: "Two environments, one taking traffic"
    text: "Blue serves 100% while v2 is deployed to Green beside it. Green warms up, passes its health checks, even takes a smoke test — all without a single production request."
  - title: "One switch there, one switch back"
    text: "Traffic flips to Green in a single move. When errors surface, flipping back is just as instant, because Blue is still warm. Fix it and flip again. Blue-green buys the cheapest rollback there is: the old version, still running."
  - title: "A dial instead of a switch"
    text: "A canary sends 10% first and watches the error rate. Bad version? Roll back having burned only 10%. Good one? Widen to 50, then 100. The metric, not the calendar, sets the pace."
  - title: "The database does not get a Green"
    text: "Both versions share one schema, so change it in two moves: expand first, so old and new run side by side; contract later, when nothing old remains. Skip that discipline and the instant rollback from step 2 is gone."
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "Blue-green deployment of AKS clusters"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/aks/blue-green-deployment-for-aks
---

## When to use

- For releases that need an instant, practiced rollback. The old version is still running and still warm, so going back is a routing change rather than a redeploy, and it takes the same few seconds every time.
- When old and new must never serve at the same time. A rolling update mixes them by design; blue-green never does, which is the honest answer for a protocol change, a cache format that cannot be read two ways, or a background job that must not run twice.
- On a platform that already has the primitive. App Service slots, two AKS clusters behind one ingress, a weighted profile in front of two pools: if the swap is one supported operation, most of the risk in this pattern is already handled for you.
- When you want the release and the exposure to be separate decisions. Deploying to Green and moving traffic to Green are two acts, and putting a night between them is allowed.

## Cautions

- You pay for two environments during the overlap window, and the window is longer than the ceremony suggests. Green has to be up before the switch and Blue has to stay up after it, or the rollback you are paying for does not exist.
- The shared database is the actual hard part. Two environments, one schema: unless every change is expand-then-contract with a release in between, the rollback is fiction, because going back to Blue means going back to code that cannot read what Green wrote.
- Long-lived connections do not move when the routing does. WebSockets, SignalR circuits and gRPC streams stay pinned to the abandoned side, so drain them deliberately and tell the clients to reconnect rather than waiting for a timeout to do it.
- A cold Green looks like a regression. Empty caches, an unwarmed JIT and a fresh connection pool make the first minute after the flip the slowest minute of the day, and an autoscaler reacting to that can turn a good release into an incident. Warm it before you switch, not after.
- Whatever the switch touches has to be switched too. Queue consumers, scheduled jobs and outbound webhooks that both environments can run will double up unless the idle side is told to stop, and a job that runs twice is worse than a job that runs late.
- Rehearse the rollback on a day when nothing is wrong. A rollback path that has never been used is a hypothesis, and the first time you test it should not be the first time you need it.

## In .NET

On Azure App Service the pattern is a first-class feature. Deploy to the staging slot, let the warmup finish, then swap: the swap is a routing change with the application already started, and swapping back is the same operation in reverse.

```bash
az webapp deploy --resource-group shop --name shop-api --slot staging --src-path ./api.zip
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
# and the way back, which is the same command again
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
```

Warmup is what keeps the first request after the swap from being the slow one. On Windows plans `applicationInitialization` in `web.config` tells the platform which paths to hit before the slot is considered ready; on Linux plans, and as an alternative that works on either, the `WEBSITE_SWAP_WARMUP_PING_PATH` and `WEBSITE_SWAP_WARMUP_PING_STATUSES` app settings say the same thing. Either way, the slot-specific settings are the ones that must not travel with the swap.

```xml
<system.webServer>
  <applicationInitialization>
    <add initializationPage="/healthz/ready" />
    <add initializationPage="/api/catalogue?page=1" />
  </applicationInitialization>
</system.webServer>
```

The database is where the discipline lives, and EF Core will happily let you skip it. Split the change into an expand migration and a contract migration, and ship a release in between that writes both shapes and reads the new one. The expand migration adds; it never renames and never drops.

```csharp
// Expand: the new column arrives nullable, and nothing old is touched.
migrationBuilder.AddColumn<string>(
    name: "Nickname", table: "Customers", type: "nvarchar(64)", nullable: true);

// Ships in the same release: write both, read whichever is populated.
customer.Nickname = value;
customer.Name = value;                       // still written for the version that may come back
var shown = customer.Nickname ?? customer.Name;
```

Only once Blue has been retired, and no deployment you might roll back to still reads `Name`, does the contract migration ship. Applying migrations from application startup is the usual mistake here, because both environments will race to run them; generate a script or run `database update` from the pipeline as its own step.

```csharp
// Contract: a separate migration, in a later release, after the rollback window closed.
migrationBuilder.DropColumn(name: "Name", table: "Customers");
```

If the platform gives you weights rather than a swap — Azure Front Door, Traffic Manager, or a service mesh — the same two environments become a canary instead, and the switch becomes a dial. Nothing about the data rules changes; only the size of the blast radius does.
