---
title: "Shadow Deployment"
summary: "A shadow deployment answers a copy of production traffic into the void: real requests prove the new version's behaviour and capacity while users only ever see the old one — as long as its side effects are caged by configuration and its answers are compared rather than served."
category: "Containers and orchestration"
tags: ["deployment"]
level: 5
scene: shadow-deployment
steps:
  - title: "Synthetic load never knows the shape of the real thing"
    text: "The ghost sails through staging — clean inputs, even pacing — then meets production: the long tail, the weird encodings, the Monday spike. The test was honest; the traffic in it was not. Fix the traffic: prove the new version against a copy of the real thing."
  - title: "The copy goes to the shadow; the answer goes to the user"
    text: "Every real request is served by the live version as always, and its twin is replayed against the new one, whose answer falls into a comparator instead of a socket. Real inputs, real volume, real timing, zero user impact: nobody is graded but the code."
  - title: "The shadow's side effects go in a cage"
    text: "It runs real code against real inputs, so it will try to write and send — both must hit a wall: read-only stores, suppressed mail. The cage is configuration, not a fork: one build, split by settings. An uncaged shadow emails customers twice."
  - title: "The comparison is the report card; promotion is graduation"
    text: "Every mismatch is a bug found on real traffic that no user ever saw — investigate, fix, and let the matches accumulate again. Promote it and the cage comes down with the settings: its next write lands for real."
related:
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rollback
    slug: rollback
  - label: Feature Flag
    slug: feature-flag
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: External Configuration
    slug: external-configuration
  - label: Secret Injection
    slug: secret-injection
  - label: Configuration
    slug: configuration
references:
  - title: Shadow Testing
    url: https://microsoft.github.io/code-with-engineering-playbook/automated-testing/shadow-testing/
  - title: Mirroring
    url: https://istio.io/latest/docs/tasks/traffic-management/mirroring/
  - title: Dark Launching
    url: https://martinfowler.com/bliki/DarkLaunching.html
---

## When to use

- Reach for it when the change is large enough that staging cannot tell you whether it works. A new storage engine, a framework port, a rewritten pricing rule: the code is meant to behave identically and the only honest way to find out is to run it against the inputs the old one is getting. A shadow deployment is not another test environment, it is the real inputs pointed at a second copy of the service, and the answers compared.
- Use it when the question is capacity rather than correctness. "Can v2 hold production volume?" is a question with exactly one trustworthy source of volume, and a mirrored stream gives you the real arrival pattern, the real key distribution and the real payload sizes instead of a generator's idea of them. It does not replace a load test or a capacity test, though: those let you push past today's traffic on purpose, and a shadow only ever shows you what is happening now. Use them together, and let the shadow be the thing that says your synthetic model was wrong.
- Use it for a long bake before a flag flip. A canary shows a small slice of real users the new code; a shadow shows nobody. That makes it the step before a canary rather than a competitor to one, and it is the only step where a serious bug costs you a diff in a report instead of an apology. Run it for days or weeks, and the promotion afterwards is uneventful because the version has already been doing the work.
- Start with read-heavy services, because they are the cheapest to cage. A search endpoint, a pricing calculation, a recommendation call: the shadow can run the real path with almost nothing to suppress. The more a service writes, charges and notifies, the more configuration you need before the first copy is safe to send, and the more careful the audit below has to be.
- It pays off most where behaviour is hard to specify but easy to compare. If you cannot write down what the answer should be, you can still say it should be what the current version says, and a comparator turns that into a measurable property over millions of real requests.

## Cautions

- Side effects are the whole danger, and the audit comes before the first mirrored request, not after it. Sit down with the service and list everything it emits — rows written, payments taken, mail and push sent, webhooks fired, messages published, downstream services called — and decide for each one whether it is suppressed, mocked, or pointed at a double. Only when that list is closed do you turn mirroring on. Doing it in the other order means finding out what your service emits by watching it emit twice.
- Configuration is what does the caging, not a branch. The shadow must be the same artefact you intend to promote, or you have proved something about a build that will never run. Feature flags off, the mail sender swapped for a no-op, connection strings pointed at a read replica, payment gateway pointed at its sandbox: all of it comes from settings applied at start-up, so the thing you promote is exactly the thing you tested.
- The doubled load is real and somebody pays for it. Mirroring doubles the read traffic on every shared dependency, so the database, the cache and every downstream service now serve twice as much. Either size for that, or give the shadow its own data path — a replica, its own cache — and accept that the two versions are then reading slightly different data, which is itself a source of diffs.
- Comparison needs normalisation or the diffs drown in noise. Timestamps, generated ids, request-scoped counters, map iteration order and floating-point formatting will differ on every single request, and a comparator that reports all of them reports nothing. Normalise the known-volatile fields, compare structurally rather than byte for byte, and treat the noise budget as part of the design: a diff rate you cannot bring near zero is a comparator problem, not a code problem.
- Mirrored traffic carries real user data into a code path that is not serving anybody, which does not make it less real. The shadow sees the same personal data, the same tokens and the same request bodies as production, so it needs production's access controls, production's log redaction, production's retention rules and production's place in your data map. Treat it as production for privacy and access purposes, because that is what it is.
- Full mirroring is not always affordable. Sampling is the usual answer — a fixed percentage, or everything from a subset of tenants — and 10% of production traffic is still enormously more representative than a generator. Sample deliberately, though: a uniform sample under-represents rare request shapes, which is exactly the class of input a shadow is best at finding bugs in.
- Anything the shadow is allowed to touch should be safe to touch twice. The same request is now processed by two versions, so a shared queue consumer, a counter, or an idempotency key written by both is a duplicate waiting to happen. This is the idempotent-consumer discipline applied to a second reader, and it is the reason "point it at a double" is safer advice than "let it write, we will clean up".
- A shadow proves the answers match, not that the new version is good. It cannot tell you the old behaviour was correct, it cannot see anything about requests that nobody is sending yet, and it will happily confirm that two versions are wrong in identical ways. It is a regression net of extraordinary quality and nothing else.

## In .NET

At the edge, mirroring is usually a mesh concern. Istio and Envoy will send a copy of a route's traffic to a second destination and drop the response, so the application never sees the fork:

```yaml
# The copy is fire-and-forget: the caller is answered by `live` and never waits
# for `shadow`, so a slow or failing shadow cannot become a user's problem.
http:
  - route:
      - destination: { host: checkout, subset: live }
    mirror: { host: checkout, subset: shadow }
    mirrorPercentage: { value: 10.0 }
```

Without a mesh, a small piece of middleware in front of the proxy — YARP or otherwise — can clone the request; YARP has no mirroring of its own to turn on. The clone is buffered and dispatched separately, so the user's response is never held up by it:

```csharp
app.Use(async (context, next) =>
{
    context.Request.EnableBuffering();
    var copy = await ShadowRequest.CaptureAsync(context.Request);
    context.Request.Body.Position = 0;

    // The user's call carries on immediately. The copy is fired at the shadow
    // and its answer goes to the comparator, never back to this response.
    // `ShadowRequest` and `shadow` are yours to write, and nothing inside them
    // may touch `context` after this line, because the request may already be
    // over. Nobody awaits the task either, so it has to log its own failures.
    _ = shadow.SendAndCompareAsync(copy, context.TraceIdentifier);
    await next(context);
});
```

The cage itself is ordinary configuration, read once at start-up from whatever the environment supplies:

```csharp
var role = builder.Configuration["Deployment:Role"];   // "live" or "shadow"
var caged = role == "shadow";

// One build, two environments. Nothing below is a compile-time difference.
builder.Services.AddSingleton<IMailSender>(sp =>
    caged ? new NoOpMailSender() : sp.GetRequiredService<SmtpMailSender>());
builder.Services.AddDbContext<ShopContext>(o =>
    o.UseSqlServer(builder.Configuration[caged ? "Db:ReadReplica" : "Db:Primary"]));
builder.Services.Configure<PaymentOptions>(
    builder.Configuration.GetSection(caged ? "Payments:Sandbox" : "Payments:Live"));
```

The comparator is the part worth writing carefully, because it decides whether the whole exercise produces a signal or a wall of noise. Normalise both answers before comparing them, key every comparison by the correlation id the two calls share, and record the mismatches with enough of the request to reproduce them:

```csharp
static JsonNode Normalise(JsonNode answer)
{
    // Everything here differs on every request and means nothing. What is left
    // after this is the part a mismatch is actually about.
    answer["generatedAt"] = null;
    answer["requestId"] = null;
    foreach (var line in answer["lines"]!.AsArray()) line!["rowVersion"] = null;
    return answer;
}
```

Beyond that it is the usual platform furniture: `IConfiguration` and the options pattern for the split, health and readiness probes so the shadow is deployed and watched like anything else, and the same metrics and traces on both versions so the report card includes latency and error rate and not only response bodies. When the diff rate has sat at zero for long enough, promotion is a routing change, and the version taking traffic is one that has already been doing the work in the dark.
