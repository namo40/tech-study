---
title: "Garbage Collection"
summary: ".NET 가비지 컬렉터는 메모리를 세대별로 회수합니다. 대부분의 객체는 어려서 죽어 gen0에서 싸게 쓸려 나가고, 살아남은 소수는 위 세대로 올라가며, 모든 것을 멈추는 것은 블로킹 gen2 수집입니다. 직접 정할 수 있는 것은 얼마나 할당하느냐, 그리고 프로세스가 메모리를 얼마나 써도 되느냐입니다."
category: "성능과 최적화"
scene: garbage-collection
steps:
  - title: "세대"
    text: "새 객체는 gen0에 놓입니다. gen0이 차면 수집기가 스레드를 1ms쯤 멈추고, 아무것도 가리키지 않는 것을 전부 버리고, 살아남은 몇 개를 한 세대 위로 옮깁니다. 대부분의 객체는 어려서 죽고, 바로 그래서 이 작업이 쌉니다."
  - title: "비싼 쪽"
    text: "캐시나 세션처럼 오래 사는 객체는 gen2에 쌓이고, 큰 배열은 곧장 large object heap으로 갑니다. 그것들을 수집하려면 힙 전체를 훑어야 하고, 블로킹 gen2는 그러려고 모든 스레드를 멈춥니다. 그 멈춤이 바로 p99 스파이크입니다."
  - title: "손잡이는 할당입니다"
    text: "수집기는 gen0을 채우는 만큼 자주 돕니다. 요청마다 1MB 버퍼를 할당하면 수집과 large object 교체를 강제합니다. 풀에서 빌리고 Span으로 잘라 쓰면 그 일부만 치릅니다. 할당이 줄면 꼬리가 평평해집니다."
  - title: "Server GC와 한도"
    text: "ASP.NET Core는 기본이 Server GC입니다. .NET 9부터는 힙 하나로 시작해 부하에 따라 늘립니다. 컨테이너에서는 메모리 한도에 맞춰 자기 크기를 정하고, 선을 넘으면 프로세스가 죽었다가 전체 수집이 되돌려 놓습니다."
related:
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Tail Latency
    slug: tail-latency
  - label: Resource Limit
    slug: resource-limit
  - label: Load Test
    slug: load-test
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: Memory management and garbage collection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/memory?view=aspnetcore-10.0
---

## 언제 쓰나

- 모든 서비스에서 늘 봅니다. 할당률, gen0/gen1/gen2 수집 횟수, GC에 쓴 시간, 힙 크기, large object heap 크기를 보고, 서비스가 건강할 때 그 숫자들이 어떤 모습인지 알아 둡니다.
- 근거가 있을 때만 조정합니다. p99 스파이크가 gen2 수집과 시각이 맞아떨어지거나 컨테이너가 계속 OOM으로 죽는다면 무언가 바꿀 이유가 됩니다. 그냥 마음에 안 드는 숫자는 이유가 아닙니다.
- 수집기보다 할당을 먼저 봅니다. 웹 서비스에서 겪는 가비지 컬렉션 문제는 거의 전부 모습만 바꾼 할당 문제이고, 수집기 설정은 가장 마지막에 손대는 것입니다.

## 주의점

- 수집기를 조정하기 전에 할당부터 줄입니다. 버퍼 풀링, `Span<T>`, 본문 전체를 문자열로 만드는 대신 스트리밍하기, 핫 패스에서 LINQ 임시 객체 줄이기 순입니다.
- gen2를 크게 만드는 것은 오래 사는 객체 그래프입니다. 크기를 정하지 않은 캐시, 정적 리스트, 싱글턴이 붙잡은 클로저는 모두 수집기가 손댈 수 없는 지점까지 객체를 살려 둡니다. 상한을 둡니다.
- ASP.NET Core의 기본값은 Server GC이고 대부분의 서비스에 맞습니다. .NET 9부터는 힙 하나로 시작해 부하가 요구하는 만큼 늘리므로(DATAS, 기본 활성) 첫 할당부터 코어마다 힙을 잡지는 않습니다. 그래도 Workstation GC는 작은 사이드카나 프로세스를 빽빽이 채운 노드에 어울립니다. 거기서는 Server GC가 필요하다고 정한 힙 하나하나가 아무도 쓰지 않는 메모리로 쌓입니다.
- 컨테이너에서는 메모리 한도를 정하고 힙 하드 리밋이 거기서 유도되게 둡니다. 기본값은 75%입니다. 평상시 힙은 그 선에서 넉넉히 아래에 둡니다. 선에 붙어 사는 힙은 쉬지 않고 수집합니다.
- 운영 코드 경로에서 `GC.Collect()`를 부르지 않습니다. 피하려던 그 비싼 수집을 강제로 부르는 셈이고, 하필 가장 감당하기 어려운 순간에 부릅니다.
- `dotnet-counters`로 측정하고, 변경 전후로 부하 테스트를 돌려 재현합니다. 부하 아래에서 재보지 않은 GC 변경은 테스트해 본 것이 아닙니다.

## .NET에서는

수집기는 프로젝트 파일에서 설정하고, 아래 둘은 웹 프로젝트에서 이미 기본값입니다. 적어 두는 것은 어느 쪽을 의도했는지 밝히는 일입니다.

```xml
<!-- 프로젝트 파일: 기본값을 명시적으로 적었습니다. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

핫 패스에서는 할당하지 않은 버퍼가 곧 치르지 않은 수집입니다. `ArrayPool<T>`은 이미 존재하는 배열을 내주고, `Span<T>`은 그 배열을 복사 없이 잘라 씁니다.

```csharp
// 핫 패스에서는 할당 대신 빌립니다.
var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));          // Span은 복사 없이 잘라 씁니다
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer);
}

// 진단할 때는 수집기 자신의 시야를 읽습니다.
var info = GC.GetGCMemoryInfo();
logger.LogInformation("heap {Heap} MB, limit {Limit} MB, pause {Pause:P1}",
    info.HeapSizeBytes >> 20, info.TotalAvailableMemoryBytes >> 20, info.PauseTimePercentage / 100);
```

컨테이너 안에서는 수집기가 머신이 아니라 한도를 읽고, 그 한도에 맞춰 자기 크기를 정합니다.

```text
# 컨테이너: 메모리 limit 512Mi -> 힙 하드 리밋 기본값 75%(384 MB). 근거가 있을 때만 덮어씁니다.
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, 16진수
dotnet-counters monitor --process-id <pid> --counters System.Runtime
# .NET 9+:  dotnet.gc.pause.time, dotnet.gc.collections, dotnet.gc.last_collection.heap.size, dotnet.gc.heap.total_allocated
# .NET 8-:  time-in-gc, gen-0/1/2-gc-count, gc-heap-size, alloc-rate
```

`DOTNET_gcServer`, `GCHeapCount`, `GCConserveMemory` 같은 설정은 수집기가 일을 어떻게 나눌지를 바꿉니다. 지금의 분배가 문제라는 데 부하 테스트와 카운터가 함께 동의할 때만 바꿀 값입니다.
