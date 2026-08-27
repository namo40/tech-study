---
title: "At-Least-Once"
summary: "최소 한 번은 유실 대신 중복을 고른 전달 계약입니다. 누군가 ack할 때까지 브로커가 메시지를 계속 내주므로, 죽었을 때 치르는 값이 구멍이 아니라 반복이 됩니다. 재전달은 보장이 깨진 흔적이 아니라 보장이 일하는 모습입니다."
category: "메시징과 이벤트 처리"
scene: dead-letter-queue
sceneStep: 1
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Group
    slug: consumer-group
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: MassTransit exceptions, retries and redelivery
    url: https://masstransit.io/documentation/concepts/exceptions
---

장면의 첫 번째 단계는 같은 메시지가 소비자에게 세 번 가는 모습을 보여 줍니다. 시스템이 오작동하는 것처럼 읽히기 쉽지만 사실은 정반대입니다. 브로커는 약속을 지키는 중입니다. 최소 한 번은 누군가 끝냈다고 확인해 줄 때까지 메시지를 전달하겠다는 뜻이고, 죽을 수도 있는 소비자를 상대로 그 약속을 지키는 유일한 방법은 확인이 오지 않을 때 메시지를 다시 내주는 것입니다. 올라가는 전달 횟수는 보장이 사람들 앞에서 일하는 모습입니다.

거의 모든 브로커가 이 계약을 내놓는 이유는 다른 쪽이 더 나쁘기 때문입니다. 작업 전에 ack하면 전달은 최대 한 번이 됩니다. 중간에 죽으면 아무도 다시 보지 못할 메시지가 남고, 애초에 적히지 않은 것은 아무리 관측해도 되찾을 수 없습니다. 작업 뒤에 ack하면 중간에 죽었을 때 그 메시지는 돌아옵니다. 앞의 실패는 미리 대비할 수 있는 중복이고, 뒤의 실패는 있었는지조차 알 수 없는 구멍입니다. 한편 정확히 한 번은 브로커 혼자 건네줄 수 있는 물건이 아닙니다. ack와 부수 효과가 서로 다른 시스템에 살기 때문에, 한쪽은 일어났고 다른 쪽은 아직인 순간이 반드시 존재합니다.

그러니 선택은 결국 ack를 어디에 두느냐의 문제이고, ack는 작업과 그로부터 따라오는 저장이 모두 끝난 뒤에 갑니다. 실제로 메시지는 전달된다기보다 대여됩니다. 브로커는 잠금과 만료 시간을 붙여 메시지를 내주고, 소비자가 잠금이 만료되기 전에 완료도 갱신도 하지 않으면 메시지는 다시 사용 가능해집니다. 그래서 그냥 느리기만 한 소비자도 죽은 소비자만큼이나 확실하게 재전달을 만들어 냅니다. 잠금보다 오래 도는 핸들러가 뜻밖의 중복이 나오는 가장 흔한 자리인 이유가 그것입니다.

이 모든 것의 청구서는 중복이고, 값은 소비자가 치릅니다. 치르는 방법은 두 가지입니다. 싼 쪽은 두 번째에도 효과가 같은 핸들러를 쓰는 것입니다. 숫자를 올리는 대신 상태를 정하고, insert 대신 upsert하고, 무엇을 쓰든 메시지 자신의 id를 키로 삼습니다. 다른 쪽은 이미 처리한 것을 기억하는 것입니다. 생산자가 붙이고 재전달 사이에도 바뀌지 않는 메시지 id를 키로 두고, 알아본 것은 건너뜁니다. 대부분의 시스템은 결국 둘 다 갖게 됩니다. 기억에는 지평이 있고, 그 너머에서 도착한 중복을 막는 것은 핸들러이기 때문입니다.

계약에 딸려 오는 것이 중복만은 아닙니다. 재전달은 순서를 흔듭니다. 실패했다 돌아온 메시지는 이제 자기보다 늦게 도착한 메시지들 뒤에 서므로, 순서를 전제하던 것은 도착 순서 대신 본문 안의 무언가를 키로 삼아야 합니다. 그리고 재전달은 무언가가 한도를 걸지 않는 한 끝이 없습니다. 전달 한도와 dead-letter queue가 들어오는 자리가 여기입니다. 그것들이 없으면 늘 실패하는 메시지는 영원히 재전달되고, 최소 한 번은 약속에서 쳇바퀴로 바뀝니다.

.NET에서는 Azure Service Bus의 수신 모드가 바로 이 이야기입니다. `ReceiveMode.PeekLock`이 최소 한 번 경로입니다. 작업 뒤에 `CompleteMessageAsync`, 바로 돌려줄 때는 `AbandonMessageAsync`, 핸들러가 정당하게 더 필요할 때는 `RenewMessageLockAsync`, 그리고 프로세스가 사라지면 그냥 만료되는 잠금이 한 벌입니다. `ReceiveMode.ReceiveAndDelete`는 최대 한 번 경로이고, 메시지를 잃는 값이 두 번 처리하는 값보다 싼 자리에서만 옳은 선택입니다. 텔레메트리 스트림이 그런 경우입니다. RabbitMQ는 같은 선을 `autoAck`으로 긋습니다. 꺼 두고, 작업 뒤에 ack하고, 일부러 돌려주고 싶을 때는 requeue를 붙인 `basic.nack`을 씁니다.
