---
title: "Work Queue"
summary: "Work Queue는 요청을 받는 계층과 실제로 일을 하는 계층 사이의 완충 장치입니다. 두 계층이 각자의 속도로 움직이고, 피크는 실패가 아니라 밀린 작업으로 바뀝니다."
category: "애플리케이션 아키텍처"
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Background Job
    slug: background-job
  - label: Competing Consumers
    slug: competing-consumers
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: Queue-Based Load Leveling pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: System.Threading.Channels
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
---

큐는 두 계층을 시간 축에서 떼어 놓습니다. 웹 계층은 작업을 하나 써 넣고 거기서 손을 뗍니다. 워커는 여유가 생겼을 때 그 작업을 읽어 갑니다. 어느 쪽도 상대편의 가장 바쁜 1분에 맞춰 용량을 잡을 필요가 없고, 요청이 성공하느냐를 도착 속도가 결정하는 일도 없어집니다. 게다가 정말 중요한 지표 하나가 따라옵니다. 큐 길이, 그리고 가장 오래된 메시지의 나이입니다. 계속 올라가기만 하고 내려오지 않는 큐 길이는 순간적인 스파이크가 아니라 워커가 상시 부족하다는 뜻인데, CPU 그래프는 그 사실을 이만큼 분명하게 알려 주지 못합니다.

큐의 내구성은 큐를 들고 있는 쪽의 내구성만큼입니다. `System.Threading.Channels`는 프로세스 안의 큐를 제공하며, 개발 환경이나 잃어버려도 괜찮은 작업에는 잘 맞습니다. 재시작하면 안에 남아 있던 것이 모두 사라지기 때문입니다. 반드시 살아남아야 하는 작업은 Azure Service Bus나 RabbitMQ 같은 브로커에 둡니다. 그러면 한 가지 틈이 남습니다. 데이터베이스에 쓰는 것과 브로커에 쓰는 것은 서로 따로 실패할 수 있는 두 번의 작업입니다. 업무 데이터와 같은 트랜잭션에서 기록해 두고 나중에 브로커로 옮기는 outbox 테이블이 그 틈을 메웁니다.

큐 하나를 워커 여럿이 읽는 것이 competing consumers 패턴이고, 워커를 하나 더하는 일이 처리량 변경 그 이상도 이하도 아니게 만들어 주는 것이 바로 이 구조입니다. 대가는 순서입니다. 메시지는 순서대로 큐를 떠나지만 끝나는 순서는 워커가 끝내는 순서라서, 절대로 겹치면 안 되는 두 작업에는 공용 큐가 아니라 파티션 키가 필요합니다. Azure Service Bus의 session, RabbitMQ의 consistent hash exchange, 테넌트별 큐 같은 것들입니다. 그 밖의 경우에는 워커끼리 경쟁하게 두고, 형제 워커 중 누가 먼저 도착했는지에 좌우되지 않는 핸들러를 씁니다.
