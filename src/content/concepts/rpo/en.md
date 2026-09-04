---
title: "RPO"
summary: "The recovery point objective is how much data the business agrees it can lose: the age of the newest surviving copy after a disaster. It is a decision made by the people who own the data, and it is the decision that picks your replication mode and your backup interval."
category: "Requirements and quality attributes"
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
  - label: Primary-Replica
    slug: primary-replica
  - label: Quorum
    slug: quorum
  - label: Error Budget
    slug: error-budget
references:
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: Business continuity in Azure SQL Database
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/business-continuity-high-availability-disaster-recover-hadr-overview?view=azuresql
---

## When to use

- Ask it first, before any disaster recovery design. It pairs with the recovery time objective, which asks how long you may be down, while RPO asks how much of the recent past you may lose, and the two answers pull on different pieces of the architecture. Starting from the numbers keeps the conversation with the business about acceptable loss rather than about products, and it turns the design that follows into arithmetic instead of preference.
- Use it to justify the choice between synchronous and asynchronous replication. Synchronous replication holds the commit until a second copy has it, which is what an RPO near zero actually requires; asynchronous replication lets the primary commit alone and ships the change afterwards, which is what an RPO of seconds or minutes buys you in exchange for latency. Without the number, the argument is a preference; with it, one of the two options is simply out of range.
- Size backup frequency and log shipping intervals from it. If the answer is fifteen minutes, a nightly full backup with no log backups is already a violation on paper, and a log backup every five minutes with a tested restore is inside the promise with room to spare. The interval is the RPO's direct translation into a schedule, and every schedule you cannot justify against a number is a guess.
- Set it per data class, not once for the system. Payment records and ledger entries deserve something close to zero because the loss is not recoverable by asking again; a click stream, an audit trail of read access or a rebuildable projection can often lose hours without harming anyone. Giving every store the strictest number is how a design becomes unaffordable for no benefit to the data that needed it.

## Cautions

- RPO is measured, not declared. The number in the design document is an objective; the real one is the age of the newest change that exists somewhere other than the thing that just failed, and on an asynchronous replica that is exactly the replication lag at the moment of the outage. A lag that normally sits at two seconds and reaches four minutes during the nightly batch means your real RPO during that window is four minutes. Put the lag on a dashboard with an alert threshold below the promise, or the objective is a sentence nobody has checked.
- RPO 0 has a price, and the price is paid in latency and availability, not in money alone. Committing only after a remote copy acknowledges adds the round trip to every write, and it means an unreachable secondary can block the primary or force a decision about whether to keep accepting writes without it. Zero across a region pair is a very different bill from zero across availability zones, so state which distance the zero applies to.
- Backup-based and replica-based RPO are different numbers, and they are the numbers for different failures. A replica bounds loss for the failure of the primary and faithfully replicates the corrupt row or the mistaken `DELETE` you are trying to escape; a backup bounds loss for corruption and human error, and its RPO is its interval plus the time to notice. Most systems need both, so write down both rather than quoting the better one.
- Neither number is real until a failover has been rehearsed. An untested secondary hides the cases that matter: the replica that has been broken for a week, the connection string nobody repointed, the read-only mode that never lifted, and the restore that turns out to take four hours. Practise the failover on a schedule, measure what was actually lost and how long it took, and let those measurements replace the aspirational numbers in the document.

## In .NET

- On Azure SQL, business continuity options come with published RPO characteristics and you pick the shape rather than build it. Zone-redundant high availability gives an RPO of zero within a region; failover groups and active geo-replication synchronise continuously across regions and give an RPO greater than or equal to zero, because whatever had not replicated when the region went away is what you lost; geo-restore from geo-redundant backups gives an RPO measured in minutes or hours depending on the backup. Failover groups also keep the listener endpoints stable, which is the part that makes an application survive the switch without a configuration change.
- Storage redundancy is the same decision one layer down, expressed as a choice of letters. Locally redundant storage keeps copies within a datacentre, zone-redundant storage spreads them across availability zones synchronously, geo-redundant storage copies asynchronously to a paired region, and geo-zone-redundant storage combines the two. The asynchronous hop in the geo options is where the non-zero RPO lives, and it applies to blobs, queues and anything else you have put in the account, including the backups you were relying on.
- Cosmos DB expresses the trade-off through consistency levels and region topology. Strong consistency across the account's regions means an acknowledged write survives the loss of a region with no loss, and the write pays for that in latency; bounded staleness, session and eventual consistency each admit a defined amount of unreplicated data, which is the RPO stated as a staleness bound rather than as a duration in a runbook.
- Whatever the platform provides, the number that belongs in your monitoring is the observed lag or the age of the last successful backup, exported alongside the rest of the service's telemetry. An objective without a corresponding metric is untestable, and the day you need it is the worst day to find out which of the two you actually had.
