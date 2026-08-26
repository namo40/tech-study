---
title: "Anti-Corruption Layer"
summary: "An anti-corruption layer is the translation a new system puts between itself and the old model it still has to read, so that the old model stops at the boundary instead of spreading into the code that was meant to replace it."
category: "Application architecture"
tags: ["deployment"]
scene: strangler-fig
sceneStep: 2
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Bounded Context
    slug: bounded-context
  - label: Database per Service
    slug: database-per-service
  - label: Modular Monolith
    slug: modular-monolith
references:
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Domain analysis for microservices
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
---

Halfway through a migration the new code needs something it does not own yet. Customers has moved; orders has not, and a customer page has to show the last three orders. There are two ways to get them. One is to read the old tables directly, map the row into whatever the new code wanted, and move on. That works on the first afternoon and is the single most reliable way to lose the migration: within a month the old schema's nullable columns, its status codes, its "this field means something different for accounts created before 2016" are all load-bearing inside the new system, and the new system is now a second copy of the old one with better formatting. The other way is a layer whose entire job is to speak both languages and let neither of them through.

What that looks like in practice is a small, boring, explicitly owned module on the new side: an interface written in the new system's own vocabulary, one implementation that calls the old system, and a mapping that is allowed to be ugly because it is quarantined. Call the old system through whatever door it already has — an API, a stored procedure, a read replica, a nightly extract — and treat that call the way you would treat any other network dependency: a timeout, a limited number of retries, a fallback when it is not answering. It is also the natural place for the fixes that have no home anywhere else, such as reading a status the old system spells in three ways and returning the one the new system understands.

The last property is the one people forget: an anti-corruption layer is meant to die. It exists because a capability's data has not moved yet, and it should be deleted the day that data does. Give each one an owner and a written expectation of when it goes, and watch the traffic through it: a layer whose call rate never falls is a migration that has stalled. Keeping ownership straight is what makes deletion possible, so decide before you move a capability which system owns its data afterwards. If both sides can still write it, you no longer have a translation between two systems, you have one shared database with two applications on top of it, and none of this pattern's promises apply any more.
