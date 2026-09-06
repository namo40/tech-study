---
title: "Idle Timeout"
summary: "Idle timeout reclaims a pooled connection that nobody has used for a while. It measures disuse rather than age, which makes it the setting that decides how cheap a quiet service is for the database, and how likely the pool is to hold a connection something else has already closed."
category: "Pools and resources"
tags: ["database"]
level: 4
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Connection Timeout
    slug: connection-timeout
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Keep-Alive
    slug: keep-alive
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

The scene's fourth step ends with a connection back on the free list, available for whoever needs it next. Idle timeout is the rule that decides what happens if nobody does. A connection that has sat unused for longer than the limit is closed and dropped from the pool rather than kept indefinitely, so a pool that grew to forty connections during a spike does not still hold forty of them at four in the morning. The mechanism is a background sweep rather than a per-connection alarm: the SQL Server pooler runs a cleanup pass every few minutes and closes connections that were unused across two consecutive passes, which is where the familiar "a few minutes of disuse" figure comes from, and other providers expose the same idea as a number you can set, as Npgsql does with `ConnectionIdleLifetime`. Whatever floor minimum pool size establishes is exempt, because a floor is precisely a decision that those connections are not to be reclaimed.

The neighbouring setting is connection lifetime, and the division between them is the thing worth being exact about. Lifetime counts from creation and applies to a connection that has been busy every second of its life; idle timeout is about disuse rather than age. Two connections can therefore be treated completely differently on identical evidence: a connection created an hour ago and used continuously is old but never idle, and one created a minute ago and untouched since is young but idle. Their purposes differ in the same way. An age limit exists for redistribution, so that connections drift back onto whatever server node routing prefers today, while an idle limit exists to hand resources back when the demand that justified them has gone. Connection timeout is neither, being the time a caller waits to receive a connection at all.

What reclamation is buying is worth naming, because it is paid somewhere else. Every connection the pool holds is an open session on the database, consuming server memory and one slot of the server's connection limit whether or not anything is running on it, and the number that matters is the pool's holding multiplied by the number of processes in the fleet. Letting idle connections go turns a quiet service into a cheap one from the database's point of view. The bill for that arrives on the other side of the quiet period, when the first request after the lull pays the handshake, the TLS negotiation and the login that the scene's first step describes. That trade is the whole argument minimum pool size is settled against: raise the floor and the pool stops reclaiming, gaining a warm start and giving up the saving on the server.

The part that turns this from a tuning question into an incident is that the same kind of rule is running on the other side of the wire, and nobody coordinates the two. The database server has its own idle cutoff, a proxy or connection gateway in front of it has another, and a stateful firewall or NAT device can drop a quiet flow from its table without sending anything at all, which leaves the client holding a connection it believes is perfectly good. The pool then lends that connection out and the first command on it fails with a transport error rather than anything the database said, exactly the race the keep-alive page describes for HTTP connections and for the same reason. The practical answer is the same too: keep the pool's own idle reclamation shorter than the shortest idle cutoff anywhere on the path, so the client is the one retiring connections, and let the retry policy treat a failure on first use as worth one immediate attempt on a fresh connection. Which lever that is depends on the provider. With Npgsql you set `ConnectionIdleLifetime` directly; SqlClient has no keyword for it and sweeps on its own fixed schedule, so the only age you control there is `Connection Lifetime`, backed by a keep-alive on the server side if the cutoff in the middle is shorter than anything you can set.
