---
title: "Read-Your-Writes"
summary: "Read-your-writes는 한 세션이 다른 것은 놓치더라도 자기 변경만은 반드시 보게 되는 보장입니다. 사용자가 방금 저장한 뒤에도 replica를 읽어도 되게 만들어 주는 것이 이 보장입니다."
category: "데이터 분산과 일관성"
scene: replication-lag
sceneStep: 3
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Sticky Session
    slug: sticky-session
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

들어오는 제보는 언제나 같은 모양입니다. 사용자가 프로필을 고쳐 저장하고 화면으로 돌아왔는데 방금 바꾼 이름이 아니라 예전 이름이 보입니다. 실패한 것은 아무것도 없습니다. 쓰기는 primary로 갔고 새로고침은 아직 그 변경을 적용하지 못한 replica로 갔을 뿐입니다. Read-your-writes는 복사본이 최신인 척하지 않으면서 이 한 가지 경우만 없애는 보장입니다. 다른 사람의 변경은 여전히 빠져 있을 수 있지만, 이 세션 자신의 변경은 빠지지 않습니다.

지키는 방법은 둘이고, 무엇을 지불하느냐가 다릅니다. 첫째는 라우팅입니다. 이 세션이 무언가를 썼다는 사실을 기억해 두었다가 이후 몇 초 동안 그 세션의 읽기를 primary로 보냅니다. 쿠키나 분산 캐시 항목으로 간단히 구현되고, 덜어 주려던 읽기 트래픽 일부를 primary가 도로 받는 비용이 들며, 그 구간이 지연보다 짧으면 보장이 소리 없이 깨집니다. 둘째는 대기입니다. 쓰기가 받은 위치를 들고 있다가 replica가 그 위치에 도달한 뒤에야 읽기를 보냅니다. primary에는 아무것도 얹히지 않고 비용은 읽기의 지연으로 옮겨 가므로, 이 방식에는 제한 시간과 primary로 넘어갈 길이 필요합니다.

어느 쪽이 맞는지는 엔드포인트에 달려 있습니다. 저장 직후 사용자가 도착하는 화면이라면 라우팅이 기본값으로 알맞습니다. 구간이 정해져 있고, 눈에 보이며, 따져 보기 쉽기 때문입니다. 수백 밀리초는 기다릴 수 있지만 primary는 건드리고 싶지 않은 배치 작업이나 API 클라이언트라면 대기가 어울립니다. 데이터베이스가 직접 제공하기도 합니다. Azure Cosmos DB의 세션 일관성 수준이 바로 두 번째 방식이며, 클라이언트마다 세션 토큰을 들고 다닙니다. 다른 관리형 서비스도 replica의 위치를 노출해 비교할 수 있게 해 줍니다.

실제로 보장이 유지되는지는 두 가지가 가릅니다. 하나는 쓰기와 읽기 사이에 세션을 알아볼 수 있어야 한다는 점입니다. 서버 한 대의 변수가 아니라 쿠키, 클레임, 헤더여야 합니다. 그렇지 않으면 두 번째 요청이 첫 번째 요청을 들어 본 적 없는 곳에 도착합니다. 다른 하나는 구간을 재야 한다는 점입니다. 지연이 정해 둔 몇 초를 넘겨 늘어나면, 애초에 replica를 두고 싶게 만들었던 그 부하가 걸린 순간에 보장이 사라집니다.
