---
title: "Batching"
summary: "여럿을 모아 한 번에 처리하는 방법입니다. 지연을 내주고 처리량을 사는 거래이므로 묶음 크기 상한과 대기 상한이 함께 필요하며, 큐가 결코 될 수 없는 해결책입니다."
category: "복원력과 장애 대응"
scene: backpressure
sceneStep: 4
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Spike Test
    slug: spike-test
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

장면의 4단계는 산수를 바꾸는 유일한 수입니다. 소비자가 한 번에 네 개씩 집기 시작하니 배출 속도가 두 배가 되고, 같은 폭주가 다시 와도 깊이는 바닥에서 거의 떠오르지 않습니다. 시스템의 다른 것은 하나도 바뀌지 않았습니다. 생산자는 전과 똑같이 보내고, 버퍼는 여전히 여덟 칸이고, 앞의 단계들은 그대로 다시 흘러갑니다. 달라진 것은 느리던 쪽이 그만큼 느리지 않다는 것뿐이고, 앞선 세 단계의 모든 문제는 그 하나의 사실을 다르게 말한 것이었습니다.

묶음 처리가 이기는 이유는, 항목마다 드는 비용의 대부분이 사실 항목마다 드는 것이 아니기 때문입니다. 왕복 한 번에는 고정된 값이 있습니다. 네트워크 홉, TLS 레코드, 명령 구문 분석, 트랜잭션 시작과 커밋, 잠금의 획득과 해제, 기록되는 로그 한 줄. 그 값은 실린 것이 한 행이든 500행이든 한 번만 치릅니다. `SqlBulkCopy` 한 번, `SendMessagesAsync` 한 번, 대량 색인 요청 한 번으로 500행을 보내면 고정 비용을 500번이 아니라 한 번만 냅니다. 항목마다 드는 일은 여전히 있고 여전히 진짜입니다. 무너지는 것은 부대 비용이고, 대개의 시스템에서는 그 부대 비용이 다수였습니다.

값은 지연이고, 그것을 치르는 것은 묶음에서 가장 먼저 온 항목입니다. 묶음이 비어 있을 때 도착한 항목은 묶음이 찰 때까지 기다립니다. 그래서 묶음에는 한계가 하나가 아니라 둘 필요합니다. 최대 크기와 최대 지연, 그리고 먼저 오는 쪽을 택합니다. 지연 상한이 없으면 한산한 시간이 멈춤으로 바뀝니다. 세 개가 도착하고 네 번째는 오지 않아, 그 셋은 트래픽이 살아날 때까지 그 자리에 앉아 있습니다. 하필 아무도 보고 있지 않은 때입니다. 상한이 있으면 느린 1분이 각 항목에 창 시간만큼만 값을 물리고, 그 창은 지연 예산 옆에 적어 두고 지킬 수 있는 숫자입니다.

묶음 크기도 어느 지점을 넘으면 공짜가 아닙니다. 묶음이 커지면 붙들리는 메모리가 늘고, 트랜잭션이 길어지고, 잠금이 길어지고, 재시도가 커지고, 실패가 뭉툭해집니다. 500개짜리 묶음에서 하나가 잘못되었을 때 500개 모두를 실패로 볼지, 묶음을 반씩 갈라 볼지, 나쁜 하나만 격리할지 누군가 정해야 합니다. 첫 번째 불량 행이 나오는 중이 아니라 나오기 전에 정하세요. 솔깃한 답인 "묶음 전체를 다시 시도"가, 독이 든 메시지 하나를 무한 반복으로 만들고 매번 죄 없는 499개까지 함께 끌고 내려가는 길이기 때문입니다.

묶음 처리는 재실행 안전성과도 맞물립니다. 일부만 적용된 묶음이 예외가 아니라 흔한 경우이기 때문입니다. 400개를 커밋하다 중간에 죽은 프로세스는 다시 돌려도 안전해야 하고, 그러려면 항목에 키가 있어야 하고 받는 쪽이 반복을 견뎌야 합니다. 최소 한 번 전달을 쓰는 파이프라인이라면 어차피 필요한 요구지만, 묶음 처리는 그것을 더 크게 말합니다. "일부가 남았다"와 "전부가 남았다" 사이의 틈이 이제 한 개가 아니라 400개 너비이기 때문입니다.

장면이 이 단계를 마지막에 두는 이유는 이것이 정직한 해결이고 다른 하나는 그렇지 않기 때문입니다. 계속 차오르는 큐 앞에서 솔깃한 변경은 큐를 키우는 것이고, 그것은 통합니다. 배지에 불이 들어오지 않고, 경보가 울리지 않고, 나머지는 아무것도 나아지지 않습니다. 대기는 길어지고 메모리는 커지고 진실의 순간은 피해지는 대신 미뤄집니다. 묶음 처리, 더 많은 소비자, 더 빠른 소비자. 이런 것들은 속도를 바꾸고, 애초에 잘못되어 있던 것은 속도뿐이었습니다. 더 큰 큐는 더 긴 거짓말일 뿐입니다.
