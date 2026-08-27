---
title: "Queue-Based Load Leveling"
summary: "폭주하는 생산자와 일정한 소비자 사이에 큐를 두어, 폭주를 느끼지 않고 흡수하게 하는 방법입니다. 총량이 아니라 속도를 고르게 펴며, 유한한 큐일 때만 그것이 약속이 됩니다."
category: "복원력과 장애 대응"
scene: backpressure
sceneStep: 2
related:
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Spike Test
    slug: spike-test
references:
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

장면의 2단계는 이 패턴이 광고 그대로 도는 모습입니다. 유입이 3배가 되어도 소비자는 흔들리지 않고, 버퍼 아래쪽은 이미 편안하던 속도로 계속 일합니다. 거래의 전부는 이것입니다. 큐는 도착 속도의 급증을 깊이의 상승으로 바꾸고, 깊이는 감당할 수 없는 속도보다 시스템이 훨씬 견디기 쉬운 것입니다. 하류를 늘릴 필요도 없었고, 무엇을 알릴 필요도 없었고, 거절당한 요청도 없습니다. 마케팅 메일 발송, 배치 작업의 기상, 파트너의 야간 전송 같은 한때의 폭주라면 그것으로 해결이 끝나는 경우도 많습니다.

이것이 통하는 이유는 폭주가 유한하기 때문입니다. 고르게 펴는 일은 시간에 대한 산수입니다. 소비자가 초당 C개를 처리할 수 있고 생산자가 평균 초당 A개를 보내는데 A가 C보다 작다면, 버퍼가 넉넉하기만 하면 어떤 들쭉날쭉함도 견딜 수 있습니다. 폭주 사이사이에 큐가 비워지기 때문입니다. 버퍼가 값을 치르는 대상은 용량이 아니라 편차입니다. 이 말을 소리 내어 해 둘 값어치가 있습니다. 이 패턴은 자기가 고칠 수 없는 경우에 습관처럼 투입되기 때문입니다. A가 C보다 크고 그 상태가 이어지면 큐는 아무것도 펴지 않고 쌓기만 합니다. 그것이 멈추는 깊이는 없습니다.

그래서 이 단계의 후반부가 전반부보다 더 중요합니다. 유입이 배출을 넘는 동안 깊이는 자라기만 하고, 모든 항목의 대기도 함께 자랍니다. 버퍼에 400건이 들어 있고 소비자가 초당 50건을 처리할 때 도착한 항목은 눈길이 닿기까지 8초를 기다리고, 호출자의 타임아웃이 5초라면 그 일감은 처리되고도 결과가 버려집니다. 아무도 지켜보지 않는 고장 방식인데, 처리량은 멀쩡해 보이기 때문입니다. 소비자는 100%로 돌면서 늘 하던 일을 정확히 하고 있습니다. 모든 사용자가 타임아웃을 겪는 동안 대시보드는 초록색입니다.

그러니 경보를 걸 값은 깊이와 가장 오래된 항목의 나이 둘입니다. 깊이는 버퍼가 차오르는 중이라고 알려 주고, 나이는 항목이 실제로 겪는 것을 알려 주며, 호출자에게 할 수 있는 약속으로 이어지는 쪽은 나이입니다. 가장 오래된 항목이 2초를 넘지 않는다는 것을 안다면 쓸모 있는 것을 아는 셈입니다. 처리량만 안다면 큐가 따라가고 있는지에 대해 아무것도 모르는 것입니다. 포화된 시스템과 한가한 시스템은, 한가한 쪽에 일감이 없을 때 같은 처리량을 보이기 때문입니다.

큐는 유한해야 하고, 그러지 않으면 고르게 펴는 일에 끝이 없고 약속도 없습니다. 용량은 받아들일 수 있는 대기에서 나와야 합니다. 견딜 수 있는 최악의 대기 곱하기 소비자 속도입니다. 초당 50건에 2초면 100건이고, 101번째가 시스템이 결정을 내려야 하는 자리입니다. 기다리게 할지, 버릴지, 거절할지. 그 결정은 적어 두기가 불편하고, 바로 그래서 적어 둘 값어치가 있습니다. 대안은 프로세스가 죽을 때까지 자라는 버퍼이고, 그것은 새벽 세 시에 기계가 서투르게 내린 같은 결정이기 때문입니다.

고르게 펴는 것과 소비를 매끄럽게 만드는 것은 같지 않습니다. 소비자가 큐에 맞춰 늘어난다면 깊이는 낮게 유지되고, 산 것은 보호가 아니라 응답성입니다. 소비자를 일부러 고정해 두었다면, 속도 제한이 걸린 외부 API나 두들기지 않기로 한 데이터베이스, 좌석 수가 정해진 라이선스처럼, 깊이는 그 결정의 값이고 움직이는 것이 정상입니다. 무엇을 조정하기 전에 둘 중 어느 쪽을 하고 있는지부터 정하세요. 경보의 방향이 반대이기 때문입니다. 앞의 경우 큐가 계속 비지 않는다면 확장이 고장 난 것이고, 뒤의 경우에는 시스템이 제대로 도는 것입니다.
