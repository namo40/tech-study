---
title: "Event Stream"
summary: "이벤트가 계속 append되는 파티션 로그입니다. 각 파티션은 아무것도 빠져나가지 않는 순서 있는 시퀀스라서, 스트림은 비워지는 큐가 아니라 자라나는 이력이고, 키 안의 순서가 물리적으로 사는 자리가 바로 그 파티션입니다."
category: "메시징과 이벤트 처리"
scene: ordering
sceneStep: 2
related:
  - label: Ordering
    slug: ordering
  - label: Hot Partition
    slug: hot-partition
  - label: Offset
    slug: offset
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: What is Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

이벤트 스트림은 append만 되고 꺼내지지 않는 로그입니다. 장면의 2단계는 그 사실을 개념이 아니라 물리로 보이도록 그려져 있습니다. `acct 7` 이벤트가 P0에 도착하면 P0 행의 오른쪽 끝에 칸 하나가 생기고, 소비자가 처리한 뒤에도 그 칸은 그대로 남습니다. 소비한다고 해서 행이 달라지지는 않습니다. 달라지는 것은 소비자가 어디까지 지나왔는가입니다. 큐와 갈리는 지점이 여기입니다. 큐에서는 메시지가 브로커가 붙들고 있다가 누군가 가져가면 사라지는 작업 단위입니다. 스트림에서는 소비자 둘이 같은 자리를 읽어도 어느 쪽이 덜 받지 않습니다.

순서를 실제로 지고 있는 단위는 파티션입니다. 스트림은 시퀀스 하나가 아니라 여럿입니다. P0 행은 자기 안에서 순서가 있고 P1 행도 자기 안에서 순서가 있지만, 한쪽 칸과 다른 쪽 칸 사이에는 아무 진술도 없습니다. 2단계를 보면 두 행은 서로를 기다리지 않습니다. 생산자 하나를 거쳐 왔을 뿐 서로 다른 두 시퀀스입니다. "이 스트림은 순서가 보장되나요"라는 질문에 답이 없는 이유가 여기 있습니다. 파티션 안에서는 구조상 보장되고, 파티션들 사이에서는 보장되지 않으며 어떤 설정으로도 달라지지 않습니다.

이벤트를 어느 파티션에 넣을지 정하는 것은 키이고, 그래서 키는 메시지에서 결과가 가장 크게 갈리는 필드입니다. 파티션 키는 해시되므로 같은 키는 언제나 같은 파티션으로 가고, 그 키의 이벤트들은 브로커가 받아들인 순서대로 한 행에 쌓입니다. 키 없이 보낸 이벤트는 대신 흩어집니다. Event Hubs는 라운드 로빈으로 배정하고 Kafka 생산자는 배치 하나를 한 파티션에 붙여 보내는데, 이벤트가 어느 정도만 쌓이면 결과는 같습니다. 어느 쪽이든 1단계의 그림이 정확히 그것입니다. 빠르고, 부하가 고르고, 순서에 대해서는 아무 약속도 없습니다. 둘 중 무엇으로 갈지는 보내는 시점에 속성 하나로 결정되고, 생산자가 요청하지 않은 순서를 소비자가 되살릴 방법은 없습니다.

append만 되는 모양은 스트림을 다시 읽을 수 있게 만드는 이유이기도 합니다. 소비해도 아무것도 사라지지 않으니, 처음부터 다시 읽고 싶은 소비자는 위치를 되돌려 같은 칸들을 다시 읽고, 두 번째 컨슈머 그룹은 그와 동시에 같은 칸들을 읽으면서 서로를 눈치채지 못합니다. 한계는 전달이 아니라 보존 기간입니다. 로그는 창을 유지하고, 그 창에서 밀려난 것은 모든 독자에게 한꺼번에 사라집니다. 그래서 스트림은 큐가 주지 않는 두 가지, 다시 재생할 수 있는 이력과 서로 독립적인 여러 독자를 줍니다. 대신 이력을 어디까지 남길지 정하고, 순서는 고른 차선 안에서만 받아들이라고 요구합니다.
