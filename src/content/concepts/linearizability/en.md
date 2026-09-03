---
title: "Linearizability"
summary: "Linearizability is the formal version of strong consistency: every operation appears to take effect at one instant between its call and its return, and those instants respect real time. It is a single-object property, it is not serializability, and it is checkable from a recorded history."
category: "Data distribution and consistency"
tags: ["consistency"]
scene: cap-theorem
sceneStep: 2
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Strong Consistency
    slug: strong-consistency
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Quorum
    slug: quorum
  - label: Isolation Level
    slug: isolation-level
references:
  - title: "Jepsen: Linearizability"
    url: https://jepsen.io/consistency/models/linearizable
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
---

In the scene's second step a replica that cannot confirm what it holds answers `wait` instead of a number, and the rule it is obeying has a precise name. Linearizability says that every operation on an object appears to take effect atomically at some single instant between the moment it was invoked and the moment it returned, and that those instants can be laid out on one timeline that matches real time. The practical form of that sentence is the one worth memorising: after a write has completed, every read that begins afterwards returns that write or something newer. Never the previous value, never a value that flickers back. The replica in the scene refuses because it cannot promise that sentence, and a system that answers anyway has not chosen a weaker configuration of the same property but abandoned it.

The definition is stated for a single object, and that restriction carries most of the confusion people have with it. Linearizability governs one register, one key, one row: it says nothing about doing two things together. If you read a balance and then write a transfer, both operations can be individually linearizable while another client slips between them, and no amount of consistency configuration on the store will close that gap. Serializability is the property that does, and it is a different axis entirely: it concerns multi-operation transactions and only requires that the result equal some serial order, with no obligation to respect the real-time order in which those transactions ran. A store can be serializable and still let a transaction read a state from before a commit that finished an hour ago. Strict serializability is what you get when both hold at once, and it is the guarantee most people believe they are buying when they say strong.

Because the definition is about orderings of observed events, it is checkable after the fact, which is what makes it unusual among consistency properties. Record a history: every invocation and every response, with the wall-clock moment of each. A checker then searches for a sequential ordering of those operations that satisfies two constraints, namely that the object's own specification is respected and that any operation which returned before another was invoked comes first. Operations whose intervals overlap may be ordered freely, which is exactly where the freedom and the search cost live; in the general case the search is expensive, which is why checkers work over short histories and aggressive fault injection rather than production traffic. The payoff is that a violation is a concrete artifact. There is a pair of operations with no consistent ordering, and no vendor claim can argue with it.

Real systems therefore qualify the guarantee, and the qualification is the part to read. A store that offers linearizable reads usually offers them per key or per partition, so operations on two different keys carry no cross-key ordering promise; Cosmos DB's strong level, for example, is defined for reads within its own scope rather than as a property of every operation everywhere. The common ways a system loses the property are equally worth knowing: a read served by a follower that has not caught up, a former leader still answering after its lease expired, a client cache in front of the store, or a proxy that retries a write whose first attempt actually succeeded. What strong consistency costs, and which reads are worth paying for, is the practitioner's side of the same coin; this page is the definition those decisions are measured against.
