---
title: "Offset"
summary: "공유 로그에 꽂아 둔 책갈피입니다. 한 구독이 어디까지 읽었는지를 가리키는 위치이고, 로그가 아니라 읽는 쪽이 쥡니다. 그래서 같은 이벤트를 두 독자가 서로 다른 자리에서 읽어도 누구도 상대를 붙잡지 않습니다."
category: "메시징과 이벤트 처리"
scene: publish-subscribe
sceneStep: 2
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Checkpoint
    slug: checkpoint
  - label: Event Stream
    slug: event-stream
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

offset은 책갈피이고, 장면의 2단계는 그 책갈피를 누가 쥐느냐를 말합니다. 로그는 이벤트 여덟 개를 쥔 채 어느 것도 넘겨주지 않습니다. 구독이 읽을 때 바뀌는 것은 로그가 아니라 그 구독의 이름 아래 있는 숫자와, 칸 하나 밑에 놓인 막대입니다. A는 최신 이벤트와 나란히 서 있고 B는 둘 뒤처져 있으며, 두 책갈피는 같은 로그의 서로 다른 자리에 동시에 꽂혀 있습니다. 배달이 아무것도 꺼내 가지 않기 때문에 가능한 일입니다.

여기가 토픽과 큐가 갈라지는 선이고, 정확히 말해 둘 필요가 있습니다. 작업 큐에서는 브로커가 상태를 쥡니다. 누군가 처리하는 동안 메시지는 잠겨 있고 ack하면 사라지므로, 큐의 내용은 소비자들이 무엇을 했는지에 따라 결정됩니다. 로그에서는 브로커가 이벤트만 쥐고 위치는 소비자가 각자 쥡니다. B의 위치는 로그 어디에도 나타나지 않고 A의 위치는 B 안에 나타나지 않으므로, 큐에서 흔한 그 실패, 곧 느린 소비자 하나가 잠금 뒤에 모두를 세워 두는 일이 벌어질 자리가 없습니다. 대가는 브로커가 남은 일의 양을 더는 알려 주지 못한다는 점입니다. 그 값은 로그의 머리에서 offset을 빼서 구하고, 알림을 걸 값도 바로 그것입니다.

offset은 "시작"이 무슨 뜻인지도 정합니다. 저장된 위치가 없는 구독에는 시작점을 알려 줘야 하고, 이 선택은 눈감고 기본값을 쓸 자리가 아닙니다. `EventPosition.Earliest`는 보존 기간이 아직 쥐고 있는 것을 전부 재생하고, `EventPosition.Latest`는 지금부터 오는 것만 받으며, 특정 구간을 다시 처리하고 싶을 때 쓸 시퀀스 번호나 큐 적재 시각 기준의 위치도 있습니다. Kafka에서는 같은 결정이 `auto.offset.reset`이라는 이름을 답니다. 어느 쪽으로 틀려도 결과는 은근하지 않습니다. 역사를 다시 처리할 준비가 안 된 서비스에 `Earliest`를 주면 그대로 잠기고, 새 프로젝션에 `Latest`를 주면 과거가 있어야 할 자리에 조용히 구멍이 남습니다.

이 책갈피가 설명에 그치지 않고 쓸모를 갖는 이유는 두 가지 성질입니다. 앞으로만 움직이므로 배달은 언제나 바로 다음 이벤트이고 건너뛰기가 아닙니다. 그리고 일단 지나온 자리는 누군가 일부러 되감지 않는 한 지나온 것으로 남습니다. 또 옮기는 값이 쌉니다. 옮기는 일이 브로커에게 보내는 메시지가 아니라 산술이기 때문입니다. 싸지 않은 것은 재기동을 넘어 살아남게 만드는 쪽이고, 그것은 이름이 다른 다른 물건입니다. checkpoint는 어딘가 durable한 곳에 적어 둔 offset입니다. 장면에서 둘을 일부러 떼어 그린 이유가 여기 있습니다. B의 offset은 B의 메모리에 있고 B의 checkpoint는 그렇지 않으며, 그 차이가 곧 3단계가 말하는 것입니다.
