---
title: "Primary-Replica"
summary: "한 기계가 쓰기를 받고 나머지는 그것이 한 일을 베낍니다. 이 구분은 배선이 아니라 하나의 단어이고, 그래서 첫 기계가 멈추면 그 단어를 다른 기계로 옮길 수 있습니다."
category: "데이터 분산과 일관성"
scene: failover
sceneStep: 1
related:
  - label: Failover
    slug: failover
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Availability modes (Always On availability groups)"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/availability-modes-always-on-availability-groups
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/auto-failover-group-sql-db
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

장면의 1단계를 보면 두 상자를 갈라놓는 것이 얼마나 적은지 알 수 있습니다. 크기가 같고, 같은 데이터를 담고 있고, 같은 소프트웨어를 돌리고, 그림도 똑같습니다. 하나는 `primary`라고 말하고 다른 하나는 `replica`라고 말하며, 둘 사이의 화살표가 앞의 것에서 뒤의 것을 가리킵니다. 그 단어와 그 화살표가 이 구조의 전부입니다. 4단계가 그 증거입니다. 단어가 옮겨 가고 화살표가 방향을 바꿔도, 두 기계 중 어느 쪽에서도 지금 무엇이 되라고 요구받는지 말고는 달라진 것이 없습니다.

쓰기는 정확히 한 곳으로만 갑니다. 이것은 패턴이 어쩔 수 없이 감수하는 제약이 아니라, 패턴을 앞뒤가 맞게 만드는 바로 그 조건입니다. 쓰는 쪽이 하나라는 말은 변경이 일어난 순서가 하나라는 뜻이고, replica는 그 순서가 무엇이었는지를 누구와도 협상할 필요가 없습니다. 그냥 다시 재생하면 됩니다. 두 기계가 모두 쓰기를 받는 순간 사본이 아니라 두 개의 역사가 생기고, 사후에 두 역사를 맞추는 일은 이름이 다른, 그리고 훨씬 어려운 문제가 됩니다.

자유로운 쪽은 읽기입니다. 같은 행을 들고 있는 replica는 primary가 전혀 관여하지 않고도 읽기에 답할 수 있습니다. 이 구조가 장애를 걱정하기 한참 전부터 등장하는 이유가 그것입니다. 읽기 용량이 모자란 데이터베이스에 용량을 붙이는 가장 값싼 방법이기 때문입니다. 걸리는 것은 화살표를 건너는 시간입니다. replica는 사본이 건너오는 시간만큼 뒤처져 있으므로, 거기서 답한 읽기는 아주 가까운 과거를 읽은 것입니다. 1단계가 보여 주는 것이 정확히 그것입니다. 쓰기가 반영되면 `behind` 칩이 1이 되고, 사본이 도착하면 다시 0으로 돌아갑니다.

역할을 나눠 두는 것은 애초에 승격을 가능하게 만드는 조건이기도 하고, 가져갈 만한 대목이 여기입니다. replica는 그동안 계속 primary의 변경을 적용해 왔으므로 이미 후보입니다. 승격은 복원도 재구축도 아닙니다. 이름표를 바꿔 다는 일이고, 단어 하나를 쓰는 만큼의 시간이 듭니다. 백업만 저장소로 보내 두던 기계였다면 몇 시간과 신중한 운영자가 필요합니다. replica에는 결정 하나가 필요합니다.

붙잡아 둘 비대칭은 이것입니다. replica에서의 읽기는 값싸고 안전하지만, 쓰기로 이어지는 읽기는 둘 다 아닙니다. replica를 상대로 한 읽기 후 수정 후 쓰기는 primary에서 이미 밀려난 값을 읽고, 아직 아무도 보지 못한 변경 위에 덮어씁니다. 어디에서도 오류는 나지 않습니다. 그런 읽기는 primary로 보내세요. 이 규칙의 요점은 데이터가 조금 낡았다는 것이 아니라, 낡은 데이터로 내린 결정이 새로운 사실이 되어 버린다는 데 있습니다.

마지막으로 현실적인 이야기가 하나 있습니다. 한 번도 읽어 보지 않은 replica는 한 번도 시험해 보지 않은 replica입니다. 필요해지는 날까지는 건강해 보이고, 그날에야 디스크가 차고 있었다는 것, 스키마 변경이 닿지 않았다는 것, 얼마나 뒤처졌는지 아무도 보고 있지 않았다는 것을 알게 됩니다. 용량이 필요하지 않더라도 실제 읽기 트래픽을 얼마간 보내 두는 편이 좋습니다. 부하를 받는 replica는 가장 나쁜 순간에 한 번이 아니라, 자신에 대한 사실을 계속해서 말해 주기 때문입니다.
