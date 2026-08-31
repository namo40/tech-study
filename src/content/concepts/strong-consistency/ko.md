---
title: "Strong Consistency"
summary: "Strong consistency는 사본이 여럿이 아니라 하나뿐인 것처럼, 모든 읽기가 가장 최근에 끝난 쓰기를 본다는 약속입니다. 이 약속은 두 번 지불됩니다. 단절이 났을 때 소수 쪽의 거부로 한 번, 평소의 모든 읽기에 붙는 왕복으로 또 한 번입니다."
category: "데이터 분산과 일관성"
scene: cap-theorem
sceneStep: 2
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Linearizability
    slug: linearizability
  - label: PACELC
    slug: pacelc
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
---

Strong consistency는 CAP의 C이고, 그것의 정확한 이름은 선형화 가능성입니다. 모든 연산이 발행된 시점과 돌아온 시점 사이의 한 순간에 효력을 갖는 것처럼 보이므로, 쓰기가 끝난 뒤에 시작한 읽기는 그 쓰기를 반드시 봅니다. 이 성질의 값어치는 전부, 분산 저장소를 변수 하나 다루듯 생각하게 해 준다는 데 있습니다. 현재 값은 하나입니다. 방금 넣었다면 그대로 다시 읽고, 조금 전에 다른 사람이 넣었다면 그 사람의 값을 읽지 그 앞의 값을 읽지 않습니다. 복제본이 몇 개인지는 그것을 쓰는 코드로 새어 나오지 않습니다.

장면의 2단계는 네트워크가 깨졌을 때 그 약속이 얼마인지를 보여 줍니다. link가 끊기고, R1은 계속 쓰기를 받고, R2에 도착한 읽기는 숫자 대신 wait를 받습니다. R2는 고장 나지 않았고 사본이 손상되지도 않았습니다. 다만 자기가 쥔 것이 아직 최신인지 확인할 길이 없을 뿐이고, 이 규칙 아래에서는 보증할 수 없는 답이 무응답보다 나쁩니다. 일어나지 않는 일도 함께 보아야 합니다. 시스템은 멈추지 않습니다. 정족수를 쥔 쪽은 그동안 내내 평소대로 답합니다. "일관성을 골랐다"의 실제 모습이 그것입니다. 단절의 반대편에 선 일부 호출자가, 재시도하리라 기대되는 오류를 받는 것입니다.

훨씬 자주 치르는 값은 다른 쪽이고, 4단계가 그것을 보여 줍니다. 어디에도 단절이 없어도 강한 일관 읽기는 말하기 전에 다른 복제본들과 상의해야 하고, 그 합의는 왕복입니다. 장면에서 계량기는 상의한 읽기에 ms 150, 가장 가까운 사본에서 답한 읽기에 ms 90을 읽습니다. 실제 시스템에서는 같은 모양이 정족수를 상대로 한 과반 읽기, 가장 가까운 팔로워 대신 리더로 보내는 읽기, Session 대신 Strong으로 고정한 Cosmos DB 요청으로 나타납니다. 이 비용을 없애는 설정은 없습니다. 비용이 곧 합의이고, 합의가 곧 그 성질이기 때문입니다.

그래서 쓸모 있는 질문은 "이 시스템이 강한 일관성이어야 하는가"가 아니라 언제나 "어떤 읽기가 그래야 하는가"입니다. 출금 전의 잔고 확인, 예약 전의 재고 확인, 삽입 전의 중복 확인은 되돌릴 수 없는 결정으로 이어지므로 값을 치를 만합니다. 프로필 페이지, 피드, 대시보드, 무언가의 개수는 읽히고 잊히는 것들이라 여기에 선형화 가능성을 사면 사용자가 느낄 수 있는 것은 아무것도 얻지 못합니다. 느리면서 동시에 약하게 느껴지는 시스템은 대개 이 선을 아무도 긋지 않아서, 기본값대로 전부 비싼 쪽에 놓인 시스템입니다.
