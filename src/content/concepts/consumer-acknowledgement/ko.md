---
title: "Consumer Acknowledgement"
summary: "소비자의 확인 응답(ack)은 작업이 끝났다고 브로커에게 알리는 신호이고, 메시지를 큐에서 지우는 것도 이 신호입니다. 그것이 도착하기 전까지 메시지의 주인은 여전히 브로커이고, 브로커는 그 메시지를 다른 소비자에게 넘길 수 있습니다."
category: "메시징과 이벤트 처리"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Work Queue
    slug: work-queue
  - label: Retry
    slug: retry
  - label: Web Queue Worker
    slug: web-queue-worker
references:
  - title: RabbitMQ consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: Message transfers and locks in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

메시지를 전달하는 일과 메시지를 끝내는 일은 서로 다른 사건이고, 확인 응답은 그중 두 번째입니다. 소비자가 메시지를 가져가도 브로커는 그것을 지우지 않습니다. 그 소비자에게 전달했다고 표시해 둔 채, 확인 응답이 오거나 전달이 끊길 때까지 그대로 들고 있습니다. 처리 도중에 소비자가 죽어도 잃는 것이 시간뿐인 이유가 이것입니다. 연결이 끊기면 브로커는 끝나지 않은 전달을 알아보고, 메시지를 큐 맨 앞으로 돌려 비어 있는 소비자에게 넘깁니다. 정확히 한 번 전달을 팔지 않는 이유도 같은 구조에 있습니다. 소비자가 작업을 끝내고 확인 응답이 프로세스를 떠나기 직전에 죽을 수 있는데, 브로커에게는 그 상황과 아무것도 하지 않고 죽은 상황이 똑같아 보이므로 다시 전달합니다.

여기서 나오는 규칙은 하나입니다. 확인 응답은 작업과 그 부수 효과가 저장된 뒤에 보내고, 그 전에는 보내지 않습니다. 받자마자 자동으로 확인 응답을 보내는 설정은 모든 장애와 모든 배포와 모든 OOM 종료를 조용히 메시지 유실로 바꿔 놓는데, 생각보다 많은 클라이언트에서 이것이 기본값입니다. 핸들러가 알아챈 실패에는 부정 확인 응답을 보내고, 이때 큐로 되돌릴지 dead-letter queue로 보낼지를 고릅니다. 다음 시도에서는 될 만한 것이면 되돌리고, 그럴 리 없는 것이면 dead-letter queue로 보냅니다. 브로커가 전달 횟수를 세어 주므로 이 판단을 맡길 수 있고, 핸들러에서도 그 횟수를 읽어 볼 만합니다. 두 번째 시도는 로그를 더 남기고 작업은 덜 벌일 좋은 시점이기 때문입니다.

prefetch는 소비자 하나가 확인 응답하지 않은 채로 동시에 들고 있을 수 있는 메시지 수를 정하고, 경쟁 소비자를 소비자 하나로 되돌려 놓는 설정이기도 합니다. prefetch가 1이면 비어 있는 소비자가 언제나 다음 메시지를 받고 버퍼는 큐 하나뿐이지만, 메시지마다 왕복이 한 번씩 듭니다. prefetch가 100이면 소비자 하나가 옆의 소비자들이 노는 동안 메시지 100개를 자기 메모리로 끌어갈 수 있고, 그 소비자가 죽으면 100개가 전부 재전달됩니다. 메시지가 작고 균일하며 왕복이 병목이라면 값을 올리고, 메시지마다 비용이 들쭉날쭉하다면 낮게 둡니다. 메시지를 공평하게 나눈 것이 일을 공평하게 나눈 것은 아니기 때문입니다.
