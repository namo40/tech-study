---
title: "Service Discovery"
summary: "Service discovery is how a caller turns a service's name into an address it can actually connect to. Either the caller reads the current list of instances from a registry or from DNS and picks one, or something standing in front of the service picks for it."
category: "Edge, routing and service networking"
tags: ["kubernetes"]
level: 5
related:
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Sidecar
    slug: sidecar
  - label: Health Check
    slug: health-check
  - label: Readiness Probe
    slug: readiness-probe
  - label: YARP
    slug: yarp
references:
  - title: "Service discovery in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/service-discovery
  - title: "DNS for Services and Pods"
    url: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - title: "Service"
    url: https://kubernetes.io/docs/concepts/services-networking/service/
---

## When to use

- As soon as the set of instances behind a name stops being fixed. Deploys replace pods, autoscaling adds and removes them, and a drained node takes several away at once, so an IP address written into configuration is a fact with an expiry date on it. Service discovery replaces the address with a name and moves the question of which instance is answering right now to something that watches the set.
- Client-side discovery, when the caller should do the choosing. The caller asks a registry or DNS for the current list and picks an instance itself: one network hop rather than two, and a policy each caller can vary — prefer its own zone, retry on a different instance, skip the one that has been slow. The cost is that every caller now carries a client, a cache and a policy, in every language the fleet speaks.
- Server-side discovery, when you would rather no caller chose anything. The caller connects to one stable address and the load balancer, reverse proxy or Kubernetes Service behind it picks the instance. Nothing is installed in the caller and the policy lives in one place, at the price of an extra hop and one more component that can be down.
- In Kubernetes both halves already exist, and rebuilding them is the commonest waste. A Service is a stable name and virtual IP in front of the pods its selector matches, and cluster DNS resolves `catalog.shop.svc.cluster.local` to it: server-side discovery with nothing to install. A headless Service (`clusterIP: None`) resolves to the pod addresses instead, which hands the list to a caller that wants to choose. And a named port gets an SRV record, `_grpc._tcp.catalog.shop.svc.cluster.local`, carrying the port number as well, so a client can find an endpoint whose port it does not already know.
- Not when the address is genuinely stable. A managed database with one endpoint, a third-party API behind somebody else's DNS, an instance sitting behind an address the platform already keeps stable: a name in configuration is all the indirection those need, and a registry in front of them is a component with no job.

## Cautions

- Every answer is a cache with a lifetime on it. The registry client holds a list, the resolver holds the record until its TTL expires, and the connection pool holds an open socket to an address it resolved once. An instance that stopped answering two seconds ago is still in all three, so the question is never whether the list is correct but how stale it is allowed to get and what happens to the requests that land in that window. Retry against another instance, and keep the window short enough that the retry finds one.
- Registering is easy; deregistering is where it rots. A registry that only ever hears about arrivals fills up with the addresses of processes that crashed, were OOM-killed, or were replaced mid-deploy, because none of those got to say goodbye. The set has to be pruned by something that watches the instance rather than by the instance's own courtesy: a lease that expires unless it is renewed, or a health check the registry runs itself.
- Being registered is not the same as being ready to serve. Kubernetes ties the two together deliberately — only ready endpoints go into a Service, so a failing readiness probe takes a pod out of DNS and out of the balancer's set without deleting anything — and that link is exactly what a hand-rolled registry leaves out. A probe that answers 200 while the process is up but its dependencies are not puts a pod back into the set to fail every request it is handed.
- `HttpClient` resolves a name when it opens a connection and never again for that connection, and it does not honour the record's TTL. A long-lived client that has already pooled a connection to a dead address keeps handing requests to it. Set `PooledConnectionLifetime` on the `SocketsHttpHandler` so connections retire on a schedule and the name is resolved again; the value is a bet on how often endpoints move, not a constant to copy.
- The registry is now on the path of every first request. If it is unreachable nothing can find anything, and a discovery outage reads as a total outage rather than one service's. Serve from the last good answer instead of failing closed, run more than one replica of it, and prefer the platform's own mechanism where there is one: cluster DNS is already replicated and already load-bearing for everything else in the cluster.

## In .NET

`Microsoft.Extensions.ServiceDiscovery`, the library behind Aspire's service references, does one small thing: it lets an `HttpClient` hold a logical name where the host would normally go, and turns that name into a real endpoint on the way out. `AddServiceDiscovery` registers the providers, and a call on the client builder is what opts a particular client in.

```csharp
// The default endpoint providers: configuration first, then the pass-through
// provider that hands the name back unchanged as a DNS name.
builder.Services.AddServiceDiscovery();

// The address is a service name, not a host. "https+http" means: resolve the
// HTTPS endpoints, and fall back to HTTP only when there are none.
builder.Services.AddHttpClient<CatalogClient>(static client =>
    {
        client.BaseAddress = new Uri("https+http://catalog");
    })
    .AddServiceDiscovery();

// Or opt every client in at once, and retire pooled connections on a schedule
// so a moved endpoint is resolved again instead of being held open.
builder.Services.ConfigureHttpClientDefaults(http =>
{
    http.AddServiceDiscovery();
    http.ConfigurePrimaryHttpMessageHandler(static () =>
        new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) });
});
```

The configuration provider reads the endpoints out of `IConfiguration`, so the list for `catalog` is ordinary settings under `Services:catalog:https`, where `Services:catalog:https:0` is the first of them. It can arrive from `appsettings.json`, from environment variables, or from an Aspire AppHost that already knows where it started the service.

```json
{
  "Services": {
    "catalog": {
      "https": [
        "catalog-1.internal:8443",
        "catalog-2.internal:8443"
      ]
    }
  }
}
```

In a cluster you usually configure none of that. The pass-through provider that `AddServiceDiscovery` also installs returns the name unchanged as a `DnsEndPoint`, so `https://catalog` is resolved by cluster DNS against the `catalog` Service and the platform does the discovering. That is the point of the exercise: the same code, unmodified, resolves through configuration on a laptop and through the Service in the cluster. The DNS SRV provider is the exception, for named ports on a headless Service, and it goes on top of the core registration rather than the default one.

```csharp
// Package: Microsoft.Extensions.ServiceDiscovery.Dns. AddServiceDiscoveryCore
// registers the machinery without the default providers, so SRV is the only
// one asked. "https://_dashboard.catalog" then resolves the SRV record for the
// port named "dashboard" on the "catalog" service.
builder.Services.AddServiceDiscoveryCore();
builder.Services.AddDnsSrvServiceEndpointProvider();
```

Whichever provider answers, the cautions above stay the application's own. `PooledConnectionLifetime` is what stops a resolved endpoint outliving the instance behind it, and a readiness endpoint that answers for the dependencies the service needs is what keeps this instance out of the set while it cannot serve. Discovery decides which addresses exist; readiness decides which of them deserve traffic.
