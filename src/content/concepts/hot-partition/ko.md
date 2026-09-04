---
title: "Hot Partition"
summary: "샤드 하나가 트래픽 대부분을 받는 동안 이웃들은 놀고 있는 상태입니다. 상한을 정하는 것은 클러스터 크기가 아니라 키 분포이고, 그 키가 순서까지 보장하고 있다면 뒤처진 차선에는 소비자를 아무리 붙여도 소용이 없습니다."
category: "메시징과 이벤트 처리"
scene: ordering
sceneStep: 3
related:
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Competing Consumers
    slug: competing-consumers
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Backpressure
    slug: backpressure
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Load Balancer
    slug: load-balancer
references:
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

핫 파티션은 치우친 키 분포를 안에서 본 모습이고, 장면의 3단계가 그 전부입니다. `acct 7` 이벤트 여섯 개가 1초 안에 도착하고, P0의 backlog가 게이지의 마지막 단계를 넘어가고, 그동안 P1은 빈 행으로 앉아 있습니다. 고장 난 것은 없습니다. 라우팅 규칙은 시킨 대로 하고 있고, 소비자들은 2단계와 같은 속도로 돌고 있고, 시스템은 여전히 절반만 바쁩니다. 병목은 용량이 아니라 트래픽의 모양입니다.

보통의 과부하와 다른 점은, 늘 쓰던 처방이 통하지 않는다는 것입니다. 큐를 비우는 방법은 소비자를 늘리는 것이지만, 파티션은 한 번에 한 소비자가 소유합니다. 그 소유 자체가 순서 보장입니다. 그래서 P0에 소비자를 하나 더 붙이면 아무 일도 일어나지 않거나, 파티션을 나눈 이유였던 그 성질이 깨집니다. 키가 그대로인 한 파티션을 늘려도 마찬가지입니다. 키 하나의 해시는 차선이 몇 개든 차선 하나로 떨어지기 때문입니다. 장면은 두 사실을 한 화면에 보여 줍니다. P1은 놀고 있고, 그런데 쓸 수가 없습니다. 약속이 `acct 7`을 P0에 못 박아 두었기 때문입니다.

원인은 거의 언제나 꼬리가 긴 키입니다. 테넌트 하나가 나머지의 열 배인 테넌트 ID, 한 지역이 본진인 리전, 대부분이 한 모델인 기기 종류, 그리고 전형적인 경우로 태생적으로 치우친 엔터티가 있습니다. 유명인 계정, 간판 상품, 모든 출고가 나가는 창고 하나입니다. 균일한 해시는 균일하지 않은 키를 고쳐 주지 않습니다. 해시는 키들을 파티션에 고르게 뿌릴 뿐, 키 하나가 이벤트 대부분을 지고 있다는 사실에는 전혀 손대지 않습니다.

그래서 해법은 인프라보다 위, 키가 무엇인가에 있습니다. 순서 요구가 계좌 단위라면 키는 계좌이고, 바쁜 계좌는 미리 계획해 두어야 할 바쁜 차선입니다. 요구가 생각보다 약하다면, 그러니까 스트림의 이벤트 대부분이 사실은 서로의 순서를 필요로 하지 않는다면, 트래픽이 퍼질 때까지 키를 좁히면 됩니다. 장면의 4단계가 그것입니다. 정말로 계좌 단위이고 정말로 한 계좌가 너무 크다면, 남은 수는 둘입니다. 뜨거운 키를 하위 차선으로 쪼개는 복합 키를 쓰고 뒤에서 다시 직렬화하거나, 그 키의 상한을 낮게 받아들이고 격리해서 그 backlog가 다른 모두의 지연이 되지 않게 하는 것입니다. 어느 쪽도 슬라이더는 아닙니다. 치우침은 일급 지표로 지켜보세요. 합계가 아니라 파티션별 지연과 파티션별 처리량입니다. 평균은 이 페이지가 말하는 실패를 정확히 가려 버립니다.
