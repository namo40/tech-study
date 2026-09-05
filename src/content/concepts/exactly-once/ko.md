---
title: "Exactly-Once"
summary: "정확히 한 번은 네트워크의 성질이 아니라 경계의 성질입니다. 한 트랜잭션 범위 안이라면 브로커가 읽기와 쓰기와 확인 응답을 한 덩어리로 묶을 수 있지만, 부수 효과가 그 범위를 벗어나는 순간 실제로 손에 남는 것은 최소 한 번 전달과 두 번 실행돼도 견디는 핸들러입니다."
category: "메시징과 이벤트 처리"
scene: poison-message
sceneStep: 2
related:
  - label: Poison Message
    slug: poison-message
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Retry Queue
    slug: retry-queue
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Service Bus duplicate detection
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Service Bus message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

장면의 2단계는 정확히 한 번이 없는 세계의 그림이고, 요점은 그 세계가 올바르게 동작하고 있다는 것입니다. 메시지가 소비자에게 내려가서 실패하고 곧장 큐의 선두로 돌아옵니다. 누구도 잘못하고 있지 않습니다. 소비자가 확인 응답을 하지 않았으니 브로커가 아는 한 그 배달은 도중에 사라졌을 수도 있고, 운명을 알 수 없는 메시지에 대해 안전한 행동은 다시 전달하는 것뿐입니다. 재전달은 고장이 아닙니다. 재전달은 보장이 일하는 모습입니다.

최소 한 번은 그것이 전부이고, 네트워크가 공짜로 주는 것도 거기까지입니다. 줄 수 없는 것은 나머지 절반입니다. 확인 응답도 메시지라서 돌아오는 길에 사라질 수 있고, 그래서 브로커는 "소비자가 받지 못했다"와 "소비자가 일을 다 했는데 응답이 사라졌다"를 끝내 구분하지 못합니다. 그 둘을 구분하는 프로토콜은 왕복이 한 번 더 필요하고, 그 왕복도 같은 문제를 그대로 안고 있습니다. 두 장군 문제가 모자만 바꿔 쓴 것이며, 공학으로 없앨 수 있는 종류가 아닙니다.

그러면 벤더들이 계속 파는 정확히 한 번은 어디서 오는가. 경계에서 옵니다. 들어온 메시지와 그것이 일으킨 상태 변경과 확인 응답이 한 트랜잭션으로 커밋되면, 셋 다 일어났거나 하나도 일어나지 않았거나 둘 중 하나입니다. 재전달이 와도 상태는 이미 커밋되어 있고 offset도 이미 옮겨져 있으니 중복이 생길 수가 없습니다. Kafka의 트랜잭션은 Kafka 안에서 끝나는 읽고 처리하고 쓰는 고리에 대해 이것을 해 주고, 브로커의 중복 감지 창은 메시지 id를 한동안 기억하는 약한 버전을 해 줍니다. 둘 다 진짜입니다. 그리고 둘 다 자기를 구현한 시스템의 가장자리에서 멈춥니다. 핸들러가 카드를 긁거나 메일을 보내거나 외부 API를 부르는 순간, 부수 효과는 트랜잭션 밖이고 보장도 사라집니다.

실무에서 읽는 방식은, 정확히 한 번 전달을 요구하기를 그만두고 정확히 한 번의 결과를 만드는 쪽으로 옮기는 것입니다. 메시지마다 변하지 않는 id를 주고, 그 id를 그것이 일으킨 작업과 같은 트랜잭션에 기록합니다. 두 번째 전달은 그 기록을 발견하고 아무 일도 하지 않고 돌아갑니다. 가능한 곳에서는 쓰기 자체를 반복해도 안전하게, 맹목적인 insert 대신 메시지 id를 키로 삼는 upsert로 만듭니다. 바깥 세상과 이야기하는 면은 좁게 유지하고 거기에 idempotency 키를 답니다. 그러면 재전달은 공짜가 되고 큐는 약속을 지킬 수 있습니다. 이 이야기가 가장 크게 걸리는 곳은 다른 이유로 계속 돌아오는 메시지입니다. 독 메시지도 재전달되고, 반복해도 결과가 같지 않은 핸들러는 깨진 페이로드 하나를 반쯤 끝난 부수 효과의 연속으로 바꿔 놓습니다.
