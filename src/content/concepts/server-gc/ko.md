---
title: "Server GC"
summary: "Server GC는 프로세스에 코어마다 힙 하나와 수집기 스레드 하나를 두고 병렬로 수집합니다. 메모리 사용량이 커지는 대신 수집이 만드는 멈춤이 짧아집니다. ASP.NET Core의 기본값이고, 컨테이너에서 가장 자주 잘못 남아 있는 설정이기도 합니다."
category: "성능과 최적화"
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

수집은 힙을 바꾸고 있는 스레드를 멈춰야 하므로, 멈춤을 짧게 하는 방법은 훑는 일을 여러 스레드에 나누는 것입니다. Server GC가 하는 일이 정확히 그것입니다. 힙 하나 대신 코어마다 하나씩 갖고, 각 힙은 자기 할당 예산과 전용 수집기 스레드를 지니며, 수집은 그것들을 한꺼번에 돌립니다. 실제로 흐른 시간으로 본 멈춤은 대략 전체 작업을 힙 개수로 나눈 값이고, 초당 요청이 많은 서비스가 이 방식을 원하는 이유입니다.

값은 메모리 사용량으로 치릅니다. 힙마다 자기 gen0 예산이 있으니, 어떤 수집이든 일어나기 전에 프로세스가 할당하는 양은 힙 개수만큼 곱해지고, 평상시 힙도 그만큼 커집니다. 이것은 의도한 교환입니다. 멈춤 시간을 사려고 메모리를 쓰는 것이고, 자기 머신이나 자기 컨테이너를 온전히 쓰는 서비스에는 맞는 교환입니다. 사이드카나 CLI 도구, 작은 프로세스를 수십 개 몰아넣은 노드에서는 맞지 않습니다. 그런 곳에서는 프로세스마다 코어 수만큼 힙을 잡는 것이 아무도 쓰지 않는 메모리로 쌓입니다.

컨테이너에서는 이 중 절반을 어긋나게 두기 쉽습니다. 런타임은 자기가 볼 수 있는 CPU 수로 힙 개수를 정하는데, 코어의 일부로 표현한 CPU 한도는 컨테이너 런타임이 따로 제한하지 않는 한 프로세스가 노드의 모든 코어를 보게 둡니다. 그러면 힙을 돌릴 CPU 시간보다 훨씬 많은 힙을 가진 프로세스가 되고, 그 힙들은 각자 예산을 붙들고 있습니다. 컨테이너의 CPU와 메모리 한도를 정하고, 프로세스가 실제로 무엇을 보는지 확인하고, 그래도 힙 개수가 맞지 않으면 직접 고정하세요.

```xml
<!-- The default for a web project; written down so the choice is visible. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# Same switches as environment variables, which is how a container usually sets them.
DOTNET_gcServer=1
DOTNET_GCHeapCount=0x2         # two heaps, hex; only with a measurement that says so
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
```

동시 수집(백그라운드 수집)은 별도의 스위치이고 기본이 켜짐입니다. gen2 수집의 대부분을 애플리케이션 스레드와 나란히 돌게 해 주므로, 원래라면 긴 정지 하나였을 전체 수집이 짧은 정지 둘과 그 사이의 동시 작업으로 바뀝니다. 이것을 끄면(`ConcurrentGarbageCollection=false`) CPU와 메모리 부담이 조금 줄지만 그 이득을 도로 내주는 셈이고, 긴 멈춤이 아무 손해도 아닌 배치 작업에서만 말이 됩니다.

기본값이 아니라 숫자로 정하세요. 실제로 배포하는 모양의 머신에서 Server GC와 Workstation GC로 같은 부하 테스트를 돌리고, `time-in-gc`, `gc-heap-size`, p99를 함께 놓고 비교합니다. 멈춤을 반으로 줄이면서 힙을 두 배로 만드는 Server GC는 여유가 있는 컨테이너에서는 이득이고, 예전 숫자에 맞춰 크기를 잡은 컨테이너에서는 재앙입니다. 메모리 한도와 수집기 선택을 한자리에서 함께 정해야 하는 이유입니다.
