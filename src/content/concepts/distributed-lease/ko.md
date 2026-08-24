---
title: "Distributed Lease"
summary: "분산 lease는 만료 시간이 붙은 잠금입니다. 보유자는 정해진 시간 동안만 키를 갖고 계속 연장을 요청해야 하며, 어떤 이유로든 요청이 끊기면 키는 다음 차례에게 돌아갑니다."
category: "분산 조정"
scene: distributed-lock
sceneStep: 2
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Split Brain
    slug: split-brain
  - label: Lock
    slug: lock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
---

한 프로세스 안의 잠금은 코드가 놓을 때까지 유지되고, 스레드가 죽으면 런타임이 정리해 줍니다. 네트워크 너머에는 그렇게 해 주는 존재가 없습니다. 한 인스턴스가 키를 가져간 뒤 전원이 나가면 키는 영원히 잡힌 채로 남고, 나머지 인스턴스도 영원히 기다리게 됩니다. 만료 시간은 그 문제에 대한 답이고, 분산 잠금이 사실은 lease인 이유이기도 합니다. 키는 작업이 끝날 때까지가 아니라 정해진 시간 동안만 주어집니다.

그래서 TTL은 기본값을 베껴 오면 되는 설정이 아니라 실제 설계 결정입니다. 너무 짧으면 그저 느릴 뿐인 보유자가 작업 도중에 키를 잃습니다. 너무 길면 죽어 버린 보유자가 그 시간만큼 모두를 막습니다. 보통은 임계 구역 소요 시간의 p99보다 넉넉히 위로 TTL을 잡고, 그 일부 지점마다 갱신해서 실제로 위험해지기 전에 갱신이 여러 번 실패할 여유를 둡니다. 장면에서는 TTL이 줄어드는 원호로 그려지고 갱신이 그것을 다시 채웁니다. TTL의 60% 지점마다 갱신하면 키가 위태로워지기까지 두 번의 갱신을 놓쳐야 합니다.

갱신은 조건부여야 합니다. "이 키의 만료를 늘려라"는 잘못된 연산입니다. 요청이 도착할 즈음 키가 이미 다른 쪽 것이 되어 있을 수 있고, 그때 남의 lease를 연장하는 것은 아무 일도 하지 않는 것보다 나쁩니다. 옳은 연산은 "값이 아직 내 소유자 id일 때만 이 키를 연장하라"이고, Redis에서는 작은 Lua 스크립트로, Kubernetes에서는 Lease 객체의 resource version으로 표현합니다. 해제도 같은 모양입니다. 아직 내 것일 때만 지웁니다.

정말 중요한 실패는 갱신 응답이 돌아오지 않는 경우입니다. 이것은 lease가 사라졌다고 알려 주는 것이 아니라, 아직 쥐고 있다는 사실을 증명할 수 없다고 알려 줄 뿐입니다. 그런데 자원 입장에서는 둘이 같은 말입니다. 안전한 대응은 즉시 작업을 멈추고 그 시점 이후를 전부 소유하지 않은 상태로 취급하는 것입니다. 갱신 실패를 로그로만 남기고 하던 일을 계속하는 코드가 바로 쓰기 주체를 둘로 만드는 코드입니다. lease는 몇 초 전에 이미 만료됐을 수 있고, 다른 쪽이 벌써 일하고 있을 수 있습니다.

이것만으로 lease가 안전해지지는 않습니다. 만료는 죽은 보유자가 시스템을 막을 수 있는 시간의 상한을 정해 주는 활성 속성일 뿐이고, 살아 있으면서 자기가 키를 쥐고 있다고 잘못 알고 있는 보유자에 대해서는 아무것도 하지 않습니다. 그 빈틈을 메우는 것이 fencing token이며, 토큰이 없는 lease는 쓰기 주체가 둘이 될 확률을 낮출 뿐 없애지는 못합니다.
