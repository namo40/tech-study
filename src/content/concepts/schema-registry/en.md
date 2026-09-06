---
title: "Schema Registry"
summary: "A schema registry is the central store for event schemas: producers register a version and get an id, consumers resolve the id back to a schema, and the registry refuses a version that would break the compatibility rule the subject was configured with."
category: "Messaging and event processing"
tags: ["queue"]
level: 5
related:
  - label: Schema Evolution
    slug: schema-evolution
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Database Migration
    slug: database-migration
  - label: Event Stream
    slug: event-stream
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Message ID
    slug: message-id
  - label: Expand-Contract Migration
    slug: expand-contract-migration
references:
  - title: Azure Schema Registry in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/schema-registry-overview
  - title: Schema Registry Overview
    url: https://docs.confluent.io/platform/current/schema-registry/index.html
---

## When to use

- Register the schema as soon as more than one team consumes the event. At that point the payload has stopped being an implementation detail of the producer and become a published interface, and a registry is what turns "we think everyone reads these three fields" into a definition with a version number that both sides resolve from the same place.
- Use it when you want compatibility checked mechanically rather than reviewed by hope. Each subject carries a mode, and the registry rejects a registration that violates it: `BACKWARD` refuses a change that would stop the new schema from reading old data, `FORWARD` refuses one that would stop old readers from handling new data, and `FULL` demands both. The check happens when the producer registers, which is before any bad message exists.
- Take it to get the schema out of the payload. Messages carry a small schema id instead of an embedded definition, so the per-message overhead is a few bytes rather than a repeated copy of the structure, which matters at the volumes that made you choose a stream in the first place.
- Reach for it when you are extending expand-and-contract thinking from the database into the event world. The registry gives the same discipline a place to live: add optional fields first, deploy the side that must move first, drain the readers still on the old shape, and only then remove anything.

## Cautions

- The registry is a checker, not governance. It can tell you that a change is mechanically compatible; it cannot tell you that the field you added means what the other four teams think it means, nor decide who is allowed to evolve a subject. Ownership, review and a naming convention are still human decisions, and a registry with no owner becomes a graveyard of subjects nobody dares delete.
- The compatibility mode decides the upgrade order, so choose it deliberately. Under `BACKWARD`, a new schema can read old data, so consumers must be upgraded first and can then handle both shapes while producers catch up. Under `FORWARD`, old consumers can read new data, so producers may go first. Deploying in the other order breaks the rule the mode was protecting, and the mode is the thing to state in the runbook.
- The registry is now on the publish path, and its outage is your outage. Producers and consumers resolve schemas by id, so treat those lookups the way you treat any remote dependency: cache resolved schemas for the process lifetime, since a schema id is immutable, and decide up front whether a registry that is unreachable at startup means fail fast or run on a cached copy.
- The format you pick sets the evolution rules you live with. Avro tracks defaults and aliases and has the most precise resolution story, protobuf makes the field number the identity and forbids reuse, and JSON Schema is the most readable and the loosest. This is a one-way choice in practice, so make it with the compatibility mode in view rather than by team familiarity alone.

## In .NET

- On Azure, the registry lives beside Event Hubs and the serializer is what talks to it. `Azure.Data.SchemaRegistry` plus the Avro serializer in `Microsoft.Azure.Data.SchemaRegistry.ApacheAvro` registers or resolves the schema for you and puts the id in the message properties, so the producing code keeps sending a typed object.

```csharp
var registry = new SchemaRegistryClient(
    fullyQualifiedNamespace, new DefaultAzureCredential());

var serializer = new SchemaRegistryAvroSerializer(
    registry,
    groupName: "orders",
    // Registering from the producer is convenient in development and usually
    // wrong in production: schema changes should be a reviewed deployment.
    new SchemaRegistryAvroSerializerOptions { AutoRegisterSchemas = false });

// OrderPlaced is the class avrogen generated from the schema, so it implements
// ISpecificRecord; a GenericRecord works here too, a plain POCO does not.
EventData message = await serializer.SerializeAsync<EventData, OrderPlaced>(
    new OrderPlaced { Id = id, Total = total });
await producer.SendAsync(new[] { message });
```

- Turn automatic registration off outside development. `AutoRegisterSchemas` lets any producer create a version on first send, which quietly moves a contract change out of code review and into whichever instance happened to deploy first.
- Cache on the consumer side and let the id do the work. Schema ids are immutable, so a resolved schema can be held for the lifetime of the process; the Azure and Confluent clients both cache, and the thing to verify is that your consumer is not constructing a new client per message and defeating it.
- For Kafka, the Confluent .NET client is the equivalent path. `Confluent.SchemaRegistry` with the Avro, protobuf or JSON serializer plugs into `IProducer` and `IConsumer`, and the subject naming strategy is the setting that decides whether compatibility is enforced per topic or per record type.
