---
title: "Checkpoint"
summary: "내구성 있는 곳에 적어 둔 offset이라서, 재기동이 어디에 내려서야 할지 압니다. 죽음의 대가를 잃어버린 작업이 아니라 잃어버린 시간으로 바꿔 주고, 얼마나 자주 적을지는 저장소 왕복과 다시 처리할 양 사이의 직접적인 맞바꿈입니다."
category: "메시징과 이벤트 처리"
scene: publish-subscribe
sceneStep: 3
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Event Stream
    slug: event-stream
  - label: At-Least-Once
    slug: at-least-once
  - label: Event Replay
    slug: event-replay
  - label: Ordering
    slug: ordering
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Balance partition load across multiple instances
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-processor-balance-partition-load
  - title: EventProcessorClient
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.eventprocessorclient
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

장면의 3단계가 이 개념 전체를 한 동작으로 보여 줍니다. B는 `checkpoint 5`를 적고 죽었다가 이벤트 둘을 놓칩니다. 그 이벤트들은 사라지지도 않았고 애초에 B 안에 있지도 않았습니다. 원래부터 있어야 할 자리, 곧 로그에 있습니다. B는 돌아와서도 무엇을 놓쳤는지 아무에게 묻지 않고 처음부터 다시 하지도 않습니다. 자기 checkpoint를 읽어 위치를 5로 맞추고 6, 7, 8을 비워 냅니다. 죽음이 앗아 간 것은 멈춰 있던 시간입니다.

그래서 checkpoint는 같은 숫자를 담고 있어도 offset과 다른 물건입니다. offset은 프로세스 안에 살고 프로세스와 함께 사라집니다. checkpoint는 프로세스가 소유하지 않은 저장소에 살고, 재기동이 믿어도 되는 유일한 값입니다. Event Hubs에서는 `UpdateCheckpointAsync`가 쓰는 blob이고, Kafka에서는 내부 토픽에 커밋된 offset이며, 직접 만든 소비자라면 우리 데이터베이스의 행 하나입니다. 셋 다 규칙은 같습니다. 재기동 뒤의 위치가 그 밖의 어딘가에서 왔다면 그것은 checkpoint가 아니라 짐작입니다.

거꾸로 하기 쉬운 부분이 순서입니다. 작업을 하고, 그 효과를 내구성 있게 남기고, 그다음에 checkpoint를 씁니다. checkpoint를 먼저 쓰면 그 사이에서 죽었을 때 작업이 통째로 사라집니다. 처리되지 않은 이벤트를 처리했다고 위치가 말해 버리기 때문입니다. checkpoint를 나중에 쓰면 같은 사고가 이미 처리한 이벤트를 다시 처리하게 만듭니다. 구멍이 아니라 중복입니다. 최소 한 번이라는 말의 실질이 이 비대칭이고, 들여다보든 아니든 우리는 이미 이 선택을 하고 있습니다. 그러니 핸들러를 두 번 돌려도 안전하게 만들어 둡니다. 이벤트 id로 작업을 묶거나, 다시 해도 같은 결과에 도착하는 방식으로 씁니다.

나머지 절반은 얼마나 자주 쓰느냐이고, 취향이 아니라 산술입니다. checkpoint 한 번이 저장소 왕복 한 번이므로 이벤트마다 쓰면 스트림이 쓰기 위주 작업으로 바뀌고 처리량이 저장소 층에서 막힙니다. 반대로 건너뛴 checkpoint 하나하나는 사고 뒤에 다시 전달될 이벤트입니다. 간격은 두 번째 숫자에서 고릅니다. 이벤트 100건마다, 또는 몇 초마다 쓴다는 말은 재기동이 그만큼까지 다시 처리할 수 있다는 뜻입니다. 정하기 전에 작업의 성격도 보는 편이 좋습니다. 값싼 프로젝션 100건과 바깥으로 나가는 메일 100통은 같은 내기가 아닙니다. 그리고 핸들러만이 아니라 checkpoint 자체도 지켜봐야 합니다. 로그는 계속 자라는데 위치가 멈춘 소비자는 조용히 실패하고 있고, 그 사실을 보여 주는 값은 지연뿐입니다.
