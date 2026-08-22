---
title: "Maximum Pool Size"
summary: "Maximum Pool Size caps how many connections one process may open for one connection string, which is how each instance is handed its slice of the database's total budget."
category: "Pools and resources"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Pool Exhaustion
    slug: pool-exhaustion
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The limit is per process and per connection string, not per application. The default in the SQL Server provider is 100, which is generous for one process and reckless for twenty of them.

Start from what the database can hold, subtract room for migrations, admin tools and background jobs, then divide by the number of instances you will run at peak rather than the number running today. If autoscaling can triple the fleet, the per-process limit has to assume the tripled fleet.

Above the limit nothing is rejected outright. Requests queue inside the pool until `Connect Timeout` runs out, and only then do they fail. That is why a pool set too small looks like a slow application, and one set too large looks fine right up to the moment the database refuses new logins.
