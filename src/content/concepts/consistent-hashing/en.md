---
title: "Consistent Hashing"
summary: "Consistent hashing places nodes and keys on the same ring, so a key belongs to the next node clockwise. Adding or removing a node reassigns only its neighbourhood, which turns scaling from a mass migration into a move proportional to what changed."
category: "Data distribution and consistency"
tags: ["database"]
scene: sharding
sceneStep: 3
related:
  - label: Sharding
    slug: sharding
  - label: Shard Key
    slug: shard-key
  - label: Rebalancing
    slug: rebalancing
  - label: Hot Partition
    slug: hot-partition
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Load Balancer
    slug: load-balancer
  - label: Consumer Group
    slug: consumer-group
references:
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
---

The third step of the scene puts two answers to the same question side by side, and the numbers are the argument. Twelve keys sit in two shards. A third shard arrives. Under `hash mod n` the router recomputes every key against the new count, and eight of the twelve get a different answer than before: two thirds of the data has to be read out of one box and written into another before anybody can find it again. On a ring, four keys move and eight stay exactly where they are.

The reason `hash mod n` behaves that way is arithmetic rather than bad luck. `hash % 2` and `hash % 3` are unrelated functions; changing the divisor rewrites the mapping for almost everything, and the fraction that happens to keep its answer is roughly `1/n`. It is worth noticing that this is not a property of hashing at all — it is a property of putting the node count inside the placement function. Any scheme whose answer mentions "how many nodes there are" moves most of the data when that number changes.

The ring takes the node count out. Hash the key to a point on a fixed circle, hash each node to points on the same circle, and say a key belongs to the first node clockwise from it. Now the answer for a key depends on which node happens to sit next to it, not on how many nodes exist. Add a node and it lands somewhere on the circle and takes over the arc between itself and the previous node. Only the keys in that arc move, and they all move to the newcomer: no key ever changes hands between two nodes that were already there. In the scene that shows up as four dots leaving two boxes, travelling up through the router and down into S2, while nothing crosses between S0 and S1.

Plain ring placement has a distribution problem that the neat picture hides. With a handful of nodes, a few random points on a circle produce arcs of wildly different sizes, so one node can own a third of the ring by accident, and when a node leaves, its entire arc lands on exactly one neighbour rather than being shared out. Virtual nodes fix both: give each physical node many points on the ring — a hundred or two hundred is typical — so its ownership is the sum of many small arcs. The variance falls to something predictable, and a departing node's load is spread across all the others rather than doubling one of them. The scene draws S2 with two tokens for exactly this reason: one token would have taken one neighbourhood, and two take a slice from each existing shard.

A close cousin is worth knowing, because it is often the better answer for a database. Instead of hashing directly to nodes, hash to a large fixed number of buckets — 1024, or 16384, as Redis Cluster does with hash slots — and keep a small table mapping buckets to nodes. Adding a node means moving some buckets, which is the same bounded move as a ring, but with two advantages: the map is explicit, so you can look at it, log it and move buckets deliberately rather than wherever the hash decided; and you can rebalance for observed load, moving the buckets that are actually busy. The cost is that the map is now state, which every router has to agree about.

Consistent hashing does not fix hot keys. It says where a key goes, not how often anybody asks for it, so a single popular key still lands on a single node and stays there. It also does not make a rebalance free — the four keys in the scene really do get copied across the network, and while that is happening the router has to know that some keys are in two places or in neither. Real implementations handle that with a migration state per bucket: reads go to the old owner until the copy is verified, then the map flips and the old copy is dropped.

The same idea appears wherever a set of nodes has to agree on ownership without a coordinator: cache clusters deciding which node holds a key, so adding a cache server invalidates a slice rather than everything; load balancers with session affinity, so a new instance does not scatter every existing session; and partition assignment in message brokers, where a consumer joining the group should take over some partitions rather than triggering a full reshuffle. The shape of the problem is always the same, and so is the answer: keep the node count out of the function that decides where things belong.
