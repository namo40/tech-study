---
title: "Fencing Token"
summary: "Fencing token은 잠금을 획득할 때마다 발급되는, 커지기만 하는 번호입니다. 보유자는 모든 쓰기에 이 번호를 달고, 리소스는 이미 받아들인 가장 큰 번호보다 작은 토큰이 붙은 쓰기를 거부합니다."
category: "분산 조정"
scene: distributed-lock
sceneStep: 4
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Idempotency
    slug: idempotency
references:
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

Fencing token이 푸는 문제는 장면의 3단계가 보여 주는 바로 그 상황입니다. 리스를 잃을 만큼 오래 멈춰 있던 보유자가 아무 일도 없었다는 듯 깨어납니다. 그 보유자는 안에서 그 공백을 알아낼 방법이 없습니다. 자기 시계로는 스레드 시간 몇 밀리초가 지났을 뿐이고, 잠금 객체는 여전히 키를 쥐고 있다고 말하며, 다음 쓰기는 직전 쓰기와 똑같이 생겼습니다. 잠금 서비스에 다시 물어봐도 소용이 없습니다. 답이 돌아올 즈음이면 리스가 또 만료됐을 수 있기 때문입니다.

그래서 검사를 할 수 있는 유일한 쪽으로 검사를 옮깁니다. 쓰기를 받는 리소스입니다. 획득할 때마다 반복되지도 않고 되돌아가지도 않는 번호를 찍어 주는데, 보통은 키 옆에 둔 원자적 카운터입니다. 보유자는 모든 쓰기에 그 번호를 달고 다닙니다. 리소스는 자기가 받아들인 가장 큰 번호를 기억하고, 그보다 작은 값이 붙어 오는 쓰기를 거부합니다. 옛 보유자의 쓰기가 토큰 37을 달고 도착했을 때 저장소는 이미 새 보유자에게서 38을 받았고, 그 순간 37은 아무 의미가 없습니다.

이 방식이 통하는 이유는 순서를 정하는 쪽이 발급 순서를 아는 유일한 구성 요소인 잠금 서비스이고, 그 순서를 검사하는 쪽이 쓰기를 보는 유일한 구성 요소인 리소스이기 때문입니다. 어느 쪽도 시계를 믿을 필요가 없고, 보유자가 스스로를 어떻게 여기는지를 믿을 필요도 없습니다. 토큰은 권고에 지나지 않던 잠금을 저장소가 실제로 강제하는 배타성으로 바꾸고, 잠금은 경쟁을 줄여 주는 최적화 장치로 내려앉습니다. 정확성이 잠금 위에 얹혀 있지 않게 됩니다.

구현에 드는 비용은 컬럼 하나와 조건절 하나입니다. 관계형 데이터베이스에서는 갱신문에 붙는 `WHERE last_token < @token`이고, 이것은 낙관적 동시성 검사와 같은 모양이지만 기준이 행 자신의 버전이 아니라 리스입니다. 문서 저장소에서는 같은 필드에 대한 조건부 쓰기이고, 객체 저장소에서는 현재 토큰을 읽은 뒤 `If-Match` 사전 조건을 걸어 쓰는 방식입니다. 객체 저장소는 순서가 아니라 같은지만 비교할 수 있기 때문입니다. 이 패턴이 무너지는 경우는 리소스가 조건 자체를 표현할 수 없을 때뿐인데, 설계가 잠금에 기대기 전에 반드시 확인해 둘 일입니다. 목적지가 낡은 쓰기를 거부할 수 없다면 그 뒤에 있는 어느 것도 거부할 수 없습니다.

틀리기 쉬운 지점이 둘 있습니다. 토큰은 획득에서 받아 와야 하고 쓰는 쪽이 자기 카운터로 만들면 안 됩니다. 그러면 두 쓰기 주체가 같은 값을 찍을 수 있습니다. 그리고 리소스는 토큰을 자기가 지키는 데이터 옆에 영속적으로 저장해야 합니다. 메모리에만 기억한 토큰은 재시작 한 번에 잊히는데, 하필 옛 보유자는 그 재시작을 넘기고 살아남기 쉽습니다.
