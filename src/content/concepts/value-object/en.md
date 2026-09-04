---
title: "Value Object"
summary: "An immutable object whose equality is defined by its content. It has no id, no history and no repository: you never modify one, you replace it with a new value, and it is stored as columns on the entity that carries it."
category: ".NET data access"
tags: ["database"]
scene: repository
sceneStep: 4
related:
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Aggregate
    slug: aggregate
  - label: Aggregate Root
    slug: aggregate-root
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
references:
  - title: "Implement value objects"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/implement-value-objects
  - title: "Complex types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/complex-types
  - title: "Owned entity types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/owned-entities
  - title: "Value conversions in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/value-conversions
---

The fourth step of the scene puts two `10 USD` chips on the bench and the verdict is `same`. Then somebody tries to change one, and instead of the chip being edited it is discarded and a new chip appears in its place, still carrying `10 USD`, and the verdict is still `same`. Those two beats are the whole definition: equality is content, and change is replacement.

The easiest way to feel the difference is to ask what would be strange about the opposite. Two ten-dollar amounts are not "two different tens that happen to be equal"; there is no fact of the matter about which one is which, because there is nothing about a value other than what it is. Asking for the history of a particular ten dollars is a category error in a way that asking for the history of a particular customer is not. That is why a value object has no id: there would be nothing for the id to identify.

Everything else follows from that. If a value is nothing but its content, then changing its content would make it a different value, so it must not be changed in place; the operation that looks like modification returns a new instance instead. That immutability is not a discipline imposed for safety, it is what the concept already meant, and safety is the side effect: a value can be shared between two aggregates, held in a field, put in a dictionary key and passed across a thread boundary without anybody needing to think about it. Testing collapses too, because a function over values has no setup and no cleanup, and the assertion is just an equality check.

A value object is also where domain rules about a small thing get to live. `Money`, `EmailAddress`, `DateRange`, `PostalCode`: each of these replaces a primitive that any code could set to nonsense, and each gets a constructor that refuses nonsense once, for everybody. That is usually a bigger win in practice than the equality semantics — a `decimal` amount with a `string` currency somewhere else in the class is an addition bug waiting to happen, and `Money` is where you make it impossible.

In .NET a `record` or a `readonly record struct` gives you structural equality, a sensible `GetHashCode`, and `with` for replacement, which is the entire contract in one keyword.

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Of(decimal amount, string currency) =>
        currency.Length == 3 ? new(amount, currency.ToUpperInvariant())
                             : throw new ArgumentException("a currency is three letters");

    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // a new value, not a change
            : throw new InvalidOperationException("mixed currencies");
}
```

Persistence follows the same rule: because there is no identity, there is nothing to store a value under, so it is stored as part of whatever entity carries it. `ComplexProperty` puts it in columns on the owner's table, and there is no `Money` table and no way to load one on its own — which is the modelling equivalent of "no repository". The neighbouring tool, `OwnsOne`, maps an owned *entity* instead: it has a key, it is tracked in its own right, and it has to be a reference type, so a `readonly record struct` cannot be one.

```csharp
model.Entity<Order>(order =>
{
    order.ComplexProperty(o => o.Total);   // Total_Amount, Total_Currency on Orders
    order.OwnsMany(o => o.Lines);          // lines have no life outside the order
});
```

When the value is really one column, a value conversion is lighter than a complex type: the domain keeps the type and the database keeps the primitive.

```csharp
model.Entity<Customer>()
     .Property(c => c.Email)
     .HasConversion(email => email.Value, text => EmailAddress.Of(text));
```

Two cautions are worth carrying away. First, EF Core tracks the value through its owner, so assigning a whole new instance (`order.Total = order.Total.Add(line.Amount)`) is the update; there is nothing to mutate and nothing to save separately. Second, `record` is right for values and wrong for entities, and the boundary between the two pages is exactly there: give an entity structural equality and two different customers who share a name today become the same customer, while the same customer becomes a stranger after moving house.
