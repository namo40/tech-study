---
title: "Data Warehouse"
summary: "A data warehouse is a separate database built for asking questions. Data is copied out of the operational stores, remodelled around history and columns, and queried there, so the heavy analytical work never lands on the traffic that serves customers."
category: "Data storage"
tags: ["database"]
related:
  - label: Materialized View
    slug: materialized-view
  - label: Replication
    slug: replication
  - label: Read Replica
    slug: read-replica
  - label: Partitioning
    slug: partitioning
  - label: Change Data Capture
    slug: change-data-capture
  - label: Event Stream
    slug: event-stream
  - label: Database Index
    slug: database-index
references:
  - title: Online analytical processing
    url: https://learn.microsoft.com/en-us/azure/architecture/data-guide/relational-data/online-analytical-processing
  - title: What is Fabric Data Warehouse?
    url: https://learn.microsoft.com/en-us/fabric/data-warehouse/data-warehousing
---

## When to use

- Reporting has started to make the operational database slow. This is the step after materialized-view rather than a competitor to it: a materialized view precomputes a known query inside or beside the store that already holds the data, and it stops being the answer once the reports are numerous, unpredictable and written by people who are not going to ask permission. Moving the whole analytical workload to its own database is what removes the contention instead of rationing it.
- Questions need to cross systems that were never designed to be joined. Orders live in one service's database, payments in another, the catalogue in a third, and "revenue by category by month" is a sentence none of them can answer alone. A warehouse is where those extracts are conformed into shared dimensions so the join is legal and means the same thing every time it is run.
- The interesting questions scan the whole history. Trends, cohorts, retention curves and year-over-year comparisons read years of rows, which is the workload a columnar analytical store is built for and the one an operational row store handles worst. The same query that takes minutes and evicts the buffer pool on the production instance is ordinary work on the other side.
- The schema is worth rebuilding around the questions. A normalised operational model is shaped so that writes are cheap and correct; a star schema of facts and dimensions is shaped so that an analyst can express a question without a six-table join and so the engine can prune what it does not need. Where that remodelling is worth doing, you are describing a warehouse, and where it is not, a read replica or a view may still be enough.

## Cautions

- It is not real time, and the load interval is a property you have to publish. The numbers are as old as the last successful run, so put the freshness next to the figure on every dashboard, name it in the contract with the teams consuming it, and alert on a load that did not finish rather than letting yesterday's total quietly stand in for today's. A stale number with no timestamp is read as live, and that is how a warehouse loses trust.
- The modelling and the loading pipeline are the actual work, not the product you buy. Choosing the engine takes an afternoon; deciding what a customer is when three systems disagree, what to do with a late-arriving row, how to handle a dimension that changed last Tuesday and how to make a rerun produce the same result takes the rest of the project. Budget for the pipeline and the model, and treat the engine as the least interesting decision in the programme.
- Pointing a BI tool straight at the production database is the shortcut that charges interest. It works on the first dashboard and then someone writes an unbounded query, holds locks, floods the buffer pool with rows nobody will read again, and the incident belongs to the team that ran the report but the pager belongs to the team that owns the service. If a warehouse is not there yet, a read replica with its own resource limits is the interim, not direct access.
- The warehouse is a copy and never the system of record. Corrections are made upstream in the operational store and flow down; a value edited only in the warehouse is a number that disagrees with the business and cannot be reproduced by a reload. Keep the ability to rebuild from source, because a warehouse you cannot rebuild is a warehouse whose history you can no longer verify.

## In .NET

- The application is almost always a read-only consumer here, and that is the healthy relationship. Services write to their own operational stores, a pipeline moves the data across, and the reporting endpoints or the BI tool read from the warehouse with a separate connection string, separate credentials and its own resource governance. Nothing in the request path of a customer-facing feature should be reaching into it.
- On Azure, Microsoft Fabric's warehouse and lakehouse are the managed destinations for new work, with existing Synapse dedicated SQL pools the thing teams are migrating from, and all of them speak T-SQL over the same tabular protocol that `Microsoft.Data.SqlClient` and Dapper already speak. That means a dashboard endpoint is an ordinary query against an ordinary connection, and the interesting differences are in the plumbing around it rather than in the client library: separate scaling, separate cost, and credentials that grant no access to production data.
- Getting the data across is the part with real choices. A scheduled extract is the simplest and the coarsest; change data capture or an event-stream that the operational services already publish gives a continuous feed with a much shorter interval; replication of a whole database is easy to set up and copies the operational model rather than the analytical one, which leaves the remodelling still to do. Pick by the freshness you promised and by how much of the transformation you want to run continuously.
- Table design in the warehouse pays attention to different things than in the operational store. Partitioning by date is what lets a query touch one month instead of five years, and the columnar layout means the index discipline you would apply to a transactional table mostly does not transfer. Design the physical layout around the scans you expect, and expect to revise it once real queries arrive.
