---
title: "Allocation Rate"
summary: "프로세스가 초당 할당자에게 요구하는 바이트 수입니다. 그 자체가 비용은 아니고, 수집기가 얼마나 자주 도는지를 정하는 입력값이며 그래서 힙이 어떤 압박을 받는지를 정합니다."
category: "컨테이너와 오케스트레이션"
scene: memory-pressure
sceneStep: 2
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Garbage Collection
    slug: garbage-collection
  - label: Object Pool
    slug: object-pool
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Large Object Heap
    slug: large-object-heap
  - label: Memory Limit
    slug: memory-limit
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Fundamentals of garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: "dotnet-counters diagnostic tool"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: "Memory management and patterns in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/memory
---

장면의 두 번째 단계는 숫자 하나만 바꿉니다. 할당 속도가 20 MB/s에서 60 MB/s로 올라가고 무대의 나머지는 손대지 않습니다. 같은 한도, 같은 수집기, 같은 코드 경로, 같은 요청입니다. 그다음 벌어지는 모든 일, 그러니까 수집기가 다섯 배 자주 도는 것도, 정지가 2밀리초에서 12밀리초 쪽으로 올라가는 것도, 게이지가 위로 밀려 올라가 내려오지 않는 것도 전부 그 한 번의 변경에서 나옵니다. 할당 속도에 따로 페이지를 줄 이유가 여기 있습니다. 이것이 입력이고, 다이어그램의 나머지는 출력입니다.

원리는 보기보다 단순합니다. 수집은 초가 아니라 바이트로 예약됩니다. 런타임은 신생 영역에 예산을 주고, 프로그램이 그만큼을 할당하면 수집기가 돕니다. 속도가 두 배가 되면 예산은 절반의 시간에 차므로 수집기도 두 배 자주 돌고, 그 과정에서 동작이 달라지지도, 임계값을 넘지도, 경고가 나오지도 않습니다. 할당 회귀의 첫 증상이 메모리 경보인 적이 없는 이유가 이것입니다. 첫 증상은 아무 이유 없이 움직인 지연 그래프이고, 프로세스 안의 모든 요청이 이제 두 배 자주 도는 수집의 몫을 나눠 내고 있기 때문입니다.

두 번째 효과가 있고, 빈도를 압박으로 바꾸는 것은 바로 그쪽입니다. 대부분의 객체는 일찍 죽으라고 만들어지며, 수집기의 효율은 그 객체들이 도착 전에 도달 불가능해질 시간을 벌었는지에 달려 있습니다. 주기가 짧아지면 수집기는 더 일찍 나타나고, 아직 참조되고 있는 부분을 더 많이 발견하고, 회수하는 대신 승격시킵니다. 그래서 할당 속도가 높아지는 것은 같은 수집을 더 많이 한다는 뜻이 아닙니다. 매번 직전보다 덜 되찾게 되고, 그것이 장면에서 게이지가 올라가는 동안 톱니가 얕아지는 모습으로 그려집니다. 이것을 조기 승격이라고 부르며, 라이브 세트는 그대로인데 릴리스를 넘기며 gen2만 자라는 것이 대시보드에서 보이는 모습입니다.

재는 일은 어렵지 않고, 무엇을 바꾸기 전에 해 둘 가치가 있습니다. `dotnet-counters monitor --counters System.Runtime[alloc-rate]`는 살아 있는 프로세스에서 구간당 할당 바이트를 보고하며, 혼자 보지 말고 `gc-heap-size`, `time-in-gc`와 나란히 읽어야 합니다. 중요한 것은 절대값이 아닙니다. 500 MB/s를 할당하면서 그만한 여유가 있는 배치 작업은 완전히 건강합니다. 중요한 것은 프로세스가 만들어 내는 양과 주어진 한도 안에서 수집기가 흡수할 수 있는 양의 비율입니다. 트레이스의 할당 프로파일링이 나머지를 채워 어느 호출 지점이 원인인지 알려 주는데, 그 목록은 대개 다들 예상하는 것보다 훨씬 짧습니다.

증상이 아니라 이 숫자를 봐야 하는 이유는, 이 그림 전체에서 실제로 바꿀 수 있는 것이 할당 속도뿐이기 때문입니다. 한도는 플랫폼이 강제하는 천장이고, 수집기의 동작은 대부분 그 한도에서 파생되며, 트래픽은 사업입니다. 남는 것은 요청 하나가 몇 바이트를 쓰느냐이고, 그 값은 거의 언제나 피할 수 있는 몇 가지가 지배합니다. 쓰기 전에 문자열로 담아 두는 응답, 이미 스트리밍되던 것에 붙인 `ToList()`, 빌리는 대신 호출마다 할당하는 큰 배열, 모든 요청에서 도는 로깅 경로의 `string.Format` 같은 것들입니다. 이 중 두세 개만 고쳐도 속도가 자릿수 단위로 내려가는 일이 흔하고, 장면이 보여 주는 다른 숫자도 함께 내려갑니다.

네 번째 단계를 정직하게 만들어 주는 것도 이 숫자입니다. 큰 버퍼를 풀로 돌린다고 해서 수집기가 더 좋은 알고리즘을 얻거나 컨테이너가 더 넓어지지는 않습니다. 바이트가 사라질 뿐입니다. 그래서 신생 영역이 천천히 차고, 수집기가 덜 자주 돌고, 발견되는 것 중 죽을 시간을 번 비율이 늘고, 한 번에 더 많이 회수되어 힙이 천장보다 한참 아래에 자리를 잡습니다. 회복 전체가 한 번 당긴 지렛대 하나이고, 인과의 화살표는 두 번째 단계가 달렸던 방향 그대로입니다.
