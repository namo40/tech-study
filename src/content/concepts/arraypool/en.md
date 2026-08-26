---
title: "ArrayPool"
summary: "ArrayPool<T> lends out arrays that already exist instead of allocating new ones, so a hot path that needs a buffer per request stops filling gen0 and the large object heap. You rent, you use, and you must return, which is the part that goes wrong."
category: "Performance and optimization"
tags: ["memory"]
scene: garbage-collection
sceneStep: 3
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: "Span<T>"
    slug: span-t
  - label: Object Pool
    slug: object-pool
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "ArrayPool<T> class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
  - title: Memory and spans
    url: https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/
---

A buffer per request is the most ordinary allocation a service makes and one of the most expensive. At a thousand requests a second, a 64 KB read buffer is 64 MB a second of garbage: enough to fill gen0 several times over, and if the buffer is larger than 85,000 bytes, enough to churn the large object heap and force full collections. `ArrayPool<T>` removes the allocation rather than making it cheaper. The array is created once, handed out, handed back, and handed out again.

Two things about `Rent` surprise people the first time, and both follow from the pool being a set of size buckets rather than a warehouse of exact arrays. The array you get back is at least the length you asked for and usually longer, so `buffer.Length` is not your length and you have to carry the count you actually filled. And the contents are whatever the previous renter left, because clearing on every rent would put back some of the cost the pool exists to remove. Ask for `Rent(64 * 1024)`, read `n` bytes into it, and work with the first `n` — never with the whole array.

Returning is not optional, and it is the failure mode worth designing against. A buffer that is never returned is not a leak in the usual sense — the collector will reclaim it — but the pool loses it and allocates a replacement, so the pool quietly stops helping and you have all the cost of pooling with none of the benefit. Rent and return therefore belong in the same method, with the return in a `finally`, and the buffer must not escape: do not hand a rented array to something that stores it, and do not return a `Span` over it from the method that rented it.

```csharp
byte[] buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);   // at least 64 KB, possibly more
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));       // only the part that was filled
}
finally
{
    // clearArray: true when the buffer held anything a later renter must not see
    ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
}
```

`ArrayPool<T>.Shared` is fine for almost everything. It is thread-safe, it keeps a small per-thread cache in front of a shared set of buckets, and it caps how much it retains so an idle service does not hold arrays forever. Create your own pool with `ArrayPool<T>.Create` only when you need a different maximum length or a different number of arrays per bucket, and when you have a measurement that says the shared one is the problem.

Two smaller rules keep it honest. Return the array with `clearArray: true` whenever it held anything the next renter must not see, because the pool will hand those exact bytes to somebody else. And do not reach for a pool for small, short-lived buffers on a cold path: gen0 collection is already close to free, and the rent-and-return dance costs more in code than the allocation costs at runtime. The pool earns its complexity on hot paths and on buffers large enough to matter.
