---
title: "Memory Pressure"
summary: "Memory pressure is the heap living near its limit: allocations arrive faster than collections free space, the collector runs harder and pauses longer, and past the limit there is no error to catch — the container is simply killed."
category: "Containers and orchestration"
tags: ["memory"]
level: 5
scene: memory-pressure
steps:
  - title: "A heap far from its limit barely notices the GC"
    text: "Allocations fill, a collection empties, and the gauge breathes between thirty and fifty percent. Collections are cheap background noise — this is what healthy looks like, and nobody graphs it."
  - title: "Pressure shows up as frequency first"
    text: "Triple the allocation rate and the collector runs several times as often — the readout climbs from 4/min past 20 — pausing longer each time, reclaiming less each pass. The heap now lives near its ceiling, and every allocation pays for it."
  - title: "The limit throws nothing"
    text: "There is no OutOfMemoryException to catch at the cgroup boundary — the kernel kills the container mid-request, the pod restarts, and the counter ticks. The heap starts empty, the code is unchanged, and the same climb begins again."
  - title: "The fix is fewer allocations, not a bigger limit"
    text: "Pool the big buffers — rent, use, return — and the rate collapses. The same traffic replays and the gauge settles back around half; the GC goes quiet. A bigger limit would only move the cliff. The restart count stays: the scar is the lesson."
related:
  - label: Allocation Rate
    slug: allocation-rate
  - label: Memory Limit
    slug: memory-limit
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Fundamentals of garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "ArrayPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
---

## When to use

- As a reading rather than an alarm. Three numbers only mean something together: how often the collector runs, how long it stops the world for, and how close the heap is to its limit. Any one of them on its own is unremarkable — a collector running twenty times a minute is fine on a heap with room, and a heap at eighty percent is fine if nothing is filling it. Pressure is the combination, and it is a regime the service is living in rather than an event that happened at 03:14.
- When latency degrades and nothing explains it. No deployment, no traffic change, no slow dependency, and p95 is up anyway. Allocation-rate regressions look exactly like this, because what changed is not the work per request but the garbage per request, and the cost is paid by every request in the process rather than the one that caused it.
- When containers restart and there is nothing in the logs. Exit code 137 with no exception, no stack and no shutdown message is the signature, and it is not a crash you can debug from the application's side. The evidence is the restart count, the memory graph up to the moment of death, and the events on the pod.
- When Gen2 or the large object heap grows across a release. Objects that used to die in gen0 now survive to be promoted, because the collector is arriving before they have had time to become garbage. A live set that climbs release over release is the same story told slowly.
- Before raising a memory limit. The limit is the one number that is trivially easy to change and almost never the right thing to change. Read the regime first, because a container that dies at 512 Mi and a container that dies at 2 Gi are the same container with the same defect, and the second one takes longer to get there and pauses for longer when it does.

## Cautions

- The limit the platform enforces and the limit the runtime believes in have to be the same number. .NET reads its container limit from the cgroup and sizes the heap as a share of it, so this is usually right by default — but it stops being right the moment somebody sets `DOTNET_GCHeapHardLimit` by hand, runs a runtime older than the cgroup v2 support, or gives a pod a limit the runtime never sees. When the runtime thinks it has more room than the kernel will allow, the collector never gets aggressive enough and the kill arrives while the GC is still relaxed.
- An OOM kill is not an exception. There is no `OutOfMemoryException` at the cgroup boundary, no `catch`, no `finally`, no graceful shutdown and no last log line: the kernel's OOM killer sends SIGKILL and the process stops existing between two instructions. Every diagnostic habit built around reading a stack trace fails here, which is why the number to watch is `restarts` and the place to look is the pod's events, not the application's logs.
- A bigger limit buys time, and charges for it. Doubling the limit moves the cliff without changing the slope, and the pause is roughly proportional to the live set the collector has to walk — so the service that used to die every forty minutes now dies every eighty and stops for twice as long each time on the way. That is sometimes worth doing deliberately, to keep a service up while the real fix is written. It is never the fix.
- Allocation rate is the lever, and it is almost the only one. Pooling the large buffers, streaming a response instead of buffering it, slicing with `Span<T>` instead of copying, and not allocating in the hot path at all are the changes that move the regime. Tuning the collector rarely does: Server GC will trade footprint for shorter pauses and `GCConserveMemory` will trade throughput for a smaller heap, but neither of them stops the process producing garbage.
- The large object heap is where this goes wrong quietly. Anything over 85,000 bytes — a buffer, a big array, a serialised payload — is allocated there, is collected only with gen2, and is not compacted unless you ask for it. A workload that allocates large buffers per request will fragment the LOH into holes it cannot reuse, so the heap keeps growing while the live set does not, and the graph looks like a leak that no profiler can find an owner for.
- Memory is not CPU, and the two limits do not fail alike. Over the CPU limit a container is throttled and gets slower; over the memory limit it is killed and gets gone. That asymmetry is why memory limits deserve headroom that CPU limits do not, and why setting a memory limit equal to the request — which, together with an equal CPU limit and request on every container in the pod, is what makes a pod Guaranteed — is a decision about eviction priority as well as about the ceiling.

## In .NET

The runtime is container-aware by default: it reads the cgroup memory limit and sets a heap hard limit at seventy-five percent of it, leaving the rest for the stack, the JIT, native allocations and everything else in the process that is not the managed heap. What that means in practice is that the number to reason about is the container's limit, and the settings below are for the cases where the default reading is wrong.

```jsonc
// runtimeconfig.json. Set none of these unless you know why: the defaults are
// derived from the container limit, and overriding them is how a process ends
// up believing it has room the kernel will not give it.
{
  "configProperties": {
    // An explicit ceiling in bytes, or a percentage of the container limit.
    "System.GC.HeapHardLimit": 402653184,
    // Ignored while HeapHardLimit is set: the two are alternatives, not a pair.
    "System.GC.HeapHardLimitPercent": 75,
    // Server GC: up to one heap per core, and DATAS (on by default since
    // .NET 9) starts from one and grows into that. Shorter pauses, a larger
    // footprint — a trade you can only afford if the limit has room for it.
    "System.GC.Server": true
  }
}
```

Reading the regime takes one command and three counters. `dotnet-counters` will attach to a running process and show them live, which is the difference between guessing at the allocation rate and knowing it.

```bash
# gc-heap-size is where the gauge is, alloc-rate is what is filling it,
# gen-2-gc-count and time-in-gc are what it is costing to keep it there.
dotnet-counters monitor --process-id 1 \
  --counters System.Runtime[gc-heap-size,alloc-rate,gen-2-gc-count,time-in-gc]
```

Pooling is the change that moves the number. `ArrayPool<T>.Shared` rents a buffer that is at least the size asked for and takes it back afterwards; the buffer is reused instead of allocated, so the bytes never become garbage and the collector never has to look at them.

```csharp
public async Task<int> CopyAsync(Stream source, Stream target, CancellationToken token)
{
    // Rented, not allocated. The array may be larger than 64 KB, which is why
    // every read is bounded by what it actually returned.
    var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
    try
    {
        var total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, token)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read), token);
            total += read;
        }
        return total;
    }
    finally
    {
        // The `finally` is the whole contract. A buffer that is not returned is
        // not a leak — the pool simply allocates a new one next time — but it
        // undoes the reason the pool is there.
        ArrayPool<byte>.Shared.Return(buffer);
    }
}
```

The other half of the same fix is not producing the bytes in the first place. Buffering a response into a `byte[]` costs its full length in one allocation, usually on the large object heap; writing it out as it is produced costs a rented buffer that is reused for every request.

```csharp
// Allocates the whole payload, twice: once as a string, once as UTF-8 bytes.
var json = JsonSerializer.Serialize(report);
await response.WriteAsync(json, token);

// Writes it out through a pooled buffer instead. Nothing the size of the
// payload is ever allocated, so nothing the size of the payload is ever
// collected.
await JsonSerializer.SerializeAsync(response.Body, report, cancellationToken: token);
```

On the platform side the limit is one line, and the diagnosis when it is reached is another. A pod that has been OOM-killed says so in its last state, with the exit code that has no stack trace behind it.

```yaml
resources:
  requests:
    memory: 512Mi     # what the scheduler reserves
  limits:
    memory: 512Mi     # what the kernel enforces, with SIGKILL
```

```bash
# reason: OOMKilled, exitCode: 137. There is no application log to correlate
# with, because the process was not told anything before it stopped.
kubectl get pod api-7d9f -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'
```

If the restart count is climbing and the fix is a week away, raise the limit and say out loud that it is a stay of execution. Then go and find what the process is allocating per request, because that is the number the regime is made of, and it is the only one that changes the shape of the graph rather than its scale.
