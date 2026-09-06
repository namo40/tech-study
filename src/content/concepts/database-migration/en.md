---
title: "Database Migration"
summary: "A database migration is a deploy in which old code and new schema must coexist: every change ships as steps both app versions survive — expand, backfill, switch, contract — so the schema evolves without a stop-the-world moment."
category: ".NET data access"
tags: ["database", "deployment"]
level: 6
scene: database-migration
steps:
  - title: "A rename is instant; a deployment is not"
    text: "Two v1 instances read the old column while the ghost shows the one-shot migration: rename now, deploy later. Versions overlap during every rollout, and old code then queries a column that no longer exists. The outage came from the calendar."
  - title: "Add, never break: the expand step"
    text: "A new column appears next to the old one, and adding is invisible to v1. Then v2 rolls in writing both columns while v1 keeps writing the old, and every reader still finds what it expects. A backward-compatible change is one both versions can live with, and that property is what makes the rollout boring."
  - title: "History catches up, then reads move"
    text: "Dual writes cover new rows; the backfill walks the old ones, copying name into full_name in small batches until the columns agree. Only then do reads switch to the new column — verified, not hoped. The last v1 retires, and nothing noticed the floor move."
  - title: "Contract: remove what nothing reads"
    text: "The old column has no readers left, so dropping it is as invisible as adding one was. That is the whole trick: a schema is not versioned in leaps but evolved in steps, each one deployable, each one reversible until the final cut. The risky rename became four boring changes."
related:
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Schema Evolution
    slug: schema-evolution
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Feature Flag
    slug: feature-flag
  - label: Schema Registry
    slug: schema-registry
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

## When to use

- Every schema change on a live system. Renames, column splits, type changes, adding NOT NULL, building an index: none of them is a single statement you can run while the old code is still up, and all of them decompose into steps that are.
- Whenever the deployment is rolling, blue-green or canary. Every one of those creates the same window, in which two versions of the application are talking to one database, and the schema has to be true for both of them at once. The window is not a risk you can shorten away; it is how the deployment works.
- Whenever rollback has to stay possible after the schema has moved. A change you cannot step back from turns every deploy behind it into a one-way door, and the value of the old column while it still exists is exactly that it makes going back cheap.
- Whenever the change itself takes time. Copying ten million rows is a background job with a rate limit, not a statement you run and watch. If the migration has a duration, it needs a plan for what the application does during it.
- Not as the advanced option. The alternative to expand, backfill, switch and contract is a maintenance window, which is a decision to be down. Sometimes that is the right decision, but it should be one you made rather than one you discovered.

## Cautions

- Migrations are code. Version them next to the application, review them like any other change, and run them from the pipeline. A schema whose history lives in somebody's terminal is a schema nobody can reproduce, and the first time that matters is the day you need a second environment.
- `migrate-on-startup` races itself. Ten instances starting together try the same migration ten times, and the ones that lose either crash or, worse, half-apply. Run migrations as a deploy step, from one place, before the rollout begins.
- Destructive changes decompose or they break. A rename is a drop plus an add. A type change is a new column plus a backfill. Adding NOT NULL needs a default and a filled column first. Every one of them becomes expand, backfill, switch, contract, and skipping a step is how the first step of this scene happens.
- Long backfills need batching and a throttle. One statement over a large table holds locks, floods the write-ahead log and starves the traffic you were protecting. That is the outage you were avoiding, arriving from the other direction.
- A migration that cannot run while the application is live is a scheduled outage. Say so honestly, book the window and tell people, rather than hoping a lock will be brief.
- Keep contract far behind switch. Days, not minutes. The old column costs almost nothing to keep and it is the only thing that makes a rollback cheap. Drop it once you have evidence that nothing reads it, and not before.

## In .NET

EF Core migrations give you the versioned history and the tooling; the discipline above decides what each migration is allowed to contain. Expand is a migration of its own, and it is the boring kind: a nullable column with no default, so the table is not rewritten.

```csharp
// Expand. Nullable and without a default, so adding it is a catalogue change
// rather than a rewrite of every row.
public partial class AddFullNameColumn : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "full_name", table: "customers", type: "text", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "full_name", table: "customers");
}
```

While both columns exist, the newer version keeps them in step. That is the only code in the application that knows there are two, and it is deleted with the contract. Only public read-write properties are mapped by convention, so keeping the two columns internal means naming them in `OnModelCreating` — and ignoring the public property in front of them, which convention would otherwise turn into a third column.

```csharp
public sealed class Customer
{
    public int Id { get; set; }

    // The columns. Internal, so nothing else in the application can write one
    // of them without the other.
    internal string Name { get; set; } = "";
    internal string? FullName { get; set; }

    // The property everything else uses. Reads prefer the new column once the
    // backfill has run; writes land in both while both are there. It is not a
    // column itself, so the model has to be told to leave it alone.
    public string DisplayName
    {
        get => FullName ?? Name;
        set { Name = value; FullName = value; }
    }
}

protected override void OnModelCreating(ModelBuilder builder)
{
    builder.Entity<Customer>(customer =>
    {
        // Convention would map neither of these, so map them by hand.
        customer.Property(c => c.Name).HasColumnName("name");
        customer.Property(c => c.FullName).HasColumnName("full_name");

        // And it would map this one, which is not a column at all.
        customer.Ignore(c => c.DisplayName);
    });
}
```

The backfill is raw SQL in batches, either inside a migration for a small table or as a job for a large one. Batching is what keeps it from becoming the incident, and the `WHERE full_name IS NULL` clause is what lets a job that was killed halfway be started again without redoing the rows it already copied.

```csharp
public sealed class FullNameBackfill(IDbContextFactory<ShopDbContext> factory, ILogger<FullNameBackfill> log)
{
    public async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await using var db = await factory.CreateDbContextAsync(token);

            // PostgreSQL. On SQL Server the batch is UPDATE TOP (500), and
            // MySQL does not allow LIMIT inside an IN subquery at all.
            var copied = await db.Database.ExecuteSqlRawAsync(
                """
                UPDATE customers SET full_name = name
                WHERE id IN (SELECT id FROM customers
                             WHERE full_name IS NULL ORDER BY id LIMIT 500)
                """, token);

            if (copied == 0)
            {
                log.LogInformation("backfill complete");
                return;
            }

            // Give the database its ordinary traffic back between batches.
            await Task.Delay(TimeSpan.FromMilliseconds(200), token);
        }
    }
}
```

For the pipeline, generate SQL rather than letting the application apply migrations to itself. `dotnet ef migrations script --idempotent --output migrate.sql` produces a script that checks the history table before each step, so running it twice does the work once and running it against an environment that is already up to date does nothing. The deploy runs that script as its own step, against a connection with schema rights the application itself does not have, and only then starts the rollout. `dotnet ef migrations bundle` packages the same thing as an executable when the pipeline has no .NET SDK on it.

Two smaller habits pay for themselves. Give migrations names that say which step they are (`AddFullNameColumn`, `DropNameColumn`), because the review that matters is whether a single migration is safe to deploy on its own. And when two branches add a migration at the same time, resolve it by regenerating rather than by editing the model snapshot by hand: the snapshot is derived, and a hand-merged one disagrees with the model in ways that only surface on the next migration.
