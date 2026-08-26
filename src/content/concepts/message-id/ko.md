---
title: "Message ID"
summary: "Message ID는 보내는 쪽이 메시지에 한 번 붙이고 다시는 바꾸지 않는 신원입니다. 같은 메시지가 두 번 가더라도 이름은 하나이므로, 소비자는 두 번째 도착을 구별할 수 없는 새 사건이 아니라 알아보고 버릴 수 있는 것으로 다룰 수 있습니다."
category: "분산 트랜잭션과 메시지 일관성"
scene: transactional-outbox
sceneStep: 3
related:
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Correlation ID
    slug: correlation-id
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Duplicate detection (Azure Service Bus)
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: ServiceBusMessage.MessageId
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.servicebus.servicebusmessage.messageid
---

장면의 3단계가 보여 주는 모든 것은 놓치기 쉬운 사실 하나 위에 서 있습니다. 릴레이가 돌아와 메시지를 다시 보낼 때, 그 메시지는 처음과 같은 id를 달고 나갑니다. 중복과 두 번째 사건을 가르는 것은 그것뿐입니다. 변하지 않는 id가 없으면 소비자에게는 같은 일을 설명하는 메시지 두 개만 보이고, 주문 하나가 두 번 알려진 것인지 똑같은 주문이 1초 사이에 두 번 들어온 것인지 알 방법이 없어서 추측할 수밖에 없습니다. id가 있으면 두 번째 도착은 확인할 수 있는 사실이 됩니다. 42는 이미 봤다고 말할 수 있습니다.

id가 어디에서 오는지가 그것이 버텨 줄지를 정합니다. id는 발행할 때가 아니라 메시지를 만들 때 부여해야 하고, 변경과 같은 트랜잭션 안에서 outbox 행에 함께 써야 합니다. 릴레이가 발행 시점에 만들어 내는 id는 재시도할 때마다 새 id가 되는데, 그것이 바로 id가 존재하는 이유였던 상황입니다. 본문에서 계산해 낸 id는 반대 방향으로 무너집니다. 내용이 같은 서로 다른 두 사건이 하나로 합쳐집니다. 통하는 방법은 쓰는 쪽이 한 번 고르고 저장해 두는 값입니다. 보통 GUID이거나 outbox의 순번이고, 소비자까지 가는 모든 구간에서 그대로 실려 갑니다.

비용이 드는 쪽은 소비자입니다. 다시 온 것을 알아보려면 이미 처리한 것을 기억해야 하고, 그러려면 본 id를 담는 테이블과 그 id에 대한 인덱스, 그리고 한 행을 얼마나 오래 남길지에 대한 정책이 필요합니다. 이 기간은 실제로 결정해야 하는 값입니다. 너무 짧으면 재시도 큐에 한 시간 갇혀 있던 메시지가 새것처럼 돌아오고, 너무 길면 테이블이 끝없이 자랍니다. 브로커와 릴레이가 함께 만들어 낼 수 있는 가장 긴 재전달을 기준으로 잡습니다. 그리고 본 id를 기록하는 행은 그 메시지가 일으킨 작업과 같은 트랜잭션에서 씁니다. 그 사이에 죽으면 메시지를 두 번 처리하는 자리로 돌아옵니다.

브로커가 이 일의 일부를 대신해 주기도 합니다. Azure Service Bus는 `MessageId`를 받고, 엔터티에 중복 감지를 켜 두면 설정한 기간 안에 이미 본 id를 가진 두 번째 메시지를 버립니다. 불안정한 발행자가 만들어 내는 반복은 아무에게도 닿기 전에 사라집니다. 다만 소비자가 메시지를 처리한 뒤 확인 응답을 보내기 전에 죽어서 생기는 반복은 그대로 남으므로, id는 여러분의 코드에도 보여야 합니다. correlation id와도 구분해 둡니다. message id는 이 메시지의 이름이고, correlation id는 이 메시지가 속한 대화의 이름입니다. 한쪽을 다른 쪽으로 쓰면 한 흐름의 모든 메시지가 첫 메시지의 중복처럼 보이게 됩니다.
