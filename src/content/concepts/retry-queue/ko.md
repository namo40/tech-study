---
title: "Retry Queue"
summary: "재시도 큐는 실패한 메시지를 올려 두는 옆길입니다. 시도마다 길어지는 지연만큼 붙들고 있다가 줄 뒤로 되돌려 놓고, 그렇게 해서 머리 막힘을 배경에서 치르는 비용으로 바꿉니다."
category: "메시징과 이벤트 처리"
scene: poison-message
sceneStep: 3
related:
  - label: Poison Message
    slug: poison-message
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Exactly-Once
    slug: exactly-once
  - label: Backpressure
    slug: backpressure
references:
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: MassTransit exceptions and redelivery
    url: https://masstransit.io/documentation/concepts/exceptions
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
---

3단계가 시작되는 순간을 보세요. 실패한 메시지가 소비자에서 옆으로 실려 나가고, 본류는 즉시 회복합니다. 멈춰 서 있던 큐가 한 건씩 계속 빠지고 깊이가 줄고, 십 초 넘게 오르기만 하던 대기 나이가 내려옵니다. 나쁜 메시지 자체는 아무것도 달라지지 않았습니다. 달라진 것은 그것이 더 이상 선두에 있지 않다는 사실이고, 재시도 큐의 값어치는 그게 전부입니다. 머리 막힘은 실패가 일으키는 것이 아닙니다. 다른 모두가 기다리는 자리에서 그 실패를 재시도하는 것이 일으킵니다.

장치는 지연 하나와 되돌아오는 지점 하나입니다. 메시지를 소비자가 읽지 않는 곳으로 옮기고 타이머를 걸고, 타이머가 울리면 선두가 아니라 꼬리로 큐에 다시 합류시킵니다. 꼬리로 돌려보내는 것은 지연만큼이나 중요합니다. 선두로 되돌리면 타이머가 끝나는 순간 벽을 다시 세운 것과 같습니다. 지연은 시도마다 길어지고, 첫 번째가 5초였는데 두 번째 링이 15초로 올라오는 장면이 그 이야기입니다. 여기서 백오프는 힘들어하는 하위 시스템에 대한 예의이기도 하지만 그것만은 아닙니다. 메시지 하나가 소비자의 주의를 얼마까지 가져갈 수 있는지에 대한 예산입니다.

만드는 방법은 흔히 셋입니다. 예약 배달을 지원하는 브로커라면 미래의 시각으로 메시지를 자기 자신에게 보내면 되고, Azure Service Bus가 그것을 제공합니다. 쓸 수 있다면 가장 값싼 선택입니다. 메시지별 유효 기간과 본 큐를 가리키는 데드 레터 대상을 가진 전용 큐를 두면 만료가 곧 재합류가 되는데, RabbitMQ의 고전적인 구성입니다. 아니면 백오프 단계마다 지연 큐를 하나씩 두고 시도 번호에 맞는 큐로 보내는 방법이 있습니다. 로그에는 메시지별 타이머가 없으므로 Kafka 생태계가 보통 이렇게 합니다. 셋 다 모양이 같고 함정도 같습니다. 다시 배달된 메시지는 브로커가 보기에 대개 새 메시지라서 전달 횟수가 다시 1부터 시작합니다. 시도 번호는 헤더에 직접 실어야 합니다. 그러지 않으면 4단계가 기대는 예산이 영원히 소진되지 않습니다.

마지막으로 솔직해야 할 것은 재시도 큐가 고쳐 주지 않는 부분입니다. 독 메시지를 성공하게 만들어 주지 않고, 혹시 그럴지도 모른다는 가정으로 조율하면 안 됩니다. 지연 사다리가 몇 시간까지 올라가면 끝내 성공할 수 없는 메시지가 몇 시간 동안 시스템에 남아, 시도할 때마다 자리 하나와 경보 하나와 누군가의 주의를 먹습니다. 실패를 먼저 분류하세요. 영구적인 오류는 재시도 큐에 들어가지도 않아야 하고, 첫 시도에서 곧장 데드 레터 큐로 가야 합니다. 재시도 큐는 나중에 성공할 가능성이 실제로 있는 메시지를 위한 것이고, 그 가능성을 시험하는 동안 본류에게 시간을 되사 주기 위한 것입니다.
