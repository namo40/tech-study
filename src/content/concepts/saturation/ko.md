---
title: "Saturation"
summary: "유입이 용량을 넘을 때 생기는 대기줄입니다. 그때는 이미 처리량이 오르기를 멈춘 뒤라서 초과분이 전부 대기 시간이 되고, 지연은 바로 이 자리에 삽니다."
category: "요구사항과 품질 속성"
scene: throughput
sceneStep: 3
related:
  - label: Throughput
    slug: throughput
  - label: Utilization
    slug: utilization
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
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

장면의 3단계는 두 축이 완전히 갈라지는 순간입니다. 유입이 천장을 넘고, 그 순간부터 `out`은 움직이지 않습니다. 용량에 붙어 버리는데, 용량이라는 말이 원래 그런 뜻이기 때문입니다. 선 위로 넘친 부하는 어딘가로 가야 하고 남은 곳은 대기줄뿐이니, 칸이 하나씩 차고 `wait`도 같이 오릅니다. 서버는 100%인데 끝내는 양은 폭증이 시작되기 1초 전과 똑같습니다. 가득 참은 빠름이 아닙니다. 가득 참은 느림이 시작되는 곳입니다.

이것이 saturation의 전부이고, 따로 이름을 가질 만한 이유는 여기서 utilization이 정보를 잃기 때문입니다. 천장 위에서는 유입이 1% 초과든 세 배 초과든 `busy`가 똑같이 100%로 읽히니, 선형 구간에서 경고를 주던 숫자가 이제는 평평해서 쓸모가 없습니다. 아직 움직이는 것은 큐 깊이이고, 천장을 얼마나 지났는지에 비례해서 움직입니다. USE 방법이 utilization과 saturation을 따로 요구하는 이유가 이것입니다. 앞의 것은 나쁘다는 사실만 말하고, 뒤의 것은 얼마나 나쁜지를 말합니다.

포화된 시스템에서 지연은 일 자체의 성질이 아니라 줄에서의 자리가 만드는 성질입니다. 처리에 20ms가 드는 요청도 이미 줄 서 있는 모두의 뒤에서 기다리니, 응답 시간은 큐 깊이 곱하기 처리 시간에 자기 몫을 더한 값이 됩니다. 코드가 느려진 것은 아무것도 없습니다. 장면은 그 산수를 그대로 그립니다. 300ms마다 하나를 처리하는 서버 앞에 적체가 다섯 단위 있으면 대기는 1.5초이고, 조금 전이라면 즉시 끝났을 요청에도 똑같이 1.5초입니다. "느린 엔드포인트"를 프로파일링해서 고치려 하면 아무것도 나오지 않습니다. 시간이 거기서 쓰이고 있지 않기 때문입니다.

폭증이 멎어도 대기줄은 저절로 사라지지 않습니다. 유입이 용량과 정확히 같은 값으로 돌아오면 줄은 자라기를 멈출 뿐입니다. 들어오는 것보다 빠르게 빠져나가는 것이 없으니 적체와 그것이 만드는 대기는 있던 자리에 그대로 있습니다. 3단계와 4단계 사이의 박자가 이것이고, 장애 대응 중에 사람들이 꾸준히 틀리는 지점이기도 합니다. 적체를 빼려면 유입이 용량보다 낮거나 용량이 유입보다 높아야 하고, 걸리는 시간을 정하는 것은 두 속도의 차이뿐입니다. 3분에 걸쳐 쌓인 줄은 불균형이 정확히 뒤집혔을 때 3분이 걸리고, 차이가 더 작으면 더 오래 걸립니다.

그러니 처리량 대신 깊이와 나이를 보세요. 처리량은 가장 늦게 움직이고, 움직였을 때 가장 쓸모가 없습니다. 깊이는 폭증이 있다는 사실을 말해 주고, 가장 오래된 항목의 나이는 지금 요청이 실제로 무엇을 겪고 있는지를 말해 줍니다. 둘 다 무언가 고장 나기 전에 움직이고, 줄이 서는 모든 계층에서 읽을 수 있습니다. 스레드 풀 큐, 커넥션 풀 대기자, 브로커 지연, 디스크 큐 길이가 그렇습니다. 요청은 느린데 모든 span이 빨라 보인다면 사라진 시간은 그중 하나에 있습니다.

빠져나가는 길은 정확히 둘뿐이고, 장면의 3단계가 그중 하나를 고르지 않으니 여기서 분명히 이름을 붙여 둘 만합니다. 천장을 올리는 것, 즉 병목에 용량을 더하는 것입니다. 병목이 아닌 곳은 해당하지 않습니다. 아니면 유입을 내리는 것, 즉 흘려보내거나 조이거나 일을 만들어 내는 쪽을 밀어내는 것입니다. 나머지는 전부 자리 옮기기입니다. 더 큰 큐는 시간을 살 뿐이고, 불균형이 짧은 폭증이 아니라 계속되는 상태라면 같은 고장이 오기까지의 대기만 길어집니다. 그때 안에 담긴 일은 더 상해 있습니다.
