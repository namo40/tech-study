---
title: "Singleton Worker"
summary: "싱글턴 워커는 레플리카를 몇 개 띄워 두었든 어느 순간에나 인스턴스 전체에서 정확히 하나에서만 도는 배경 작업입니다. 리더 선출이 존재하는 이유가 이것이고, 실제로 그렇게 돌고 있는지는 작업 스트립에서 확인합니다."
category: "분산 조정"
scene: leader-election
sceneStep: 4
related:
  - label: Leader Election
    slug: leader-election
  - label: Background Job
    slug: background-job
  - label: Distributed Lock
    slug: distributed-lock
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Fencing Token
    slug: fencing-token
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotency Key
    slug: idempotency-key
  - label: Failover
    slug: failover
references:
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

장면의 마지막 단계는 리스에서 눈을 떼고 작업 스트립을 봅니다. 지금까지의 모든 것이 오직 그 스트립을 위한 것이었기 때문입니다. 왼쪽에서 오른쪽으로 읽으면 전체 구간에 걸쳐 끊기지 않은 한 줄의 틱이 보입니다. 인스턴스 셋이 떴고, 그중 하나가 죽었고, 자리가 다른 쪽으로 옮겨 갔지만, 그 줄은 그런 일에 아랑곳하지 않습니다. 아무도 자리를 쥐지 않았던 짧은 공백이 있고, 중복 카운터는 끝까지 움직이지 않습니다. 그 줄이 싱글턴 워커의 정의이고, 그 위에 있는 레코드 카드와 카운트다운과 에포크는 오직 그 줄을 그런 모습으로 유지하기 위해 존재합니다.

이 패턴이 푸는 문제는 애플리케이션의 레플리카를 하나에서 셋으로 늘린 날 드러납니다. 코드는 아무것도 바뀌지 않았는데, 1분마다 만료된 장바구니를 쓸어 내던 예약 작업이 이제 프로세스 셋에서 서로 경쟁하며 1분에 세 번 쓸어 냅니다. 대개는 아무도 눈치채지 못합니다. 그 작업이 마침 반복해도 안전했기 때문입니다. 그러다 어느 날 안전하지 않게 됩니다. 야간 보고서가 재무 담당 사서함에 세 통 도착하거나, 재시도 큐를 펌프 셋이 나눠 비우면서 같은 메시지를 저마다 처리 완료로 표시하거나, 캐시 예열기가 데이터베이스가 가장 못 버티는 바로 그 시각에 부하를 세 배로 올립니다. 수평 확장은 옳았고, 무너진 것은 모든 것이 하나뿐이라는 전제였습니다.

빠져나가는 정직한 길은 둘이고, 자기가 어느 쪽을 고르는지 아는 것이 중요합니다. 하나는 작업을 나눌 수 있게 만드는 것입니다. 모든 인스턴스가 자기 몫을 가져가고 조율이 필요 없어집니다. 그것이 경쟁 소비자이고, 확장되며, 작업이 서로 독립적인 항목의 흐름일 때는 언제나 더 나은 답입니다. 다른 하나는 작업을 싱글턴으로 만드는 것입니다. 정확히 한 인스턴스가 돌리고 나머지는 기다립니다. 그것이 이 패턴이고, 전혀 확장되지 않으며, 작업이 순차적인 위치이거나 전역 훑기이거나 두 워커가 순서를 합의해야 하는 종류일 때 옳은 답입니다. 나눌 수 있었던 일을 싱글턴으로 고르는 것은 흔하고 비싼 실수입니다. 이제 천장이 영원히 기계 한 대이기 때문입니다.

싱글턴을 골랐다면 가장 중요한 구현 세부는 리더십을 루프 바깥이 아니라 루프 안에서 확인하는 것입니다. 리스를 얻고 나서 긴 `while (true)`로 들어가는 워커는 리스를 쥐고 있는 동안이 아니라 프로세스가 살아 있는 동안 싱글턴이고, 이 둘은 첫 번째 멈춤에서 갈라섭니다. 작업 단위마다 토큰을 확인하고, 쓰기를 하는 곳까지 에포크를 내려보내고, 리스를 잃었다면 경고를 남기고 계속할 이유가 아니라 배치 도중에라도 멈출 이유로 다룹니다. 물러나는 경로는 결코 테스트되지 않는 부분이므로, 그 부분부터 먼저 쓸 만합니다.

또 하나의 세부는 들어올 때의 시점입니다. 인계 동안 자리가 잠깐 비므로 새 리더는 일부만 끝난 작업을 물려받고, 앞사람이 멈춘 곳이 어디든 거기서부터 이어 갈 수 있어야 합니다. 테이블의 커서, 시각이 붙은 점유 컬럼, 확인 응답이 없으면 다시 배달하는 큐가 모두 그것을 줍니다. 메모리에 있는 카운터는 주지 못합니다. 모든 작업 단위는 완료되어 기록되었거나, 완료되지 않아 누군가 다시 보게 되거나 둘 중 하나라고 가정합니다. 그러면 리더가 도중에 죽어도 아무 일도 아니게 되고, 장면 속 끊기지 않은 줄이 보여 주는 것이 정확히 그것입니다.

마지막으로 싱글턴 워커를 무엇으로 재야 하는지 봅니다. 처리량은 아닙니다. 그것은 하나뿐이기 때문입니다. 의미 있는 숫자는 장애 뒤에 자리가 얼마나 오래 비어 있었는지, 인계를 거치는 동안 두 번 돈 단위가 있었는지, 아무도 자리를 쥐지 않은 동안 작업이 얼마나 밀렸는지입니다. 셋 모두 스트립에서 바로 읽힙니다. 공백, 중복 카운터, 그리고 인계 직전 마지막 틱과 직후 첫 틱 사이의 거리입니다.
