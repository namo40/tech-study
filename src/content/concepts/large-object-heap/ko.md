---
title: "Large Object Heap"
summary: "85,000바이트 이상 할당은 gen0이 아니라 large object heap으로 갑니다. gen2를 수집할 때만 함께 수집되고, 기본값으로는 압축하지 않으며, 거기 쌓인 구멍 때문에 프로세스는 실제로 쓰는 것보다 훨씬 많은 메모리를 붙들 수 있습니다."
category: "성능과 최적화"
scene: garbage-collection
sceneStep: 2
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Server GC
    slug: server-gc
  - label: Tail Latency
    slug: tail-latency
references:
  - title: The large object heap
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/large-object-heap
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
---

세대별 수집기는 관찰 하나에 기대고 있습니다. 대부분의 객체는 어려서 죽으니 가장 어린 세대를 쓸어 내는 일은 싸다는 것입니다. 200KB 버퍼는 그 전제를 깹니다. 세대 사이로 옮기는 비용이 그냥 두는 비용보다 크기 때문에, 런타임은 옮기려 하지 않습니다. 85,000바이트 이상은 곧장 large object heap에 할당되고, 수집기는 그것을 생기는 순간부터 gen2의 일부로 다룹니다.

이 결정 하나가 낳는 결과가 둘 있고, 둘 다 메모리가 아니라 지연으로 느껴집니다. 첫째, 큰 객체는 싼 수집으로는 절대 회수되지 않습니다. gen0 청소는 1ms쯤에 끝나고 그 버퍼를 건드리지 않습니다. 버퍼는 무언가가 gen2 전체 수집을 부를 때까지 남고, 그 수집은 모든 스레드를 멈춘 채 힙 전체를 훑습니다. 둘째, 큰 객체를 할당하는 것 자체가 그 수집을 부르는 원인입니다. large object heap에는 자기 몫의 예산이 있고, 그 예산을 넘기면 gen2 수집이 예약됩니다.

셋째 결과는 조각화입니다. large object heap은 기본값으로 압축하지 않아서, 회수된 블록은 딱 자기 크기만 한 구멍을 남깁니다. 뒤에 오는 할당은 그 구멍에 들어맞을 때만 재사용할 수 있는데, 크기가 제각각인 버퍼는 좀처럼 들어맞지 않습니다. 그러면 힙은 쓰지도 못하는 구멍을 지나 계속 커집니다. `GC.GetGCMemoryInfo()`도 큰 힙을 보고하고 카운터도 큰 힙을 보고하는데, 정작 살아 있는 집합은 그 일부일 뿐입니다. 메모리 한도가 걸린 컨테이너에서는, 누수로는 설명되지 않는 OOM 종료가 바로 이 모습입니다.

해결책이 수집기 설정인 경우는 거의 없습니다. 핫 패스에서 큰 객체를 만들지 않는 것이 답입니다. `ArrayPool<byte>.Shared`에서 정해진 크기의 버퍼를 빌리고 돌려주기, 조각을 복사해 내는 대신 `Span<T>`으로 잘라 쓰기, 본문 전체를 문자열 하나로 만드는 대신 응답을 스트리밍하기, 스트림에 `ToArray()`를 부르는 대신 풀 버퍼로 읽기입니다. 풀이 이미 갖춰 둔 크기로 빌린 버퍼는 할당되지 않고 재사용되며, large object heap에는 아예 닿지 않습니다.

```csharp
// 200 KB. 85,000바이트 임계값을 넘으므로 large object heap에 내려앉습니다.
byte[] body = new byte[200 * 1024];

// 같은 일을 풀에서 합니다. 배열은 요청보다 오래 살고 결코 수집되지 않습니다.
byte[] rented = ArrayPool<byte>.Shared.Rent(200 * 1024);
try
{
    int read = await stream.ReadAsync(rented.AsMemory(0, 200 * 1024), ct);
    Handle(rented.AsSpan(0, read));
}
finally
{
    ArrayPool<byte>.Shared.Return(rented);
}
```

조각화가 이미 문제이고 할당을 빨리 걷어낼 수 없다면, 다음 전체 수집 때 large object heap을 한 번 압축하라고 수집기에 요청할 수 있습니다. 비싸고 스레드를 막는 작업이라서 점검 시간대나 백그라운드 작업이 한가한 순간에 두어야 하고, 요청 경로나 타이머에 두어서는 안 됩니다. 상시 대안은 `DOTNET_GCConserveMemory`를 1에서 9 사이 값으로 두는 것입니다. 조각화가 심해지면 수집기가 알아서 large object heap을 압축하되, 그 대가로 더 자주 수집합니다. 어느 쪽이든 압축은 시간을 벌어 줄 뿐이고, 문제를 고치는 것은 할당을 없애는 쪽입니다.

```csharp
// 한 번뿐인 작업이고, 요청 경로가 아니라 백그라운드 작업 안입니다.
GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect();
```

관찰은 무엇보다 먼저 이 힙 전용 카운터로 합니다. .NET 9 이상에서는 `dotnet.gc.last_collection.heap.size`를 `gc.heap.generation=loh` 차원으로 읽고, .NET 8 이하에서는 `loh-size` EventCounter입니다. 살아 있는 집합은 그대로인데 그 숫자가 올라가는 것, gen2 수집 횟수가 p99 스파이크와 나란히 늘어나는 것, 객체 수는 그대로인데 컨테이너 메모리만 커지는 것, 이 셋이 누수가 아니라 여기를 가리키는 신호입니다.
