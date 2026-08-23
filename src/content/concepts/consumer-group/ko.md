---
title: "Consumer Group"
summary: "consumer group은 Kafka가 구현한 경쟁 소비자이고, 경쟁의 단위가 메시지가 아니라 파티션입니다. 파티션 하나는 그룹 안에서 정확히 한 구성원에게만 배정되므로 키 안에서의 순서는 지켜지고, 병렬성은 파티션 수에서 멈춥니다."
category: "메시징과 이벤트 처리"
scene: competing-consumers
sceneStep: 4
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Partition
    slug: partition
  - label: Message Key
    slug: message-key
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
references:
  - title: Kafka consumer group protocol
    url: https://kafka.apache.org/documentation/#intro_consumers
  - title: Confluent consumer group basics
    url: https://developer.confluent.io/courses/apache-kafka/consumer-group-protocol/
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

Kafka의 토픽은 고정된 파티션 집합이고, consumer group은 같은 `group.id`를 공유하면서 그 파티션들을 나눠 읽는 프로세스 묶음입니다. 브로커는 파티션 하나를 그룹 안의 정확히 한 구성원에게 배정하므로, 큐의 메시지가 한 번만 처리되는 것과 같은 방식으로 메시지는 그룹당 한 번만 처리됩니다. 다만 나눠 주는 대상이 메시지가 아니라 파티션입니다. 여기서 두 가지가 바로 따라 나옵니다. 같은 키를 가진 메시지는 같은 파티션에 있으므로 같은 구성원에게 순서대로 가고, 이것이 경쟁 소비자가 원래 포기하는 키 단위 순서입니다. 그리고 그룹의 쓸모 있는 구성원 수는 토픽의 파티션 수를 넘을 수 없습니다. 파티션 열 개를 읽는 그룹의 열한 번째 구성원은 아무것도 받지 못하고 기다립니다.

배정은 영구적이지 않습니다. 구성원이 들어오거나 나가거나 heartbeat를 멈추면 그룹은 재배치를 하고 파티션을 다시 나눠 주며, 파티션을 물려받은 쪽은 그 그룹의 마지막 커밋 오프셋부터 이어서 읽습니다. 이 설계에서는 그 오프셋이 곧 확인 응답입니다. 그래서 작업 전에 커밋하면 메시지를 잃고, 작업 뒤에 커밋하면 다시 읽습니다. 경로만 다를 뿐 결론은 최소 한 번입니다. 재배치는 멈춤이기도 해서, 그것이 얼마나 거슬리는지를 정하는 설정들은 알아 둘 만합니다. `max.poll.interval.ms`는 한 구성원이 배치 하나에 머물 수 있는 시간이고, 이 시간을 넘기면 그룹은 그 구성원이 사라졌다고 봅니다. 정적 멤버십은 재시작한 파드의 배정을 그대로 돌려주어 전부 뒤섞이는 일을 막고, 협력형 할당자는 옮겨야 하는 파티션만 옮깁니다.

그룹이 무엇을 벌어다 주는지는 거의 전부 키가 정합니다. 키가 파티션을 고르고 파티션이 구성원을 고르므로, 결국 키가 순서 보장과 부하 분배를 함께 정합니다. 고객 id로 나눈 토픽에서 바쁜 고객 하나는 뜨거운 파티션 하나이자 포화된 소비자 하나이고, 나머지는 놀게 됩니다. 파티션은 늘릴 수는 있어도 줄일 수는 없고, 늘리면 기존 키의 배치가 다시 계산됩니다. 그래서 파티션 수는 사실상 되돌리기 어려운 결정이고, 보통 지금 트래픽에 필요한 것보다 넉넉하게 잡습니다. 그룹끼리는 서로 독립적이기도 합니다. 같은 토픽에 붙은 두 번째 그룹은 자기 오프셋으로 모든 메시지를 다시 읽고, 이 덕분에 이벤트 스트림 하나가 서로 경쟁하지 않는 여러 서비스를 먹여 살립니다.
