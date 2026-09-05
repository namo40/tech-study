---
title: "Server GC"
summary: "Server GC는 힙을 여러 수집기 스레드에 나눠 두고 병렬로 수집합니다. 메모리 사용량이 커지는 대신 수집이 만드는 멈춤이 짧아집니다. ASP.NET Core의 기본값이고, 컨테이너에서 가장 자주 잘못 남아 있는 설정이기도 합니다."
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

수집은 힙을 바꾸고 있는 스레드를 멈춰야 하므로, 멈춤을 짧게 하는 방법은 훑는 일을 여러 스레드에 나누는 것입니다. Server GC가 하는 일이 정확히 그것입니다. 힙 하나 대신 여러 개를 갖고, 각 힙은 자기 할당 예산과 전용 수집기 스레드를 지니며 논리 CPU당 최대 하나까지 늘어납니다. 수집은 그것들을 한꺼번에 돌립니다. 실제로 흐른 시간으로 본 멈춤은 대략 전체 작업을 힙 개수로 나눈 값이고, 초당 요청이 많은 서비스가 이 방식을 원하는 이유입니다.

대가는 메모리 사용량입니다. 힙마다 자기 gen0 예산이 있으니, 어떤 수집이든 일어나기 전에 프로세스가 할당하는 양은 힙 개수에 따라 늘고, 평상시 힙도 그만큼 커집니다. 이것은 의도한 교환입니다. 멈춤 시간을 사려고 메모리를 쓰는 것이고, 자기 머신이나 자기 컨테이너를 온전히 쓰는 서비스에는 맞는 교환입니다. 사이드카나 CLI 도구, 작은 프로세스를 수십 개 몰아넣은 노드에서는 맞지 않습니다. 그런 곳에서는 프로세스 하나하나가 머신 전체에 맞춰 크기를 잡는 것이 아무도 쓰지 않는 메모리로 쌓입니다.

실제로 힙을 몇 개 갖게 되는지는 더 이상 시작 시점에 한 번 정해지지 않습니다. .NET 9부터 Server GC는 DATAS(Dynamic Adaptation To Application Sizes)를 기본으로 켜고 돌며, DATAS는 언제나 힙 하나로 시작한 다음 부하가 움직이는 대로 힙을 늘리고 줄여 수집이 처리량에서 가져가는 몫을 2%라는 목표 근처로 유지합니다. 그래서 트래픽이 가벼운 작은 서비스의 메모리 사용량은 앞 문단이 말하는 것보다 Workstation GC 쪽에 훨씬 가깝고, 여분의 힙에 드는 비용은 바쁠 때만 치릅니다. `DOTNET_GCDynamicAdaptationMode=0`은 모든 힙을 미리 잡아 두던 옛 동작으로 되돌리므로, 지금 재고 있는 것이 둘 중 어느 쪽인지 알아 두는 편이 좋습니다.

컨테이너에서는 이 중 절반을 어긋나게 두기 쉽습니다. 런타임이 무엇을 보느냐가 어느 손잡이를 돌렸느냐에 달려 있기 때문입니다. limit 없이 CPU *request*만 두면 노드의 모든 코어가 보이므로, 64코어 노드의 2코어 서비스가 64에 맞춰 크기를 잡습니다. *limit*은 cgroup에서 읽어 올림하고(1.5는 2가 됩니다), 1코어 이하의 limit이면 설정이 무엇이라 하든 런타임이 Workstation GC를 씁니다. 논리 CPU가 하나일 때 언제나 그렇게 하기 때문입니다. 메모리와 CPU의 limit을 정하고, 컨테이너 안에서 `Environment.ProcessorCount`가 무엇을 보고하는지 확인하고, 그래도 맞지 않을 때만 힙 개수를 고정합니다.

```xml
<!-- 웹 프로젝트의 기본값입니다. 선택이 보이도록 적어 두었습니다. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# 같은 스위치를 환경 변수로 준 것이고, 컨테이너는 보통 이렇게 설정합니다.
DOTNET_gcServer=1
DOTNET_GCDynamicAdaptationMode=1     # DATAS. .NET 9부터 기본값이고, 0이면 모든 힙을 미리 잡습니다
DOTNET_GCHeapCount=0x2               # 힙 두 개로 고정, 16진수. DATAS 다음에 꺼내고 그 전에는 아닙니다
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, 16진수
```

동시 수집(백그라운드 수집)은 별도의 스위치이고 기본이 켜짐입니다. gen2 수집의 대부분을 애플리케이션 스레드와 나란히 돌게 해 주므로, 원래라면 긴 정지 하나였을 전체 수집이 짧은 정지 둘과 그 사이의 동시 작업으로 바뀝니다. 이것을 끄면(`ConcurrentGarbageCollection=false`) CPU와 메모리 부담이 조금 줄지만 그 이득을 도로 내주는 셈이고, 긴 멈춤이 아무 손해도 아닌 배치 작업에서만 말이 됩니다.

기본값이 아니라 숫자로 정합니다. 실제로 배포하는 모양의 머신에서 Server GC와 Workstation GC로 같은 부하 테스트를 돌리고, GC에 쓴 시간, 힙 크기, p99를 함께 놓고 비교합니다. 멈춤을 반으로 줄이면서 힙을 두 배로 만드는 Server GC는 여유가 있는 컨테이너에서는 이득이고, 예전 숫자에 맞춰 크기를 잡은 컨테이너에서는 재앙입니다. 메모리 한도와 수집기 선택을 한자리에서 함께 정해야 하는 이유입니다.
