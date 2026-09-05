---
title: "Workstation GC"
summary: "Workstation GC는 힙 하나를 두고, 자리가 없어진 그 스레드가 직접 수집합니다. 프로세스는 작아지고 멈춤은 평범해집니다. 사이드카나 도구, 프로세스를 여럿 돌리는 노드처럼 프로세스마다 코어 수만큼 힙을 잡는 것이 아무도 쓰지 않는 메모리가 되는 곳에 맞습니다."
category: "성능과 최적화"
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Server GC
    slug: server-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Request
    slug: resource-request
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

Workstation GC는 단순한 구성입니다. 힙 하나, gen0 예산 하나, 코어마다 두는 수집기 스레드는 없습니다. 블로킹 수집은 자리가 없어진 그 스레드에서 돌고 그 스레드는 하던 일을 이어 갑니다. 여기서도 기본으로 켜져 있는 background gen2는 대신 전용 스레드 하나에서 돕니다. 어느 쪽이든 작업을 나눌 병렬성이 없으므로 같은 크기의 살아 있는 집합을 수집해도 Server GC보다 실제 시간이 더 걸립니다. 그리고 서비스 곁에서 돌아가는 것들 대부분에는 그 차이가 전혀 문제되지 않습니다.

대신 얻는 것은 작은 크기이고, 조건 없이 얻습니다. 힙이 하나면 절대 늘어나지 않는 gen0 예산 하나뿐이라서, 프로세스는 첫 수집에 더 일찍 닿고 평상시 힙도 더 작은 자리에 자리 잡습니다. 작은 프로세스 스무 개가 도는 노드에서는 그 차이가 곧 메모리 청구서 전부입니다. 초당 몇 건을 중계하는 사이드카, 마이그레이션 도구, 작업 집합이 작은 큐 소비자, 그리고 CPU를 한 조각만 받는 모든 것은 크기가 몇 분의 일인 힙을 조금 더 자주 수집하는 편이 낫습니다.

프로세스가 CPU를 온전히 갖지 못할 때도 이쪽이 더 안전한 기본값이지만, 사람들이 흔히 드는 그 경우는 아닙니다. 반 코어 limit은 논리 CPU 하나로 올림되고, 논리 CPU가 하나면 런타임은 설정이 무엇이라 하든 Workstation GC를 쓰므로 정할 것이 없습니다. 경합이 생기는 경우는 큰 노드 위의 작은 limit입니다. Server GC는 올림된 limit에 맞춰(limit 없이 CPU request만 두었다면 노드의 모든 코어에 맞춰) 힙과 스레드의 크기를 잡고, 그 수집기 스레드들이 요청 스레드와 같은 할당량 조각을 두고 다툽니다. 그런 자리에서 Workstation GC는 그 다툼을 아예 없애 줍니다. `GCHeapCount`를 고정하는 것이 둘 사이의 중간 길입니다.

```xml
<!-- 사이드카나 도구입니다. 힙은 하나이고, 그래도 백그라운드로 수집합니다. -->
<PropertyGroup>
  <ServerGarbageCollection>false</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# 같은 선택을 환경 변수로 준 것입니다.
DOTNET_gcServer=0
DOTNET_gcConcurrent=1
dotnet-counters monitor --process-id <pid> --counters System.Runtime
# Server GC와 비교합니다. .NET 9 이상에서는 dotnet.gc.last_collection.heap.size와 dotnet.gc.pause.time,
# .NET 8 이하에서는 gc-heap-size와 time-in-gc입니다.
```

무엇이 바뀌지 않는지도 봐 둡니다. 세대, 승격, large object heap, 85,000바이트 기준, 컨테이너 메모리 한도에서 유도되는 힙 하드 리밋은 모두 똑같이 동작합니다. 달라지는 것은 힙 개수와 누가 수집을 수행하느냐뿐입니다. Server GC에서 값을 하던 할당 줄이기 기법은 여기서도 그대로 값을 하고, 수집기 모드를 건드리는 일은 여전히 첫 수가 아니라 마지막 수입니다.

둘 사이의 선택은 실제로 쓰는 배포 형태에서 부하 테스트로 정하고, 힙 크기, GC에 쓴 시간, p99를 나란히 놓고 비교합니다. Workstation GC에서는 메모리 한도 아래에 여유롭게 들어가는데 Server GC에서는 OOM으로 죽는 파드는 어느 쪽을 원하는지 이미 말한 것이고, 수집을 힙 넷에 나눴더니 p99가 반으로 줄어든 서비스도 마찬가지입니다.
