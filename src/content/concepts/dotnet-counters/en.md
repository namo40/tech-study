---
title: "dotnet-counters"
summary: "dotnet-counters is a command-line tool that reads the counters a running .NET process already publishes: attach to a live process, watch GC, thread pool and exception rates update in the terminal, or collect them to a file, with nothing installed into the application."
category: "Performance and optimization"
tags: ["metric"]
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Memory Pressure
    slug: memory-pressure
  - label: Allocation Rate
    slug: allocation-rate
  - label: Utilization
    slug: utilization
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "dotnet-counters diagnostic tool"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

## When to use

- Reach for it first when a process is misbehaving right now and you need numbers in seconds. `dotnet-counters monitor` attaches to a running process and prints a live table of GC heap size, allocation rate, thread pool queue length and exception count, without a restart, a code change or a package reference. It is the difference between "the API feels slow" and "the thread pool queue is at four thousand".
- Use `collect` when the interesting moment will not wait for you to watch it. It writes the same counters to a file over a chosen interval, which is what turns a nightly slowdown or a slow leak into a series you can open afterwards instead of a screenshot somebody remembered to take.
- Take it when the dashboard says something you do not believe. Reading the counters at the process gives you an independent second source, and a disagreement between the two is usually a broken export path, a wrong scrape interval or a metric aggregated at the wrong level rather than a genuine runtime problem.
- Use it inside containers as well, once you have arranged access. The process in the container publishes the same counters, so a diagnostics sidecar or a copy of the tool in the image gives you the same table on the machine where the problem actually happens.

## Cautions

- It is a diagnostics tool, not an APM. It samples counters while you are attached and shows them; it does not store history, alert on thresholds, correlate across services or survive the session. Trends, alerting and retention still belong to a metrics pipeline such as OpenTelemetry with a backend, and using this tool as a substitute means nobody notices the next occurrence until somebody happens to look.
- Attaching requires access to the process's diagnostic port, and that is the part that fails in containers. The tool talks to the target over an IPC channel, so it has to see the same process namespace and the same temporary directory: in Kubernetes that means a shared process namespace with an ephemeral debug container or a volume shared with a sidecar, and simply installing the tool in another pod will not find anything.
- The default refresh interval is one second, so a short spike can fall between two samples. A pause that lasts two hundred milliseconds may never appear in the table, and a rate averaged over a second hides the burst inside it. Shorten the interval when hunting something brief, and switch to a trace tool when the question is about individual events rather than levels.
- Counter names are specific, and guessing them wastes a session. The provider and counter names come from the well-known counters documentation, and typing a plausible but wrong name gives you an empty column rather than an error. `System.Runtime` carries the runtime ones, `Microsoft.AspNetCore.Hosting` carries request rate and queue metrics, and the tool's `list` command enumerates what is available.

## In .NET

- Nothing is installed into the application. Install the tool once with `dotnet tool install --global dotnet-counters`, find the process, and name the providers and counters you want rather than accepting the default set.

```bash
# List the processes the tool can attach to.
dotnet-counters ps

# Watch the runtime and the ASP.NET Core host side by side, twice a second.
dotnet-counters monitor --process-id 1428 --refresh-interval 0.5 \
  --counters System.Runtime[gc-heap-size,alloc-rate,threadpool-queue-length,exception-count],Microsoft.AspNetCore.Hosting[requests-per-second,current-requests]

# Same counters, written to a file for the twenty minutes the slowdown lasts.
dotnet-counters collect --process-id 1428 --format csv --output slowdown.csv \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting
```

- The two providers above answer different questions. `System.Runtime` tells you what the runtime is doing to itself, and `Microsoft.AspNetCore.Hosting` tells you what the application is being asked to do; a rising queue length next to a flat request rate is a very different story from both rising together.
- Your own `Meter` instruments show up here too. A counter or histogram created through `System.Diagnostics.Metrics` is addressed by its meter name, so `--counters MyCompany.Orders` puts your domain metrics in the same table as the runtime ones, which is a fast way to verify that an instrument is actually being recorded before you go looking in the backend for it.
- `--counters` accepts either a provider name on its own or a provider with a bracketed list. Naming the provider alone gives you its default set, which is a reasonable start; narrowing to a bracketed list is what keeps the table readable when the thing you care about is three numbers.
