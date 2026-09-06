---
title: "Event Sourcing"
summary: "Event sourcing stores what happened instead of what is: every change is an appended event, the current state is a replay of the log, and the log itself — never updated, never deleted — becomes the one record everything else is derived from."
category: "Application architecture"
tags: ["consistency"]
level: 7
scene: event-sourcing
steps:
  - title: "Write down what happened, not what is"
    text: "A command reaches the aggregate, the aggregate decides, and what gets stored is an event — appended to the log, never overwriting anything. The state card on the left is just the running total of the log on the right."
  - title: "The state is a replay"
    text: "Wipe the aggregate and nothing is lost: play the log from the start and the same state grows back, event by event. Stop the replay early and you are looking at the past — the log remembers every version of the truth."
  - title: "When the replay grows long, take a picture"
    text: "A snapshot stores the state as of one sequence number. The next rebuild starts there and replays only what came after — one row here, not the whole log. The log is still the truth, and the snapshot can be thrown away."
  - title: "One log, many truths derived from it"
    text: "The same events feed a projection here and an audit trail there — just more replays. And a correction is not an UPDATE: it is one more event appended, and every derived view catches up. The history stays honest because it only ever grows."
related:
  - label: Aggregate
    slug: aggregate
  - label: Event Replay
    slug: event-replay
  - label: Snapshot
    slug: snapshot
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Projection
    slug: projection
  - label: Materialized View
    slug: materialized-view
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Saga
    slug: saga
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Unit of Work
    slug: unit-of-work
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

## When to use

- When the history *is* the product. Ledgers, orders, inventory movements, policy changes, anything with an auditor attached: in these domains the sequence of events is not a debugging aid, it is the thing the business actually owns. A row that says `balance = 412.30` has thrown away the only record anyone will ask about.
- When "how did it get into this state" is a question you must be able to answer. A current-state table can tell you what is true now. It cannot tell you which of five changes did it, in what order, or on whose authority. If that question ever reaches you as a support ticket, a regulator's letter, or a bug report you cannot reproduce, you needed the events.
- When several different views derive from one write model. Event sourcing pairs naturally with CQRS: once the log is the record, a read model is just another fold over it, and a second one costs a subscriber rather than a schema change. A view you get wrong can be deleted and rebuilt from the log, which is not true of a table you have been mutating for two years.
- When corrections have to be explainable. In a domain where an `UPDATE` would quietly erase evidence, a compensating event says what was wrong, when it was noticed, and what was done about it. That is a much better artefact than a changed row plus a hopeful audit trigger.
- When temporal queries are part of the job. "What did this order look like on the third of March" is a replay stopped early, which is nearly free once the log exists and nearly impossible once it does not.

## Cautions

- Events are contracts, and versioning them is the real long-term cost. A row in a table can be migrated; a decade of stored events cannot be rewritten without destroying the property that made them worth storing. You need a plan before the first deploy: a type name and a version on every event, an upcaster that turns old shapes into new ones on the way in, and the discipline never to change the meaning of an event that already exists. Adding a new event type is cheap. Changing an old one is not.
- The log grows forever, and forever is longer than your disk. Snapshots keep rebuild time bounded but do nothing about size. Decide early where cold events go, whether a closed aggregate can be archived whole, and what a deletion request means in a store designed never to delete — because "immutable" and "erase this person's data" have to be reconciled in the design, not in an incident.
- Everything derived from the log is eventually consistent. The write side commits an event and returns; the read model catches up a moment later. A user who submits a form and is immediately shown a list built from a projection will see stale data unless you plan for it, and the fix is usually to read the aggregate for the screen right after a write and the projection everywhere else.
- Do not event-source everything. Reference data, settings, a table of countries, a CRUD admin screen over records with no interesting history: these are worse as event streams, not better. The pattern earns its complexity where the history has value. Applying it uniformly across a system is how event sourcing gets a reputation for being expensive.
- Corrections need names the business recognises. `ItemRemovedInError` is a domain fact somebody can be asked about. A generic `Corrected` event with a JSON diff in it is a database update wearing a costume, and it gives back none of what the pattern was supposed to buy.
- Replaying a log is not the same as re-running it. A rebuild must not send emails, charge cards, or call anyone. Keep side effects in the handlers that react to new events, never in the `Apply` methods a rebuild walks through, or your first production replay will be memorable for the wrong reason.

## In .NET

The store is an append-only table and the aggregate is a fold over it. Nothing about that needs a framework.

```csharp
// One row per event. Nothing in this table is ever updated or deleted, so the
// primary key is (stream, version) and the only statement that touches it is
// an INSERT.
public class StoredEvent
{
    public Guid StreamId { get; set; }
    public int Version { get; set; }
    public string Type { get; set; } = "";   // "ItemAdded"
    public int SchemaVersion { get; set; }   // 1, 2, 3 …
    public string Data { get; set; } = "";   // the payload, as JSON
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<StoredEvent>().HasKey(e => new { e.StreamId, e.Version });
    model.Entity<StoredEvent>().Property(e => e.Data).HasColumnType("jsonb");
}
```

The aggregate decides, and what it produces is events rather than mutations. `Apply` is the only place the state changes, and it is the same method a rebuild calls.

```csharp
public class Order
{
    private readonly List<object> _pending = new();

    public int Items { get; private set; }
    public bool Paid { get; private set; }
    public int Version { get; private set; }

    // The command: it validates, and then it records. It never assigns to a
    // property directly, because the state has to be reachable from the log.
    public void AddItem(string sku)
    {
        if (Paid) throw new InvalidOperationException("the order is already paid");
        Raise(new ItemAdded(sku));
    }

    private void Raise(object e)
    {
        Apply(e);
        _pending.Add(e);
    }

    // The fold. A replay calls exactly this, so a rebuilt aggregate and a live
    // one cannot disagree — and nothing in here may have a side effect.
    public void Apply(object e)
    {
        switch (e)
        {
            case ItemAdded: Items += 1; break;
            case ItemRemoved: Items -= 1; break;
            case OrderPaid: Paid = true; break;
        }
        Version += 1;
    }

    public static Order Rehydrate(IEnumerable<object> history)
    {
        var order = new Order();
        foreach (var e in history) order.Apply(e);
        return order;
    }
}
```

Appending is where optimistic concurrency lives. The expected version is part of the insert, so two writers racing on one aggregate produce a unique key violation rather than a lost update — the same guarantee a `rowversion` gives a mutable row, obtained here for free from the primary key. EF Core surfaces that violation as a `DbUpdateException` wrapping the provider's error, not as a `DbUpdateConcurrencyException`, so that is the exception the reload-and-retry loop has to catch.

```csharp
public async Task AppendAsync(
    Guid stream, int expectedVersion, IEnumerable<object> events, CancellationToken ct)
{
    var version = expectedVersion;
    foreach (var e in events)
    {
        version += 1;
        db.Events.Add(new StoredEvent
        {
            StreamId = stream,
            Version = version,
            Type = e switch                        // a chosen name, not a class name
            {
                ItemAdded => "ItemAdded",
                ItemRemoved => "ItemRemoved",
                OrderPaid => "OrderPaid",
                _ => throw new NotSupportedException(e.GetType().Name),
            },
            SchemaVersion = 1,
            Data = JsonSerializer.Serialize(e, e.GetType()),
            At = DateTimeOffset.UtcNow,
        });
    }

    // Unique on (StreamId, Version): whoever gets there second is told so.
    await db.SaveChangesAsync(ct);
}
```

The stored name comes from that switch rather than from `e.GetType().Name`, because the name in the table has to outlive the name in the code: rename the class and a reflected name silently stops matching every row already written. Serialization is `System.Text.Json`, and the `Type` and `SchemaVersion` columns are what make an event readable in five years. Reading is a switch on those two columns, not `JsonSerializer.Deserialize<object>`, because the payload's shape is decided by what was written rather than by what the current code happens to expect.

```csharp
static object Rehydrate(StoredEvent row) => (row.Type, row.SchemaVersion) switch
{
    ("ItemAdded", 1) => Upcast(JsonSerializer.Deserialize<ItemAddedV1>(row.Data)!),
    ("ItemAdded", 2) => JsonSerializer.Deserialize<ItemAdded>(row.Data)!,
    ("OrderPaid", 1) => JsonSerializer.Deserialize<OrderPaid>(row.Data)!,
    _ => throw new NotSupportedException($"{row.Type} v{row.SchemaVersion}"),
};
```

A snapshot is a second table keyed by stream and version, holding the serialized state rather than an event. It is a cache: the load path asks for the newest snapshot at or below the version it wants, applies it, and reads only the events after it. Delete the table and the system still works, only slower, which is the test of whether you have built a snapshot or accidentally built a second source of truth.

```csharp
var snap = await db.Snapshots
    .Where(s => s.StreamId == id)
    .OrderByDescending(s => s.Version)
    .FirstOrDefaultAsync(ct);

var order = snap is null
    ? new Order()
    : Order.FromSnapshot(JsonSerializer.Deserialize<OrderState>(snap.State)!);
var from = snap?.Version ?? 0;

await foreach (var row in db.Events
    .Where(e => e.StreamId == id && e.Version > from)
    .OrderBy(e => e.Version)
    .AsAsyncEnumerable()
    .WithCancellation(ct))
{
    order.Apply(Rehydrate(row));
}
```

Projections are the fourth step, and they are the same fold written by somebody else. A subscriber walks the log in order, keeps the position it has reached, and writes whatever shape its screen wants; a second subscriber does the same for an audit view and neither knows about the other. Because the position is stored with the view, rebuilding a projection is deleting its table, resetting its position to zero, and letting it run — which is why a bug in a read model is an afternoon rather than a migration.

Marten and KurrentDB (formerly EventStoreDB) package all of this if you would rather not own it. Both are worth reaching for once you have more than one stream type; neither changes the shape above, which is the point of writing it out first.
