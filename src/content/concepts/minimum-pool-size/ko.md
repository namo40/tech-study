---
title: "Minimum Pool Size"
summary: "최소 풀 크기는 풀이 항상 데워 두는 바닥입니다. 아무리 놀고 있어도 닫지 않는 연결의 수이고, 콜드 스타트와 급증의 첫 파도에서 handshake 비용을 없애 줍니다. 그 값은 데이터베이스가 대신 냅니다. 쓰지 않는 시간에도 그만큼의 연결이 계속 열려 있기 때문입니다."
category: "Pool과 자원 관리"
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: ADO.NET Connection Pooling
    slug: ado-net-connection-pooling
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

장면의 두 번째 단계는 일이 잘 풀리는 경우입니다. 요청이 열려 있는 연결을 빌려 쓰고 돌려주며, 데이터베이스는 로그인을 한 번도 보지 않습니다. 최소 풀 크기는 그 일이 가능하도록 미리 놓여 있는 연결이 몇 개인지를 정하는 값입니다. 풀의 바닥이고, 뜻은 좁고 문자 그대로입니다. 풀은 적어도 이만큼을 들고 있을 때까지 연결을 열고, 놀고 있다는 이유로는 그 연결들을 다시 닫지 않습니다. SQL Server 공급자의 기본값은 0입니다. 충분히 오래 조용했던 풀은 빈 풀이고, 다음 요청은 장면의 첫 단계가 보여 준 비용을 전부 치른다는 뜻입니다.

이 값을 올리는 이유는 그것으로 전부입니다. 바닥을 넘는 유휴 연결은 몇 분 쓰이지 않으면 회수되므로, 밤이 조용한 서비스는 매일 아침을 차가운 상태로 시작하고, 그날의 첫 요청들은 질의를 시작하기도 전에 TCP handshake와 TLS 협상과 로그인을 각각 치릅니다. 배포할 때마다 같은 일이 벌어집니다. 새로 뜬 프로세스는 빈 풀에서 시작하기 때문입니다. 트래픽 급증의 앞머리에서도 마찬가지입니다. 도착한 요청이 존재하는 연결보다 많고, 풀은 모자란 만큼을 하나씩 새로 만듭니다. 바닥을 두면 이 세 가지가 눈에 보이는 지연 봉우리에서 아무 일도 아닌 것으로 바뀝니다. 트래픽이 튀면서 꼬리 지연을 엄격하게 보는 서비스에서 이 설정이 자주 등장하고, 부하가 고른 서비스에서는 거의 등장하지 않는 이유입니다.

바닥은 공짜가 아니고, 청구서는 설정 이름이 말해 주지 않는 곳으로 갑니다. 바닥 아래에 붙들려 있는 연결 하나하나가 데이터베이스 쪽의 세션이고, 아무도 쓰지 않아도 존재하면서 메모리 할당과 서버 연결 한도의 자리를 차지합니다. 거기서 의미 있는 숫자는 바닥 값에 프로세스 수를 곱한 것입니다. 바닥 20은 설정 파일 하나에서는 소박해 보이지만, 인스턴스 20대에서는 새벽 세 시에도 전부 놀고 있는 세션 400개입니다. 최대치가 아니라 급증 사이에 실제로 유지되는 동시성에 맞춰 잡고, 풀이 자랄 여지가 남도록 최댓값보다 넉넉히 아래에 두세요. 그리고 아무 일도 일어나지 않는 시간에 데이터베이스에 비용을 물리는 풀 설정은 이것 하나뿐이라는 점을 기억하면 됩니다. 천장은 다른 결정이고 maximum pool size의 몫이며, 데워 둔 연결을 얼마나 오래 두어도 되는지는 connection lifetime의 몫이고, 이 바닥을 실제로 구현하는 층은 ADO.NET connection pooling입니다.
