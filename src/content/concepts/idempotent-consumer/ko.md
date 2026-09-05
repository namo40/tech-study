---
title: "Idempotent Consumer"
summary: "반복해도 결과가 같은 소비자(idempotent consumer)는 같은 메시지를 두 번 받아도 시스템을 한 번 처리했을 때와 같은 상태로 남겨 두는 소비자이고, 최소 한 번 전달을 견딜 만한 것으로 만들어 주는 것이 이 성질입니다."
category: "메시징과 이벤트 처리"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotency
    slug: idempotency
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: At-Least-Once
    slug: at-least-once
  - label: Unique Constraint
    slug: unique-constraint
  - label: TTL
    slug: ttl
references:
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: MassTransit consumers
    url: https://masstransit.massient.com/concepts/consumers
---

쓸 만한 브로커라도 자기 트랜잭션 경계 바깥에서는 하나같이 최소 한 번 전달만 약속하므로, 핸들러는 같은 메시지를 두 번 보게 됩니다. 효과를 낸 뒤 확인 응답 전에 죽은 소비자, 네트워크가 갈라진 뒤의 재전달, 리밸런싱 뒤의 재생, 데드 레터 큐에서 한 묶음을 되돌리는 운영자가 모두 그 원인입니다. 이것을 흡수할 수 있는 자리는 소비자뿐입니다. 효과가 무엇이었는지 아는 곳이 거기뿐이기 때문입니다. 흡수하는 방법은 둘 중 하나입니다. 반복임을 알아보고 아무것도 하지 않거나, 몇 번을 돌려도 같은 결과가 나오는 형태로 효과를 쓰는 것입니다.

반복을 알아보는 쪽은 메시지 id 저장소 하나와 그에 대한 선점으로 이루어지고, 그 선점은 원자적이어야 하며 효과와 같은 트랜잭션 안에 있어야 합니다. 주문 행을 쓰는 트랜잭션 안에서 고유 제약이 걸린 테이블에 메시지 id를 `INSERT`하면 둘 다 일어나거나 둘 다 일어나지 않습니다. 읽고 나서 쓰는 방식은 그렇지 않아서, 같은 순간에 도착한 사본 둘이 나란히 빈 저장소를 보고 둘 다 진행합니다. 효과가 저장소와 같은 데이터베이스에 있지 않으면 문제는 사라지지 않고 자리만 옮깁니다. 결제 API를 호출한 다음 id를 기록하는 것은 다시 두 시스템이기 때문입니다. 보통은 호출 자체에 키를 실어 보내 상대 쪽이 중복을 걸러 내게 하거나, outbox 행을 써 두고 별도 프로세스가 호출하게 해서 빠져나옵니다.

반복을 설계로 없앨 수 있다면 그쪽이 낫습니다. 추가 테이블도, 만료도 필요 없기 때문입니다. 업무 id를 키로 삼은 upsert, 증가 대신 절대값 지정, 이미 목표 상태인 행에는 아무 일도 하지 않는 상태 전이가 모두 구조상 두 번 실행해도 안전합니다. 저장소를 피할 수 없다면 id에 수명을 주고 그 기간이 무엇을 뜻하는지 알아 둡니다. 그 바깥에서는 늦게 온 중복과 새 작업을 구분할 수 없습니다. 브로커가 얼마나 오래 재전달할 수 있는지, 운영자가 데드 레터 큐의 한 묶음을 되돌리는 데 얼마나 걸릴 수 있는지에 맞춰 잡고, 여유를 더한 다음 그 숫자를 적어 둡니다.
