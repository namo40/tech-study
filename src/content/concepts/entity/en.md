---
title: "Entity"
summary: "A domain object whose equality is defined by identity rather than by attributes. Two entities with the same id are the same thing at two moments of its life, and the attributes are just today's state."
category: ".NET data access"
tags: ["database"]
level: 3
scene: repository
sceneStep: 3
related:
  - label: Repository
    slug: repository
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
  - label: Concurrency Token
    slug: concurrency-token
references:
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
  - title: "Change tracking in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
---

The third step of the scene puts two cards on a bench and asks whether they are the same thing. Both say id 7 and their fields are visibly different, and the verdict is `same`. Then two cards with identical fields but different ids go up, and the verdict is `not same`. That is the whole definition, and it is worth stating plainly because the default in most codebases is the opposite: an object is usually compared by looking at what is in it.

An entity is a thing with a life. It was created, it changed, it will change again, and through all of that it stays the thing it was. A customer who moves house is the same customer. An order that gains a line, loses a line and gets a discount applied is the same order. Nothing about the object's contents at any given instant is what makes it that order; what makes it that order is that it is the one filed under that id. Comparing two of them by their fields would say that an order before and after a discount are two different orders, which is not merely inconvenient, it is wrong about the domain.

That single decision is what makes a repository possible. `FindAsync(id)` only makes sense if the identity is the thing you can ask for and the answer is stable, and tracking only makes sense if the store can tell that the object you are handing back is the one it gave you. EF Core is built on exactly this: the change tracker is a map keyed by entity type and primary key, so asking twice for the same id inside one context returns the same instance instead of two objects that disagree. When you save a tracked entity, the provider does not diff object graphs by value; it looks up the key, compares the current values against the snapshot it kept, and writes the columns that moved.

In .NET, say it once and stop writing `Equals`. A small base class that compares the type and the id gives every entity the right behaviour, and gives it to `Contains`, to `Distinct`, to a `HashSet` and to every test assertion at the same time. The alternative, a `record` with structural equality, is exactly wrong here: a record entity would report two different customers as equal because they happen to share a name today, and would report the same customer as unequal after an address change. Records are the right tool one page over, for values.

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

Two details are worth getting right. First, compare the runtime type as well as the id, or a `Customer` with id 7 will equal an `Order` with id 7. Second, decide what an entity that has not been saved yet means. If ids are database-generated, two brand new objects both carry the default id and will compare equal to each other, which is a real bug the first time you put them in a set. The clean answer is to generate the id in the domain — a `Guid`, or a typed `OrderId` wrapping one — so an object has an identity from the moment it exists and never needs a special case.

Identity is also what makes concurrency expressible. The row is found by id and the version is checked to decide whether somebody else moved it in the meantime; without a stable identity there is no row to check a version against. The same is true of every reference across an aggregate boundary: those hold an id rather than an object, and the reason that works at all is that an id is the one thing about an entity that is guaranteed not to change.
