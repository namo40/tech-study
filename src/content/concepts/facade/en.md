---
title: "Facade"
summary: "A facade is the single front door a migration puts in front of the old system, so that where a request is actually served becomes a routing decision rather than a change the caller can see."
category: "Application architecture"
tags: ["deployment"]
level: 3
scene: strangler-fig
sceneStep: 1
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Adapter
    slug: adapter
  - label: Endpoint Routing
    slug: endpoint-routing
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Gateway Routing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-routing
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

The word here is the migration one, not the Gang of Four's: this facade is a routing layer in front of a whole system rather than an object that wraps a subsystem behind a simpler interface. On the day it goes in, it does nothing. Every route still points at the old system, every response is byte for byte what it was, and no caller has to be told anything. That is the point: the first step of a migration should be the one you can roll out on a Tuesday afternoon and roll back in a minute, because everything after it depends on the facade being boring. What it buys is a seam. Once every request enters through one place, the question "which system answers this?" has an answer written in configuration, and configuration is the cheapest thing in the building to change.

The discipline is that the facade routes and nothing else. It is very tempting to let it hold the one field the new system does not have yet, the retry the old system needs, the header rewrite for the one client that never got updated. Each of those is small, and together they are how a routing layer turns into a second system with its own deployment risk, its own bugs, and no owner. Anything shaped like business logic belongs behind the facade in whichever system owns that capability. If the two systems genuinely disagree about a model, that is a translation, and translation belongs in an anti-corruption layer on the new side rather than in the front door.

Because the facade decides where a request goes, it is also the only place that can see the migration happening. A route that has moved needs both sides instrumented until the old path is switched off: request rate, error rate and latency per route and per destination, so that "the new customers code is slower" is something you read off a chart rather than something a user tells you. And keep the routing table small enough to read. A table with one row per capability tells you at a glance how far the migration has got; a table with four hundred rules tells you nothing, and is the first sign that the facade has quietly become the thing it was built to replace.
