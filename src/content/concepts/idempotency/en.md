---
title: "Idempotency"
summary: "An operation is idempotent when performing it again leaves the system in the state one performance already left it in, which is what makes a retry safe to send."
category: "APIs and real-time communication"
tags: ["duplicates"]
scene: idempotency-key
related:
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Unique Constraint
    slug: unique-constraint
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Message ID
    slug: message-id
  - label: Retry
    slug: retry
  - label: REST
    slug: rest
references:
  - title: HTTP Semantics, idempotent methods (RFC 9110)
    url: https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
  - title: Idempotent (MDN glossary)
    url: https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

An operation is idempotent when doing it twice leaves the same state behind as doing it once. It is a statement about effects, not about answers: `DELETE /orders/7` is idempotent even though the second call returns 404 rather than 204, and a read that returns a different number each time is idempotent because it changes nothing. HTTP defines `GET`, `PUT` and `DELETE` as idempotent and `POST` as not, which is exactly why `POST` is the method that needs help. The reason any of this matters is that a network cannot tell a caller whether a request that timed out was received: the only two options are to give up on work that may already have happened, or to send it again and need the second send to be harmless.

There are five ordinary ways to get it, and reaching for the `Idempotency-Key` first is a common mistake. Choose a method that already has the property: `PUT /carts/{id}` with an id the client generated says what the world should look like, while `POST /carts` mints a new one every time it is called. Lean on a unique constraint the business already implies, such as one payment per order id, and let the database reject the second attempt. Make the write conditional on what the caller last saw, with an `ETag` and `If-Match` or a version column, so a repeat arrives with a stale precondition and is refused. Give the caller an `Idempotency-Key` and store the outcome under it, which is the general answer for operations that cannot be made safe any other way. Or, on the receiving side of a queue, record the message id you have already handled and drop what you have seen before.

Two things are worth being precise about. Idempotent is not the same as safe: a safe method changes nothing at all, while an idempotent one may change a great deal the first time and nothing afterwards. And idempotency is what turns at-least-once delivery into something a person can reason about, because a consumer that ignores duplicates gives the effect of exactly-once processing without any of the distributed machinery exactly-once delivery would need. What it cannot survive is a check and a write that are not one operation. Reading "have I done this?" and then doing it leaves a window in which two callers both read no and both proceed, so the claim and the effect have to land together, in one atomic write.
