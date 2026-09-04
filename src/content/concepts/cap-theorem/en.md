---
title: "CAP Theorem"
summary: "The CAP theorem says that when a network partition cuts your replicas apart you must choose: keep answering with data that may not be the latest, or refuse to answer until agreement returns. PACELC adds the everyday half, because with no partition anywhere you are still trading latency against consistency on every read."
category: "Data distribution and consistency"
tags: ["consistency", "database"]
scene: cap-theorem
steps:
  - title: "Partitions happen; not choosing splits you in two"
    text: "A what-if partition cuts the link and both replicas keep answering — their values drift apart: one question, two honest answers. The partition is not optional: when it comes you hold consistency or availability. Not choosing chooses both."
  - title: "Choose consistency, and some of you wait"
    text: "Under the cut, the side that cannot reach agreement refuses: better no answer than a wrong one. Every answer given is the one true value; the price is that part of the system goes dark until the network heals. Banks and inventories buy this line — a refusal costs a retry, a stale balance costs real money."
  - title: "Choose availability, and hear yesterday's answer"
    text: "Under the same cut, both sides keep answering; the cut-off side serves what it last knew, marked stale so you can see the honesty. When the network heals, they converge. Feeds, carts and counters buy this line — a slightly old answer beats a spinner that is perfectly current."
  - title: "No partition anywhere, and the trade is still on"
    text: "A strongly consistent read consults the other replica first, and the meter shows that round trip. A relaxed read answers from the nearest copy, only as fresh as that copy is. That is PACELC's else half: latency versus consistency."
related:
  - label: Strong Consistency
    slug: strong-consistency
  - label: PACELC
    slug: pacelc
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Session Consistency
    slug: session-consistency
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Failover
    slug: failover
  - label: Conflict Resolution
    slug: conflict-resolution
references:
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

## When to use

- Apply it per dataset, not per system. The order ledger and the product feed live in the same product and want opposite answers: the ledger refuses rather than lies, the feed serves what it has. A system is not CP or AP; each of its datasets is.
- Reach for it when you are writing the partition-mode runbook, because that document is the theorem made concrete: which calls refuse, which serve something older, what the client should do with a refusal, and what reconciles once the network is back.
- Reach for it when you are choosing a consistency level on a managed store. Cosmos DB's five levels are this dial with names on it, and picking one is picking a point between "every read sees the newest write" and "every read is fast".
- Reach for it when you are reading a vendor claim. "Beats CAP" always means "chose a point on the line and gave it a name". Ask what happens to a read on the minority side of a partition, and you will get the real answer in one sentence.
- Use it as a framing tool rather than a proof. Its value is that it stops the conversation where two people are each assuming the other trade-off, not that it settles the design on its own.

## Cautions

- The C in CAP is linearizability: every read sees the most recent completed write, as though there were one copy. That is much stronger than the C people mean in an ACID conversation, which is about constraints holding within a transaction. Conflating the two makes a database that is "ACID" sound like it has already answered the question.
- Availability degrades by fractions, not all at once. Under a partition on a CP store, the side that still has a quorum keeps answering and the minority side refuses. "We chose consistency" does not mean the product goes down; it means part of it does, for some callers, for as long as the cut lasts.
- A partition is not only a cut cable. A long GC pause, packet loss, an overloaded link, or a node that is merely too slow to answer inside its timeout all look identical from the outside: replicas that cannot agree in time. Design for the general case, because you will meet it far more often than you meet a backhoe.
- AP needs a convergence story before you ship it. Last-write-wins is the default that quietly loses writes: two edits, one clock, one survivor, no error anywhere. If the data has real conflicts, use version vectors, per-field merges, or a CRDT, and if you keep last-write-wins, say out loud which writes you are willing to drop.
- PACELC is the half you feel every day. Most days there is no partition, and the trade you are actually making is latency against consistency on every read. A system's real character is its Else branch: most stores sit in PA/EL (Dynamo, Cassandra, Cosmos DB at its default) or PC/EC (Bigtable, HBase, a relational cluster whose reads go to the leader), and the mixed pairings are rare enough to be worth naming, because the Else branch is a separate decision from the partition one.
- Do not cargo-cult either side. AP on data that must not lie produces silent corruption that surfaces as a support ticket months later; CP on data nobody rereads produces outages nobody needed to have.

## In .NET

The dial is usually a client setting rather than an architecture. In Cosmos DB it is `ConsistencyLevel`, set on the account and narrowed per client or per request, and the levels below the account default are the ones that get cheaper and faster. Narrowed is the operative word: a `ConsistencyLevel` override can only relax the account default, so an account with one read that must see the newest write is configured `Strong` and relaxed everywhere else, not the other way round.

```csharp
// This account is configured Strong. A ConsistencyLevel override may relax that
// default, never strengthen it, so the client drops to Session and the reads
// that need agreement keep it.
var client = new CosmosClient(endpoint, credential, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,   // the everyday level for this app
    ApplicationRegion = Regions.WestEurope,        // "nearest copy" is a real setting
});

// The ledger read that feeds a decision pays for agreement, which it can ask
// for only because the account itself is Strong.
var balance = await accounts.ReadItemAsync<Account>(
    id, new PartitionKey(customerId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });

// The feed read does not, and says so.
var feed = await articles.ReadItemAsync<Article>(
    id, new PartitionKey(feedId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Eventual });
```

The same dial appears under other names. On SQL Server, `ApplicationIntent=ReadOnly` sends a connection to a readable secondary, and a synchronous-commit availability group is the closest thing to the CP setting — but only if you ask for it: by default a secondary that stops acknowledging holds the commit for the session timeout (10 seconds), after which the primary marks that secondary as not synchronizing and carries on committing alone. Setting `REQUIRED_SYNCHRONIZED_SECONDARIES_TO_COMMIT` to one or more is what makes the commit actually stop. In MongoDB the pair is `readConcern` and `writeConcern`, and the linearizable end of the range is `readConcern: "linearizable"` with `writeConcern: "majority"`; `majority` on both returns majority-committed data without promising it is the newest.

In application code the choice shows up as two shapes. The CP shape treats a refusal as a retryable condition: catch the timeout or the "not enough replicas" error, back off, and try again, because the answer will exist once the network heals. The AP shape treats an old answer as a normal answer: read what is there, show it with the freshness you know about, and put the reconciliation somewhere the user can see. Both shapes are cheap to write; what is expensive is finding out at three in the morning that the endpoint was written in the wrong one.
