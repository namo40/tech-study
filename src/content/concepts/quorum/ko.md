---
title: "Quorum"
summary: "두 번 존재할 수 없는 가장 작은 무리입니다. 무엇을 정하기 전에 과반을 요구하는 것은 형식이 아니라, primary가 동시에 둘이 되는 일을 불가능하게 만드는 산수입니다. 대신 과반에 닿지 못하면 멈춘다는 대가가 붙습니다."
category: "데이터 분산과 일관성"
scene: failover
sceneStep: 3
related:
  - label: Failover
    slug: failover
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Heartbeat
    slug: heartbeat
  - label: Lease TTL
    slug: lease-ttl
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
  - title: "Understand cluster and pool quorum"
    url: https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/quorum
  - title: "Windows Server Failover Clustering with SQL Server"
    url: https://learn.microsoft.com/en-us/sql/sql-server/failover-clusters/windows/windows-server-failover-clustering-wsfc-with-sql-server
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
---

장면의 3단계는 장부 정리처럼 보이지만 사실은 설계 전체의 안전 속성인 숫자 하나를 축으로 돕니다. 모니터가 `votes 2/3`을 적고, 그러고 나서야 무엇인가가 움직입니다. 셋 중 둘은 이미 내려진 결정 앞에서 치르는 의식이 아닙니다. 두 번 존재할 수 없는 가장 작은 무리입니다. 구성원 집합을 아무렇게나 갈라도 절반을 넘는 조각은 하나뿐입니다. 이 한 문장이 페일오버를 자동으로 돌려도 되는 이유의 전부입니다.

의견 하나로는 왜 모자라는지는 모니터에게 혼자 승격을 결정할 권한을 준다고 상상해 보면 보입니다. 그 상태에서 A는 멀쩡하게 앱에 답하고 있는데 모니터와 A 사이의 네트워크만 끊어 봅니다. 모니터가 선 자리에서 보면 이것은 장면의 2단계와 똑같습니다. 박동이 멎었습니다. 모니터는 B를 승격하고, 연결이 옮겨 가고, A는 여전히 자기에게 닿을 수 있는 모든 클라이언트로부터 쓰기를 계속 받습니다. primary가 둘, 갈라진 역사가 둘이고, 그 사실을 아는 곳은 어디에도 없습니다. 관찰자 한 명의 판정은 그가 볼 수 있는 것에 대한 판정이고, 그가 볼 수 있는 것은 참인 것과 같지 않습니다.

과반은 더 똑똑해서가 아니라 산수로 이것을 막습니다. 구성원 셋을 가르면 한쪽은 많아야 하나를 얻습니다. 하나는 과반이 아니므로 그쪽은 무엇을 믿든 움직일 수 없습니다. 감탄할 만한 대목이 여기입니다. 고립된 구성원은 자기가 고립되었다는 사실을 알아낼 필요가 없고, 정직할 필요도, 신중할 필요도, 잘 구현되어 있을 필요도 없습니다. 그저 문턱에 닿지 못할 뿐입니다. 세상의 상태에 대해 완전히 틀린 믿음을 가진 구성원에게도 규칙은 안전하게 남고, 네트워크 분단이 만들어 내는 구성원이 바로 그런 종류입니다.

정족수의 구성원을 서열이 아니라 머릿수로 세는 이유, 그리고 그 수가 홀수이기를 바라는 이유가 이것입니다. 둘로 된 무리에는 쓸모 있는 과반이 아예 없습니다. 둘의 과반은 둘이므로 어느 한쪽이 사라져도 전부 멈추고, 결국 아무것도 산 것이 없습니다. 한 쌍을 한 번의 상실에서 살아남는 것으로 바꿔 주는 것은 세 번째 표이고, 세 번째 표가 세 번째 데이터베이스일 필요는 없습니다. 감시자, 중재자, 파일 서버의 공유 폴더, 다른 영역에 있는 작은 프로세스면 됩니다. 예라고 말할 수 있어야 하고, 나머지 둘과 따로 고장 날 수 있어야 합니다.

같은 산수가 대가도 분명하게 말해 줍니다. 과반을 요구하는 시스템은 과반을 얻지 못하면 멈춥니다. 셋 중 둘을 잃으면 처리 용량만 잃은 것이 아니라 무엇이든 결정할 능력을 잃은 것이고, 누가 자리를 이어받아야 하는지를 결정할 능력까지 잃은 것입니다. primary가 둘이 되는 일은 결코 없다는 보장을 사고 가용성을 내준 것이며, 이 이야기는 사고가 난 도중이 아니라 그 전에 소리 내어 해 두는 편이 낫습니다. 올바르게 움직이기를 거부한 클러스터는 고장 난 클러스터와 똑같이 보이고, 새벽 세 시에 호출된 사람이 그 차이를 원리부터 짚어 가며 알아내는 일은 즐겁지 않습니다.

실무적인 이야기가 둘 따라옵니다. 표들은 서로 따로 고장 나야 합니다. 같은 랙, 같은 하이퍼바이저, 같은 전원 계통 뒤에 있는 구성원 셋은 한 번의 고장이 옷 세 벌을 입고 있는 것이고, 그들이 이루는 과반은 상상 속에만 있습니다. 그리고 표는 언제나 살아 있음에 대한 것이지 데이터에 대한 것이 아닙니다. A가 죽었다고 정하는 일과, 살아남은 replica 중 어느 쪽이 가장 앞서 있어서 승격해야 하는지를 정하는 일은 다른 질문입니다. 앞의 것만 답하고 뒤의 것을 잊은 설계는 고를 수 있는 것 중 가장 짧은 역사를 가진 기계를 기꺼이 승격시킵니다.
