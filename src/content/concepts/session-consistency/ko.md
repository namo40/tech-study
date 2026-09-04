---
title: "Session Consistency"
summary: "Session consistency는 하나의 세션이 데이터를 앞뒤가 맞는 하나의 시야로 본다는 보장입니다. 자기 쓰기는 반드시 보이고, 이미 본 값보다 더 옛 값으로 되돌아가지 않습니다. 대부분의 애플리케이션이 실제로 원하는 수준이자, 사용자가 신고하는 그 버그를 가장 싸게 없애는 방법입니다."
category: "데이터 분산과 일관성"
scene: eventual-consistency
sceneStep: 3
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Manage consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-manage-consistency
---

최종 일관성은 시스템 전체에 대해 하나를 약속하고 개별 독자에게는 아무것도 약속하지 않습니다. 그래서 처음 눈에 띄는 실패가 유난히 개인적입니다. 사용자가 무언가를 저장하고, 화면이 아직 그 변경을 적용하지 않은 replica에서 다시 그려지고, 자기가 방금 한 편집이 사라져 있습니다. 세션 일관성은 그 약속의 범위를 클라이언트 하나로 좁힙니다. 그 세션 안에서는 세션이 한 모든 쓰기가 읽기에 보이고, 이미 지나쳐 본 값보다 뒤로 돌아가지 않습니다. 세션 밖의 다른 사람 변경은 여전히 빠져 있을 수 있는데, 바로 그 덕분에 비용이 낮게 유지됩니다.

방법은 둘이고, 무엇을 지불하는지가 다릅니다. 첫째는 고정입니다. 이 세션이 어느 복사본에 썼는지 기억해 두고, 그 사실이 유효한 동안 세션의 읽기를 그쪽으로 보냅니다. 쿠키나 분산 캐시 항목 하나로 쉽게 만들 수 있고, 부담을 덜어 주려던 그 복사본이 읽기 트래픽의 일부를 도로 받게 되며, 그 복사본이 회전에서 빠지고 세션이 조용히 더 뒤처진 곳으로 옮겨지면 아무 소리 없이 깨집니다. 둘째는 토큰입니다. 쓰기가 자기가 받은 위치를 표식으로 돌려주고, 클라이언트가 이후 요청에 그 표식을 실어 보내며, 읽기는 그 위치까지 따라온 복사본만 답합니다. primary에 추가로 얹히는 것은 없고 비용은 읽기의 지연으로 옮겨 가며, 표식은 쓰기와 읽기 사이의 모든 구간을 살아서 통과해야 합니다.

실무에서 이 보장이 유지되는지는 마지막 조건에서 갈립니다. 정적 필드나 프로세스 하나의 캐시, 서버 한 대의 변수에 담긴 세션 토큰은 세션 토큰이 아닙니다. 다음 요청은 다른 인스턴스로 가고, 토큰 없이 도착하며, 요청이 여러 곳으로 흩어질 만큼 트래픽이 많아진 바로 그때 보장이 사라집니다. 토큰은 쿠키나 클레임, 헤더에 두어야 하고, 사용자를 대신해 도는 백그라운드 작업까지 이어져야 합니다. 그러지 않으면 그 작업은 사용자가 이미 지나온 상태를 읽습니다.

Azure Cosmos DB는 이것을 기본 일관성 수준으로 그대로 구현해 두었으니 참고 설계로 읽어 볼 만합니다. 모든 응답이 세션 토큰을 실어 보내고, SDK는 클라이언트 인스턴스 하나 안에서 그 토큰을 재사용하며, 인스턴스를 넘어 같은 보장이 필요한 클라이언트는 토큰을 직접 전달해야 합니다. 관계형 구성에서는 쓰기가 받은 위치를 들고 있다가 replica의 위치와 비교해 읽기를 라우팅하고, replica가 아직 뒤처져 있으면 primary로 넘기는 식으로 같은 효과를 냅니다. 어느 쪽이든 형태는 같고, 실패하는 방식도 같습니다. 토큰을 함께 나르는 것을 잊으면 알아채지 못한 채 최종 일관성으로 돌아갑니다.
