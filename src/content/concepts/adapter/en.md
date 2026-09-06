---
title: "Adapter"
summary: "An adapter is the translator that sits between a port and the world: one face speaks HTTP, SQL or a vendor SDK, the other speaks only the contract the domain owns — and the fact that you can unplug one and plug in another is what makes everything behind it a detail."
category: "Application architecture"
tags: ["ef-core"]
level: 4
scene: hexagonal-architecture
sceneStep: 3
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Clean Architecture
    slug: clean-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Domain-Driven Design
    slug: domain-driven-design
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

An adapter has exactly two faces and no third one. On the outward face it speaks whatever the world happens to speak this year: an HTTP request body, a SQL statement, a message from a broker, a vendor SDK with its own idea of what an error is. On the inward face it speaks the port, which is an interface the domain wrote in the domain's own words. The whole job of the class is turning one into the other, and the reason it is worth having a name is that the turning has to happen somewhere and every other place you could put it is worse.

There are two directions and they are easy to mix up. A driving adapter is on the outside asking the application to do something: the controller that turns a POST into a command, the queue consumer that turns a message into the same command, the scheduler that raises it on a timer. A driven adapter is on the inside being asked: the class that implements the store the domain declared, the client that sends the mail the domain asked to send. Driving adapters call ports; driven adapters implement them. In the scene the upper plate is the driving one and the lower plate is the driven one, and the swap happens on the lower one because that is the side the domain does not look at.

Being replaceable is not a nice property of an adapter, it is the definition of one. If exchanging the class behind a port for a different class changes nothing the domain can observe, then everything that class knows was a detail: the storage engine, the wire format, the retry policy, the connection string. If exchanging it breaks the domain's tests, then something leaked, and the leak is almost always in the port rather than in the adapter. A port that returns `IQueryable`, hands back a provider exception, or exposes a lazily-loaded graph has published the adapter's internals under an interface's name, and no amount of care inside the implementation puts that back.

Keep them thin, and keep the boredom deliberate. The measure is whether you want to unit test the adapter: if you do, it has grown a decision, and that decision is now invisible to every fast test in the suite, because the fast tests run against the fake. Mapping, translation, transport concerns and error conversion belong here. A rule about when an order may be cancelled does not, even when it is enormously convenient to put it here because this is the class that happens to have the data in front of it.

The cost is real and worth naming out loud. Every adapter is a class that exists only to move data across a line, plus a mapping in each direction, plus a fake for the tests. On a system with rules worth defending, that is a small price for being able to change the outside without touching the inside. On a system that reads and writes rows, it is pure overhead with a diagram attached, and the honest move is to skip it and call the framework directly. The value is not in having adapters; it is in the arrow they let you point inward.
