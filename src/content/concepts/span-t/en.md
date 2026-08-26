---
title: "Span<T>"
summary: "Span<T> is a window onto memory somebody else owns: a start, a length, and no copy. It lets a hot path slice an array or a string without allocating, and it is confined to the stack, which is exactly why it is safe and why it cannot be used everywhere."
category: "Performance and optimization"
scene: garbage-collection
sceneStep: 3
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: ArrayPool
    slug: arraypool
  - label: Large Object Heap
    slug: large-object-heap
  - label: Memory Pressure
    slug: memory-pressure
  - label: Async/Await
    slug: async-await
  - label: Tail Latency
    slug: tail-latency
references:
  - title: Memory and spans
    url: https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/
  - title: "Span<T> struct"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.span-1
---

Most of what a service does to a buffer is look at part of it. Parse a header out of a line, take the first field of a CSV row, hash a prefix, hand a middle section to a decoder. Written the obvious way, every one of those is a copy: `Substring` allocates a new string, `array[2..10]` on an array allocates a new array, and `Split` allocates one per field plus the array to hold them. On a hot path, the copies are the allocation problem, not the original buffer.

`Span<T>` is the type that removes them. It is a struct holding a reference to the start of some memory and a length, so slicing it produces another span rather than another buffer. Every slice of a span is free, no matter how many you take, and the underlying array or string is never touched. `ReadOnlySpan<char>` over a string is the everyday case: parsing a request line with spans allocates nothing at all, where the `Substring` version allocates once per field.

The restriction that comes with it is real and it is the point. A span is a `ref struct`: it can only live on the stack. It cannot be a field of a class, it cannot be boxed, it cannot be captured by a lambda, and it cannot cross an `await` or a `yield`, because in every one of those cases the value would have to be stored on the heap and might outlive the memory it points into. The compiler refuses, which is why a span can never be a dangling pointer. When you need those things, use `Memory<T>` — which can live on the heap and cross an await — and call `.Span` on it at the moment you actually read the bytes.

```csharp
// Allocating: three strings and an array, per line.
string[] parts = line.Split(' ');
string method = parts[0];

// Not allocating: two windows onto the line that is already there.
ReadOnlySpan<char> span = line;
int space = span.IndexOf(' ');
ReadOnlySpan<char> method2 = span[..space];
ReadOnlySpan<char> rest = span[(space + 1)..];

// Across an await, hold Memory<T> and take the Span only where you use it.
async Task ReadAsync(Memory<byte> buffer, Stream stream, CancellationToken ct)
{
    int read = await stream.ReadAsync(buffer, ct);
    Parse(buffer.Span[..read]);            // the span exists only inside this frame
}
```

A span is a window, not a copy, so it is only valid while what it points at is. A span over a rented array must not outlive the rental, a span over a `stackalloc` must not leave the method, and writing through a span writes through to the array — which is the whole point when you are filling a buffer, and a surprise if you thought you had a copy. If you need a value that outlives the frame, that is where you allocate, deliberately, with `ToArray()` or `ToString()`.

Pooling and slicing are two halves of one technique. Rent the buffer instead of allocating it, slice it with spans instead of copying out of it, and return it when the request is done. The allocation rate falls, gen0 fills more slowly, the collector runs less often, and the tail flattens, without a single collector setting being changed.
