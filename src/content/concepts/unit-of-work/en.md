---
title: "Unit of Work"
summary: "A unit of work is a set of changes that has to succeed or fail together. It collects everything you did in memory and commits it in one transaction, so a half-finished operation never reaches the database."
category: ".NET data access"
tags: ["ef-core", "database"]
level: 5
scene: change-tracking
sceneStep: 2
related:
  - label: Change Tracking
    slug: change-tracking
  - label: Local Transaction
    slug: local-transaction
  - label: Repository
    slug: repository
  - label: DbContext
    slug: dbcontext
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
references:
  - title: Saving data (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
---

A unit of work is the answer to a question the database keeps asking: which of these changes belong together? An order moving to shipped, a line being added, another line being removed are three statements, and there is no useful state of the world in which one of them landed and the others did not. Grouping them is what makes the operation atomic rather than a sequence of small ones that happen to run near each other.

In EF Core the DbContext is the unit of work and you rarely have to build one. Every change you make is held in the change tracker, nothing is sent until you call SaveChanges, and SaveChanges opens a transaction whenever it has more than one statement to send. If the second statement violates a constraint, the transaction is rolled back, the first statement is undone, and the tracker still holds every pending change so you can fix the problem and try again.

The cost of getting this wrong is not correctness in the small, it is correctness under failure. Calling SaveChanges after every property assignment turns one atomic operation into three independent ones, each with its own transaction and its own round trip, and a crash between the second and the third leaves the database in a state your code has no name for. It is also slower, because a batch of statements sent together is one round trip and three separate saves are three.

```csharp
// One unit of work: three changes, one SaveChanges, one transaction.
var order = await db.Orders.Include(o => o.Lines).SingleAsync(o => o.Id == id, ct);
order.Status = OrderStatus.Shipped;
order.Lines.Add(new OrderLine { Sku = sku, Quantity = 1 });
db.OrderLines.Remove(order.Lines.Single(l => l.Id == staleLineId));

await db.SaveChangesAsync(ct);   // INSERT, DELETE and UPDATE, inside one transaction
```

Two things make it wider than a single SaveChanges. When the work spans several calls, or mixes EF Core with raw ADO.NET on the same connection, open the transaction yourself with `BeginTransactionAsync` and commit it once at the end. And when a transient failure such as a deadlock can retry the work, wrap the whole unit in the execution strategy rather than the single statement that failed, because the rollback took the rest of it with it.

The boundary of a unit of work is a design decision, not a technical one. It should be the operation the user asked for: place the order, approve the request, close the ticket. Anything wider starts holding locks across work that did not need to be in the same breath; anything narrower gives up the guarantee that made it worth grouping in the first place.
