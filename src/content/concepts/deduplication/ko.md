---
title: "Deduplication"
summary: "중복 제거는 이미 처리한 id를 기억해 두고 같은 id로 다시 들어온 것을 버리는 일입니다. 최소 한 번 전달을 의도 하나에 효과 하나로 바꾸는 방법이 이것입니다."
category: "API와 실시간 통신"
scene: idempotency-key
sceneStep: 2
related:
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Message ID
    slug: message-id
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: TTL
    slug: ttl
  - label: Unique Constraint
    slug: unique-constraint
  - label: Retry
    slug: retry
  - label: Web-Queue-Worker
    slug: web-queue-worker
references:
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: The Idempotency-Key HTTP Header Field (IETF draft)
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
---

중복 제거는 id 저장소 하나와 규칙 하나입니다. 이 id가 저장소에 이미 있으면 이번 도착은 반복이니 작업을 다시 하지 않습니다. id는 보내는 쪽이 붙여야 합니다. 두 번의 도착이 하나의 의도라는 사실을 아는 것은 보내는 쪽뿐이기 때문입니다. HTTP에서는 `Idempotency-Key` 헤더가 그 역할을 하고, 큐에서는 메시지 id가, 브로커가 재전달마다 새 메시지 id를 찍는 경우에는 본문 안의 업무 id가 그 역할을 합니다. 중복을 버리기만 할 거라면 id만 저장해도 충분합니다. 결과까지 함께 저장하면 중복에 침묵 대신 제대로 된 답을 줄 수 있습니다. 그냥 넘어가는 소비자와 처음의 201을 그대로 다시 돌려주는 API의 차이가 여기서 갈립니다.

저장소가 어디에 있느냐가 실제로 무엇을 지켜 주는지를 결정합니다. 브로커도 스스로 중복을 걸러 낼 수 있고, Azure Service Bus는 설정한 기간 안에 이미 본 `MessageId`의 메시지를 버립니다. 하지만 그것이 덮는 범위는 브로커가 볼 수 있는 중복뿐입니다. 소비자가 효과를 낸 뒤 확인 응답을 보내기 전에 죽어서 같은 작업이 한 번 전달되고 두 번 처리되는 상황에는 아무 도움도 되지 않습니다. 여러분의 효과를 지키는 저장소는 그 효과 바로 옆에 있는 저장소이고, 가능하면 같은 트랜잭션 안에 있어야 합니다. 그래야 "처리함"을 기록하는 일과 실제 작업이 둘 다 일어나거나 둘 다 일어나지 않습니다. 업무 테이블에 건 고유 제약은 이 방식의 가장 값싼 형태이고, 별도의 저장소가 아예 필요 없습니다.

모든 중복 제거 저장소는 만료가 붙은 약속입니다. id를 영원히 들고 있으면 아무도 예산을 잡아 두지 않은 테이블이 계속 커지므로, id에는 수명을 줍니다. 그리고 그 수명이 곧 보장의 실제 범위입니다. 그 바깥에서는 중복과 새 요청을 구분할 수 없습니다. 보내는 쪽이 얼마나 오래 재시도할 수 있는지, 브로커가 얼마나 오래 재전달할 수 있는지에 맞춰 잡고 여유를 더한 다음, 그 숫자를 적어 둡니다. 이 값을 잘못 잡으면 늦게 도착한 중복이 새 작업으로 처리되는 형태로 문제가 드러나기 때문입니다. 선점도 원자적이어야 합니다. 읽고 나서 쓰는 대신 충돌하면 실패하는 INSERT여야 하고, 그렇지 않으면 같은 순간에 도착한 사본 둘이 나란히 빈 저장소를 확인하고 둘 다 진행합니다.
