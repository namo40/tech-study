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

Workstation GC는 단순한 구성입니다. 힙 하나, gen0 예산 하나, 전용 수집기 스레드는 없습니다. 어떤 스레드가 할당하지 못하면 그 스레드가 직접 수집을 수행하고 하던 일을 이어 갑니다. 작업을 나눌 병렬성이 없으므로 같은 크기의 살아 있는 집합을 수집해도 Server GC보다 실제 시간이 더 걸립니다. 그리고 서비스 곁에서 돌아가는 것들 대부분에는 그 차이가 전혀 문제되지 않습니다.

대신 얻는 것은 작은 크기입니다. 힙이 하나면 예산도 코어마다 하나가 아니라 하나뿐이라서, 프로세스는 첫 수집에 더 일찍 닿고 평상시 힙도 더 작은 자리에 자리 잡습니다. 작은 프로세스 스무 개가 도는 노드에서는 그 차이가 곧 메모리 청구서 전부입니다. 초당 몇 건을 중계하는 사이드카, 마이그레이션 도구, 작업 집합이 작은 큐 소비자, 그리고 CPU를 한 조각만 받는 모든 것은 크기가 몇 분의 일인 힙을 조금 더 자주 수집하는 편이 낫습니다.

프로세스가 CPU를 온전히 갖지 못할 때도 이쪽이 더 안전한 기본값입니다. Server GC는 수집기 스레드를 돌릴 코어가 있다고 전제하고 그것들을 띄웁니다. 반 코어로 제한된 컨테이너에서도 스레드는 그대로 뜨고, 프로세스가 실제로 가진 시간을 두고 요청 스레드와 다툽니다. 빡빡한 CPU 한도 아래에서 돌아야 하는데 Server GC가 다투고 있다면, Workstation GC는 그 다툼을 아예 없애 줍니다. `GCHeapCount`를 고정하는 것이 둘 사이의 중간 길입니다.

```xml
<!-- A sidecar or a tool: one heap, and still collect in the background. -->
<PropertyGroup>
  <ServerGarbageCollection>false</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# The same choice as environment variables.
DOTNET_gcServer=0
DOTNET_gcConcurrent=1
dotnet-counters monitor --process-id <pid> System.Runtime   # compare gc-heap-size and time-in-gc against Server GC
```

무엇이 바뀌지 않는지도 봐 두세요. 세대, 승격, large object heap, 85,000바이트 기준, 컨테이너 메모리 한도에서 유도되는 힙 하드 리밋은 모두 똑같이 동작합니다. 달라지는 것은 힙 개수와 누가 수집을 수행하느냐뿐입니다. Server GC에서 값을 하던 할당 줄이기 기법은 여기서도 그대로 값을 하고, 수집기 모드를 건드리는 일은 여전히 첫 수가 아니라 마지막 수입니다.

둘 사이의 선택은 실제로 쓰는 배포 형태에서 부하 테스트로 정하고, `gc-heap-size`, `time-in-gc`, p99를 나란히 놓고 비교합니다. Workstation GC에서는 메모리 한도 아래에 여유롭게 들어가는데 Server GC에서는 OOM으로 죽는 파드는 어느 쪽을 원하는지 이미 말한 것이고, 수집을 힙 넷에 나눴더니 p99가 반으로 줄어든 서비스도 마찬가지입니다.
