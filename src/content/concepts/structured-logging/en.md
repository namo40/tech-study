---
title: "Structured Logging"
summary: "Structured logging writes a log line as a message template plus named values rather than as a finished sentence, so the store keeps `OrderId` and `CorrelationId` as fields it can index. It is what turns a log search from a substring scan into a query."
category: "Observability and operations"
level: 4
scene: correlation-id
sceneStep: 2
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
  - title: "High-performance logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/high-performance-logging
  - title: "Compile-time logging source generation"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/source-generation
  - title: "Message Templates"
    url: https://messagetemplates.org/
---

The second step of the scene is where the id stops being an idea and becomes a thing the system can act on, and the reason it can is that the log lines are structured. A chip appears on every new line of one flow because the id is a named property of that line, sitting next to the message rather than inside it. Had the id been written into the sentence, the pane could still have shown it, but nothing in the fourth step would work: a filter over prose is a substring search, and a substring search does not know the difference between a field and a coincidence.

The distinction is small in the source and large everywhere else. `logger.LogInformation("charge failed for {CorrelationId}", id)` looks almost identical to `logger.LogInformation($"charge failed for {id}")`, and on a console they print the same characters. The first one hands the logging provider two things, a template and a value bound to the name `CorrelationId`, and the provider writes both. The second one hands it one finished string and throws the structure away before the provider ever sees it. Everything a log store can do beyond grep depends on which of those two you wrote.

What the store gains is the ability to treat a log line as a record. `CorrelationId` becomes a column, so a filter on it is an index lookup rather than a scan, and it is exact: searching for `7f3a` in prose also matches an order number that happens to contain those characters, and searching a field does not. Fields can be counted and grouped, so "how many payments failed for this tenant in the last hour" is a query over lines you were already writing rather than a metric somebody has to remember to add. And the template survives as its own value, so every rendering of "charge failed for {CorrelationId}" belongs to one group however many distinct ids passed through it, which is what makes a spike in one kind of line visible at all.

There is a discipline that comes with it, and most of it is about names. A property means the same thing everywhere or it means nothing: if one service logs `CorrelationId` and another logs `correlation_id` and a third logs `corrId`, the field exists three times and joins across none of them. Cardinality matters too, in the opposite direction from metrics: high-cardinality values such as ids belong in log properties precisely because logs are not aggregated the way a metric label is. What does not belong is anything secret or personal, because a structured field is more durable and more searchable than the sentence it came from, not less.

The other half of the discipline is scopes, and that is what the scene actually draws. Writing the id at each call site works and is fragile: the one line somebody adds in a hurry is the one without it, and that is usually the line you need. A scope opened once per request attaches the property to every line written inside it, including lines written by libraries that have never heard of your id, so coverage stops depending on anyone remembering.

In .NET the pieces are `ILogger`'s message templates, `BeginScope` for the ambient properties, and `[LoggerMessage]` for the lines that are hot enough to care about allocation. `LogInformation("charge failed for {CorrelationId}", id)` is already structured, and the analyzer rule CA2254 exists to catch the interpolated string that quietly is not. `logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id })` is the ambient form, and a provider only forwards those values if it is configured to: `IncludeScopes` is off by default on the console and the OpenTelemetry exporter, which is the usual reason a scope that clearly exists shows up nowhere downstream. `[LoggerMessage(Level = LogLevel.Information, Message = "charge failed for {CorrelationId}")]` generates the same line with the template checked at compile time and no boxing per call, so the fast path and the structured path are the same path.
