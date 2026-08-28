---
title: "Two-Phase Commit"
summary: "Two-phase commit makes several stores act as one transaction: a coordinator collects prepare votes, and only when every participant has promised does anyone commit — atomicity bought at the price of locks held while everyone waits for everyone."
category: "Transactions and concurrency"
tags: ["database", "consistency"]
scene: two-phase-commit
steps:
  - title: "Two stores, one promise"
    text: "The order and the payment must both happen or neither. Commit them separately and there is a moment where one store said yes and the other said no — and that half-state is exactly what the customer sees. Someone has to make two databases act as one."
  - title: "First, collect a promise from everyone"
    text: "Prepare asks each store: can you commit this, and will you hold it ready? Each one validates, takes its locks, votes yes. Two of two — and still, nothing is committed. A promise is not the deed; it is the right to demand the deed."
  - title: "Everyone commits, or no one does"
    text: "With every vote in hand the coordinator says commit, and both stores flip together. And when one store votes no, the same machinery runs the other way: abort everywhere, locks released, nothing half-done. The customer sees a failure — but never a lie."
  - title: "The price of the promise is the wait"
    text: "Prepared means locked — and when the coordinator dies at that moment, both stores hold their locks and wait, blocking everyone behind them, because breaking the promise alone would break atomicity. This in-doubt window is why modern systems often prefer sagas and outboxes: not because 2PC is wrong, but because this wait is what it costs."
related:
  - label: Distributed Transaction
    slug: distributed-transaction
  - label: Saga
    slug: saga
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Local Transaction
    slug: local-transaction
  - label: Isolation Level
    slug: isolation-level
  - label: Deadlock
    slug: deadlock
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Distributed Lock
    slug: distributed-lock
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: "TransactionScope Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.transactions.transactionscope
  - title: "Saga distributed transactions pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: "Compensating Transaction pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
---

## When to use

- When the write genuinely has to be atomic across two resource managers that both speak the protocol. Two SQL Server databases, a database and a message queue that enlists, a pair of XA-capable stores: these are the cases where the protocol was designed to work and does. The test is not "would atomicity be nice here" — it always would be — but "will a half-completed write cost more than the locks and the round trips".
- When the participants are inside one trust boundary and one network. A coordinator that can be reached in a millisecond, restarted by the same operator, and pointed at logs the same team can read is a coordinator whose failure is an incident rather than a standoff. Across an organisational boundary, none of that holds, and the protocol's recovery story is exactly the part that stops working.
- When the transaction is short and the participant set is small. Two participants and a few milliseconds of held locks is a cost most systems absorb without noticing. Five participants and a second of work between prepare and commit is a different system, and the queue behind those locks is where you will find out.
- When you are already implicitly relying on it. A `TransactionScope` that quietly promoted because a second connection enlisted is a distributed transaction whether or not anybody decided on one. Finding out that this is what your code does is a good reason to understand the protocol; deciding to keep it is a separate question.
- When the alternative is a half-written world nobody is compensating. A saga is the right answer to most cross-service atomicity, but only when somebody actually writes the compensations and tests them. Two-phase commit against two databases you own is a legitimate choice over a saga that exists only as a diagram.

## Cautions

- Prepared means locked, and that is the whole cost. A participant that has voted yes is holding its locks until it is told what to do, and it cannot decide on its own: releasing them would let a second transaction see a value that may still be rolled back, and taking the change back would break the promise the coordinator is entitled to rely on. Every transaction that touches those rows queues behind the wait.
- The coordinator is a single point that holds other systems' locks. When it dies between writing its decision and broadcasting it, the participants are in doubt: they know what they promised and not what was decided. Recovery is the coordinator coming back and re-sending from its log, so the log has to be durable, and the time to restart it is the time everything behind those locks is stopped. A coordinator that cannot be restarted turns into a manual operation on production data.
- The throughput cost is two round trips plus synchronous waiting, and it is paid on every transaction, not only the ones that fail. Blocking on a network call while holding database locks is the pattern every other page on this site is about avoiding; here it is the mechanism.
- Most of what you would want to enlist cannot be enlisted. Hosted queues, object stores and every HTTP API refuse, and no shim makes them willing; the exceptions are narrow and same-vendor, such as elastic transactions between Azure SQL databases, which the service coordinates rather than MSDTC. That is why sagas and the transactional outbox own the microservice world: not that anyone thinks compensations are elegant, but that the protocol has no participants to talk to.
- On .NET the support is narrower than it looks. Distributed transactions need MSDTC, which means Windows, which means they are unavailable on Linux, in most containers, and in most PaaS hosts. On .NET 7 and later you also have to opt in explicitly before a promotion is allowed to happen at all.
- Heuristic decisions are the failure mode nobody plans for. A participant that is left in doubt long enough may be resolved by hand or by its own timeout, and if it guesses differently from its neighbour you have the exact half-state the protocol was bought to prevent — now with an audit trail that says it could not have happened.

## In .NET

`TransactionScope` is the ambient transaction, and the thing worth understanding about it is the promotion. One connection inside the scope is a local transaction. The moment a second durable resource enlists, `System.Transactions` promotes it to a distributed transaction and MSDTC takes over as the coordinator — the same code, two very different runtime shapes.

```csharp
using var scope = new TransactionScope(TransactionScopeAsyncFlowOption.Enabled);

await using (var orders = new SqlConnection(ordersConnectionString))
{
    await orders.OpenAsync();          // still a local transaction here
    await orders.ExecuteAsync(InsertOrder, order);
}

await using (var payments = new SqlConnection(paymentsConnectionString))
{
    // A second durable resource enlists, and this is the promotion: from here
    // on there is a coordinator, a prepare round, and locks held across both.
    await payments.OpenAsync();
    await payments.ExecuteAsync(InsertCharge, charge);
}

scope.Complete();                       // the vote to commit, not the commit
```

`scope.Complete()` is not the commit. It is this scope saying it has no objection; the commit happens when `Dispose` runs and the coordinator has heard the same from everyone. Leaving the scope without calling it is an abort, which is what makes the `using` block the whole error handling story.

Since .NET 7 the promotion is off by default and throws unless you ask for it, which is the runtime being honest about how narrow the support is.

```csharp
// Windows only, MSDTC only. On Linux or in most containers this is not a
// configuration problem you can solve; the transaction manager is not there.
TransactionManager.ImplicitDistributedTransactions = true;
```

If both writes live in the same database, none of this is needed and none of it should be used. One connection, one transaction, one commit — a local transaction is atomic by itself, and reaching for `TransactionScope` across two connections to the same server still promotes.

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
await using var tx = await connection.BeginTransactionAsync();

await connection.ExecuteAsync(InsertOrder, order, tx);
await connection.ExecuteAsync(InsertOutboxMessage, message, tx);

await tx.CommitAsync();
```

That second statement is the modern answer to most of what people want two-phase commit for. The message that tells the other service what happened is written in the same local transaction as the change itself, so the two cannot disagree; a separate process reads the outbox and publishes it afterwards. Nothing is held across a network call, and the far side becomes eventually consistent rather than atomic — which is the honest trade, and the one to make deliberately.

```csharp
// The far side does the other half: a step that can run twice without harm,
// because at-least-once delivery is what the outbox buys you.
public async Task HandleAsync(OrderPlaced message, CancellationToken token)
{
    if (await db.Charges.AnyAsync(c => c.OrderId == message.OrderId, token)) return;
    await payments.ChargeAsync(message.OrderId, message.Amount, token);
}
```

When the operation really does span services and really does have to be all-or-nothing, a saga is the shape: each step commits locally, and a failure later walks backwards through compensations. It gives up the guarantee that no observer ever sees a half-changed world, and buys back everything two-phase commit spends on locks. Choose it because you accept that window, not because the protocol was inconvenient to set up.
