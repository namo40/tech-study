---
title: "Utilization"
summary: "자원 중에서 지금 쓰이고 있는 비율입니다. 대기 시간이 오르기 시작하기 전에 천장이 얼마나 남았는지를 알려 주기 때문에, 가장 싼 조기 신호입니다."
category: "요구사항과 품질 속성"
scene: throughput
sceneStep: 2
related:
  - label: Throughput
    slug: throughput
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "Collect metrics in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-collection
---

장면의 2단계는 곡선에서 지루한 구간이고, 지루하다는 것이 바로 이 구간의 쓸모입니다. 유입이 오르고 슬롯 행이 채워지며 `busy`가 25%에서 40%, 다시 80%로 오르는데 `out`도 그 내내 함께 오릅니다. 줄은 비어 있고 대기 시간은 0으로 남습니다. 이것이 선형 구간입니다. 더 들어온 부하 한 단위가 그대로 더 끝나는 일 한 단위가 되고, 읽는 사람이 겪는 것 중에 달라진 것은 서버가 더 많이 하고 있다는 사실뿐입니다.

utilization을 볼 만한 이유는 바로 그 구간에서 이것만 움직이기 때문입니다. 선형 구간의 지연은 평평하니 지연 경보는 울리지 않습니다. 처리량은 오르고 있으니 처리량 경보도 울리지 않고, 오히려 좋은 소식처럼 보입니다. 오류율은 0입니다. 그동안 조용히 무언가를 말해 주고 있던 유일한 숫자가 자원 중 쓰이고 있는 비율입니다. 그것이 천장까지의 거리이고, 다음에 무슨 일이 일어날지를 예고하는 것은 그 거리뿐이기 때문입니다.

예고하는 내용이 선형이 아니라는 점이 사람을 걸려 넘어지게 합니다. 대기 시간은 남은 여유의 역수에 대체로 비례해서 자라니, 40%에서 50%로 가는 데는 거의 비용이 들지 않지만 90%에서 95%로 가면 대기 지연이 대략 두 배가 됩니다. utilization 대 지연 그래프는 하키 스틱이고, 평평한 부분이 가파른 부분보다 훨씬 깁니다. 시스템이 몇 달 동안 멀쩡해 보이다가 어느 바쁜 오후에 무너지는 이유가 이것입니다. 장면의 3단계가 그 곡선의 끝이 어떤 모습인지 보여 줍니다.

그래서 목표로 삼을 숫자는 utilization이 아니라 여유이고, 그 값은 발견하는 것이 아니라 고르는 것입니다. 피크에서 70~80%가 흔한 답인데, 미신이 아닙니다. 폭증을 흡수하고, 인스턴스 하나를 잃고도 버티고, 트래픽이 바뀌던 순간에 이미 떠 있던 일을 끝낼 만큼의 여분을 남기는 값입니다. 누군가 장비를 95%로 돌린다고 자랑한다면 그가 산 것은 낮은 청구서와 나쁜 1분에 대한 답이 없는 시스템입니다. 산수를 반대로 하면 됩니다. 어떤 폭증까지 견디고 싶은지 정하면 utilization 목표는 거기서 따라 나옵니다.

측정에서 걸리기 쉬운 함정이 둘 있습니다. 하나는 평균입니다. 1분 동안 50%인 자원은 30초 동안 100%였을 수 있고, 100%로 보낸 30초는 실제 사용자가 서 있는 대기줄입니다. 1분 평균이 아니라 짧은 구간과 높은 백분위로 보세요. 다른 하나는 엉뚱한 자원을 재는 것입니다. utilization은 자원마다 따로이니 CPU가 30%라는 사실은 100%인 커넥션 풀에 대해 아무것도 말해 주지 않는데, 요청이 실제로 기다리는 것은 그 풀입니다. 여기서는 USE 방법이 규율이 됩니다. 자원마다 utilization과 saturation과 오류를 보되, 그래프로 그리기 쉬운 자원이 아니라 바닥날 수 있는 자원을 대상으로 하면 됩니다.

.NET에서 바닥나는 자원은 CPU인 경우가 드뭅니다. 스레드 풀, `SemaphoreSlim` 게이트, 엔드포인트별 `HttpClient` 커넥션 한도, SQL 커넥션 풀은 모두 뒤에 큐를 달고 있는 고정 크기 물건이고, 각각 읽을 수 있는 숫자가 있습니다. 직접 한도를 건 것에는 사용 중인 허가 수를 설정된 허가 수와 나란히 내보내고, 프레임워크가 한도를 거는 것에는 `threadpool-queue-length`와 풀 카운터를 보면 됩니다. 그중 하나라도 한도 근처에 붙어 있으면 장면이 그리는 것과 같은 경고로 읽으세요. 천장이 가깝고, 다음에 오는 것은 대기줄입니다.
