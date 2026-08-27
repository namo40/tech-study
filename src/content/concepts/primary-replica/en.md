---
title: "Primary-Replica"
summary: "One machine takes the writes and the others copy what it did. The split is a word rather than a wire, which is exactly why the word can be moved to a different machine when the first one stops."
category: "Data distribution and consistency"
tags: ["database"]
scene: failover
sceneStep: 1
related:
  - label: Failover
    slug: failover
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Availability modes (Always On availability groups)"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/availability-modes-always-on-availability-groups
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/auto-failover-group-sql-db
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

Watch the first step of the scene and notice how little separates the two boxes. They are the same size, they hold the same data, they run the same software, and they are drawn identically. One of them says `primary` and the other says `replica`, and the arrow between them points from the first to the second. That word and that arrow are the whole arrangement. The fourth step is the proof of it: when the word moves and the arrow turns around, nothing about either machine has changed except what it is currently being asked to be.

Writes go to exactly one place, and that is not a limitation the pattern is working around; it is the thing that makes the pattern coherent. A single writer means there is one order in which the changes happened, and the replica never has to negotiate with anybody about what that order was. It just replays. The moment two machines are both taking writes you no longer have a copy, you have two histories, and reconciling two histories after the fact is a different and considerably harder problem with a different name.

Reads are where the freedom is. A replica holding the same rows can answer a read without the primary being involved at all, which is why this arrangement usually shows up long before anybody is thinking about failure: it is the cheapest way to add read capacity to a database that is running out of it. The catch is the arrow's travel time. The replica is behind by however long a copy takes to cross, so a read served there is a read of the very recent past, and the first step of the scene shows exactly that: the `behind` chip goes to one when a write commits and back to zero when the copy lands.

The role split is also what makes promotion possible in the first place, and that is the part worth carrying away. Because the replica has been applying the primary's changes all along, it is already a candidate. Promoting it is not a restore and not a rebuild; it is a relabelling, and it takes about as long as writing a word takes. A machine that had merely been shipping backups to storage would need hours and a careful operator. A replica needs a decision.

The asymmetry to hold on to is that a read on the replica is cheap and safe, but a read that feeds a write is neither. Read-modify-write against a replica reads a value that may already have been superseded on the primary and then writes over a change nobody has seen yet, and no error is raised anywhere. Send those reads to the primary. The rule is not really about the data being slightly old; it is about a decision taken on old data becoming a new and authoritative fact.

One last practical note: a replica you never read from is a replica you have never tested. It looks healthy right up until the day you need it, and then you find out that its disk was filling up, or that a schema change never reached it, or that nothing was watching how far behind it had drifted. Routing some real read traffic to it is worth doing even when you do not need the capacity, because a replica under load tells you the truth about itself continuously instead of once, at the worst possible moment.
