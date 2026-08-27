---
title: "Failover"
summary: "Failover는 기계가 아니라 역할을 옮깁니다. primary가 응답을 멈추면 박동이 끊기고, 과반이 그것이 죽었다는 데 동의하고, replica가 승격됩니다. 복제되지 못한 마지막 순간들을 내주고 서비스의 가동을 사는 거래입니다."
category: "데이터 분산과 일관성"
scene: failover
steps:
  - title: "쓰는 쪽 하나, 따르는 쪽 하나"
    text: "앱은 primary인 A에 쓰고, 모든 쓰기는 잠시 뒤 replica인 B로 복제됩니다. 아래 모니터에서는 두 심장이 제때 뛰고, 표는 3분의 3으로 서 있습니다."
  - title: "박동이 멎다"
    text: "하트비트는 데이터베이스가 살아 있다고 말하는 방식입니다. A가 응답을 멈추고 램프가 꺼집니다. 모니터는 죽음과 느림을 구분하지 못합니다. 박동이 멎었다는 것만 압니다. 쓰기는 실패하고, 복제가 미처 나르지 못한 쓰기 하나가 두 기계의 차이로 남습니다."
  - title: "셋 중 둘이 동의하면"
    text: "과반이 A가 죽었다고 말하고, 하나가 승격됩니다. B가 primary가 되고 연결 문자열이 따라가며 쓰기가 재개됩니다. 복제가 나르지 못한 그 한 건은 빼고서입니다. 페일오버는 마지막 몇 순간의 데이터를 내주고 서비스의 가동을 삽니다."
  - title: "돌아온 primary는 replica로"
    text: "A가 돌아오지만 역할은 이미 옮겨 갔습니다. A는 replica로 재합류해 B에게서 밀린 것을 따라잡고, 한 쌍은 반대 방향을 가리킨 채 다시 온전해집니다. 역할이 기계 사이를 떠다니는 것, 그것이 이 장치의 전부입니다."
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Primary-Replica
    slug: primary-replica
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
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/auto-failover-group-sql-db
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

## 언제 쓰나

- 정지 시간을 배포 단위가 아니라 초 단위로 재는 상태 있는 서비스라면 모두 해당합니다. 데이터베이스가 먼저인 이유는, 복제본을 더 띄우는 것으로 끝나지 않는 유일한 구성 요소이기 때문입니다. 같은 장치가 캐시와 브로커, 검색 클러스터에도 그대로 쓰입니다.
- 다른 것을 정하기 전에 두 숫자부터 정합니다. RPO는 잃어도 되는 꼬리의 양이고, 쓰기 건수나 쓰기 몇 초분으로 잽니다. RTO는 자리가 비어 있어도 되는 시간입니다. 동기 복제와 비동기 복제 중 무엇을 쓸지, 감지 타임아웃을 얼마로 둘지, 승격에 사람의 승인을 받을지는 모두 이 두 숫자에서 따라 나옵니다.
- 대안이 더 나쁠 때 씁니다. 자동 페일오버가 붙은 한 쌍은 기계 한 대보다 움직이는 부품이 많고, 그 부품들에는 저마다의 고장 방식이 있습니다. 장애의 대가가 잘못된 승격의 대가보다 클 때 값을 합니다.
- replica가 이미 있다면 좋은 선택입니다. 처리량을 위해 읽기 복제본을 이미 돌리고 있다면 승격 경로는 거의 공짜이고, 논의는 하드웨어가 아니라 감지와 라우팅으로 옮겨 갑니다.
- 백업 대신으로는 쓰지 마세요. 페일오버는 멈춘 기계로부터 지켜 줍니다. 잘못된 마이그레이션이나 지워진 테이블에는 아무 도움이 되지 않습니다. replica도 그 변경을 충실하게, 그리고 즉시 적용했기 때문입니다.

## 주의점

- 비동기 복제는 승격이 꼬리를 잃는다는 뜻입니다. replica가 아직 적용하지 못한 것은 역할이 옮겨 가는 순간 사라지고, 그것이 문서 속 문구가 아닌 실물로서의 RPO입니다. 밀린 양을 계속 재고, 경보를 걸고, 정상값이 어떻게 생겼는지 알아 두어야 비정상값이 의미를 가집니다.
- 감지는 타임아웃이므로 모든 페일오버 설계에는 오탐 위험이 들어 있습니다. 그저 느려진 primary는 긴 체크포인트든 포화된 디스크든 가비지 컬렉션 정지든, 죽은 primary와 똑같이 보입니다. 어느 쪽이든 증거는 침묵뿐이기 때문입니다. 결정에 한 사람의 의견이 아니라 과반이 필요한 이유가 여기 있고, 타임아웃이 실제로 겪는 정지들을 견딜 만큼 길어야 하는 이유도 여기 있습니다.
- 클라이언트가 이름을 다시 풀어야 합니다. DNS TTL이 긴 호스트명에 못 박힌 연결 문자열은 더 이상 역할을 갖고 있지 않은 기계를 계속 가리킵니다. 데이터베이스 안쪽이 아무리 올바르게 동작해도 소용이 없습니다. 리다이렉트해 주는 리스너 엔드포인트를 쓰거나 여러 호스트를 아는 드라이버를 쓰고, 실패 시 재시도를 켜서 전환 뒤 첫 요청이 전환을 발견하는 요청이 되게 합니다.
- 돌아온 옛 primary는 절대로 쓰기를 받아서는 안 됩니다. 자신이 아직 primary라고 믿은 채 돌아오고 누군가 그것에 닿을 수 있다면, 쓰기를 받는 기계가 둘이 되고 나중에 둘을 맞출 방법이 없습니다. replica로 재합류하거나, 사람이 들여다볼 때까지 내려가 있어야 합니다.
- 일정에 맞춘 페일백은 스스로 잡은 두 번째 장애입니다. 역할이 옮겨 가고 한 쌍이 다시 건강해졌다면 되돌릴 이유는 대개 없습니다. 되돌린다면 조용한 시간대에, 말로 설명할 수 있는 이유가 있을 때만 하세요.
- 시험해 보세요. 한 번도 굴려 본 적 없는 페일오버 경로는 가설일 뿐이고, 깨지는 부분은 데이터베이스인 경우가 드뭅니다. 죽은 엔드포인트를 캐시해 둔 커넥션 풀, 옛 primary에서만 돌아 본 마이그레이션, 아무도 보지 않는 채널로 울린 경보가 깨집니다.

## .NET에서는

데이터베이스 쪽은 설정이고, 애플리케이션 쪽은 연결 문자열 하나와 중단을 각오한 재시도 정책입니다.

```csharp
// Npgsql: name both hosts and say what kind of session you need. The driver
// probes them, keeps the one that answers as primary, and moves after a switch.
var connection =
    "Host=db-a.example.com,db-b.example.com;Database=orders;" +
    "Target Session Attributes=primary;" +
    "Timeout=5;Cancellation Timeout=2";

builder.Services.AddDbContext<OrdersDbContext>(options =>
    options.UseNpgsql(connection, npgsql =>
    {
        // A failover looks like a transient fault to everything above it, so the
        // first call after a promotion has to be allowed to fail and be retried.
        npgsql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null);
    }));

// Reads that may be a little stale can be routed to whoever is standing, which
// keeps the reporting side alive through a promotion it does not care about.
var readOnly = connection.Replace(
    "Target Session Attributes=primary",
    "Target Session Attributes=prefer-standby");
```

Azure SQL Database에서는 auto-failover group이 이름이 바뀌지 않는 엔드포인트 두 개를 줍니다. 읽기 쓰기 리스너는 언제나 현재 primary를 들고 있는 서버로 풀리고, 읽기 전용 리스너는 secondary로 풀립니다. 애플리케이션은 시스템이 사는 내내 연결 문자열 하나만 들고 있고 이름을 옮기는 쪽은 group입니다. 장면이 그리는 치환이 바로 이것입니다. SQL Server에서는 Always On 가용성 그룹 리스너가 사내 네트워크 안에서 같은 일을 합니다. 연결 문자열의 `MultiSubnetFailover=True`는 주소를 순서대로 훑지 말고 전부 한꺼번에 시도하라는 뜻이고, 이것이 몇 초 만에 끝나는 전환과 주소마다 TCP 타임아웃을 기다리는 전환의 차이를 만듭니다.

플랫폼이 무엇이든 두 숫자는 대시보드에 올려 두면 좋습니다. replica가 밀린 양, 그리고 마지막으로 성공한 하트비트의 나이입니다. 앞의 것은 지금 승격하면 무엇을 내주게 되는지를 말해 주고, 뒤의 것은 그 값을 치르라는 요구가 얼마나 가까이 왔는지를 말해 줍니다. `Microsoft.Extensions.Diagnostics.HealthChecks`가 이 둘을 드러내기에 알맞은 자리입니다. 데이터베이스에 닿는다는 사실을 이미 아는 헬스 체크라면, replica가 얼마나 뒤처졌는지는 질의 하나 거리에 있기 때문입니다.
