---
title: "Heartbeat"
summary: "내용이라고는 도착했다는 사실뿐인 주기 신호입니다. 하트비트가 말하는 것은 정보가 아니고, 정보는 오지 않은 하트비트 쪽에 있습니다. 그래서 모든 감지기는 사실 침묵의 길이를 고르고 있습니다."
category: "데이터 분산과 일관성"
scene: failover
sceneStep: 2
related:
  - label: Failover
    slug: failover
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Primary-Replica
    slug: primary-replica
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Flexible automatic failover policy for an availability group"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/configure-flexible-automatic-failover-policy
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Health Endpoint Monitoring pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring
---

장면의 2단계는 아무 내용도 실어 나르지 않는 신호를 중심으로 짜여 있습니다. 하트비트는 도착했다는 것 말고는 아무 말도 하지 않습니다. 읽을 만한 본문도, 상태 필드도, 기계의 기분에 대한 요약도 없습니다. 모니터로 떨어지는 두 점은 매번 똑같이 생겼고, 바로 그 점이 핵심입니다. 모니터가 알아내는 것은 박동 안에 들어 있지 않습니다. 기대한 때에 박동이 도착했다는 사실에 들어 있습니다.

여기서 사람들이 대개 호되게 배우는 결과가 하나 나옵니다. 하트비트가 나르는 유일한 정보는 '오지 않았다'는 것입니다. A가 멈추는 순간에 무슨 일이 일어나는지 보면 됩니다. 아무 일도 일어나지 않습니다. 오류도 나지 않고, 메시지도 가지 않고, 램프가 깜박이지도 않습니다. 멈춘 기계는 자기가 멈췄다고 아무에게도 말할 수 없기 때문입니다. 중요한 사건은 부재이고, 부재는 무언가를 이미 기다리고 있던 쪽만 알아챌 수 있습니다. 모니터가 무엇이든 알기 전에 먼저 주기를 알고 있어야 하는 이유, 그리고 램프가 고장이 난 그 순간이 아니라 얼마쯤 뒤에 꺼지는 이유가 여기 있습니다.

그래서 2단계 자막의 문장이 나옵니다. 모니터는 죽음과 느림을 구분하지 못합니다. 긴 가비지 컬렉션에 멈춘 프로세스, 디스크가 포화된 기계, 체크포인트 중인 데이터베이스, 한 방향으로만 패킷을 버리기 시작한 네트워크. 모니터 쪽에서 보면 이 모두가 전원이 뽑힌 기계와 구별되지 않습니다. 전부 침묵으로 보이기 때문입니다. 감지기를 설계하는 사람은 죽음을 감지하고 있지 않습니다. 죽음으로 취급하겠다고 마음먹은 침묵의 길이를 고르고 있고, 그 차이를 끝내 확인할 방법이 없는 채로 고르고 있습니다.

이 때문에 타임아웃은 설계 전체에서 가장 결과가 큰 숫자가 되고, 양쪽 모두에 대가가 붙은 숫자가 됩니다. 짧게 잡으면 평범한 정지가 장애로 읽힙니다. 필요하지도 않았던 승격, 이유 없이 끊긴 연결, 최악의 경우에는 여전히 잘 쓰기를 받고 있는 기계에 내려진 사망 선고가 따라옵니다. 길게 잡으면 사용자가 실패하는 요청을 지켜보는 동안 자리가 딱 그만큼 비어 있습니다. 양쪽을 다 피하는 설정은 없고, 위험을 어느 쪽에 두고 싶은지를 정하는 설정만 있습니다.

장면의 램프가 꺼진 상태를 하나가 아니라 둘로 가진 이유가 이것입니다. 박동을 한 번 놓치면 모니터는 A를 의심하고, 두 번 놓치면 아예 세지 않습니다. 둘 사이의 간격은 일부러 벌려 둔 것입니다. 두 상태의 비용이 완전히 다르기 때문입니다. 의심은 공짜이고 아무도 모르게 거둬들일 수 있으므로 싸고 이르게 해도 됩니다. 구성원을 셈에서 빼는 것은 승격을 풀어 주는 행위이고, 승격은 공짜가 아니며 거둬들일 수도 없으므로 느리고 비싸야 합니다. 의심은 싸게, 확신은 비싸게입니다.

어떤 조정보다 값이 나가는 현실적인 지침이 둘 있습니다. 첫째, 하트비트는 진짜 일이 다니는 길로 다녀야 하고 진짜 일을 하는 것이 만들어 내야 합니다. 본 스레드가 교착 상태인데 여분 스레드가 답한 박동, 데이터 네트워크가 죽었는데 관리 네트워크로 보낸 박동은 박동이 아예 없는 것보다 나쁩니다. 있지도 않은 건강을 적극적으로 보고하기 때문입니다. 둘째, 자주 보낼 만큼 싸면서 무언가를 증명할 만큼은 비싸야 합니다. 프로세스가 아직 살아 있다는 것만 증명하는 엔드포인트는, 그 뒤의 모든 쿼리가 타임아웃되는 동안에도 꾸준히 박동을 보냅니다.
