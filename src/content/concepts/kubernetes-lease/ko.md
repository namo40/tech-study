---
title: "Kubernetes Lease"
summary: "Lease는 coordination.k8s.io API 그룹에 속한 평범한 쿠버네티스 오브젝트이고, spec에 누가 쥐고 있는지와 마지막으로 언제 갱신했는지를 적어 둡니다. 컨트롤 플레인 자신이 노드 하트비트와 리더 선출을 이 위에서 돌리며, 애플리케이션은 클라이언트 라이브러리로 같은 오브젝트를 빌려 씁니다."
category: "분산 조정"
scene: leader-election
sceneStep: 2
related:
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Distributed Lock
    slug: distributed-lock
  - label: Singleton Worker
    slug: singleton-worker
references:
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

장면의 두 번째 단계에서 리더십은 직함이 아니라 리스이고, 쿠버네티스에서 이 문장은 문자 그대로입니다. 리스는 `kubectl get`으로 꺼내 볼 수 있는 실제 오브젝트입니다. `Lease`는 `coordination.k8s.io/v1` API 그룹에 속하고, 다른 리소스처럼 네임스페이스 안에 살며, spec에 눈여겨볼 필드 네 개를 담습니다. 쥔 쪽이 스스로 고른 문자열인 `holderIdentity`, 자리를 얼마 동안 주장하는지인 `leaseDurationSeconds`, 마지막으로 그렇게 말한 시각인 `renewTime`, 자리가 몇 번이나 손을 바꿨는지 세는 `leaseTransitions`입니다. 이 그림 어디에도 잠금 서비스는 없습니다. 안전성은 API 서버의 낙관적 동시성에서 나옵니다. 후보는 자기가 읽은 `resourceVersion`을 달아 오브젝트를 쓰고, 다른 쪽이 먼저 썼다면 그 갱신은 충돌로 거절되므로, 매 회차에 정확히 한 쓰기만 이깁니다. 갱신과 만료에 관해 lease TTL이 말하는 내용은 여기서도 그대로 적용됩니다. 이 페이지는 그 의미들이 담기는 오브젝트에 관한 이야기입니다.

잠금 서비스를 예상한 사람이 놀라는 성질이 하나 있어서 분명히 적어 둘 만합니다. 서버 쪽에서 Lease를 만료시키는 것은 아무것도 없습니다. `renewTime`에 `leaseDurationSeconds`를 더한 시각이 지나도 오브젝트는 사라지지 않고, 주장이 이미 낡은 보유자의 쓰기라고 해서 API 서버가 거절하지도 않습니다. 만료는 후보들이 내리는 판단입니다. 각자 오브젝트를 읽어 그 두 필드를 현재 시각과 견주고, 보유자가 기한을 넘긴 것으로 보일 때만 자리를 가져오려 시도합니다. 그래서 시계에 관한 주의가 여기서는 덜해지는 것이 아니라 더 중요해지고, 리더의 안전이 아직 오브젝트를 쥐고 있다는 메모리 속 믿음에 기댈 수 없는 이유도 여기 있습니다.

이 장치가 튼튼하다는 가장 좋은 증거는 쿠버네티스 자신이 그 위에서 돌아간다는 사실입니다. 모든 노드는 `kube-node-lease` 네임스페이스에 Lease를 하나씩 가지고 kubelet이 짧은 주기로 갱신하며, 노드 컨트롤러는 노드 상태 전체를 받는 대신 그 오브젝트들을 읽어 노드가 아직 살아 있는지 판단합니다. 컨트롤 플레인 자신의 단일 실행자들도 같은 방식으로 스스로를 뽑습니다. `kube-controller-manager`와 `kube-scheduler`는 각각 `kube-system`의 Lease를 두고 경쟁하고, 그래서 복제본이 셋인 컨트롤 플레인에서도 판단을 내리는 스케줄러는 하나뿐입니다. 아무 클러스터에서나 `kubectl get leases -A`를 하면 애플리케이션이 만든 것보다 먼저 이 둘이 보입니다.

애플리케이션은 이 장치의 사본이 아니라 같은 장치를 빌려 씁니다. Go에서는 client-go의 `leaderelection` 패키지가 Lease 리소스 위에서 획득과 갱신 루프를 구현하고, .NET에서는 KubernetesClient의 호스팅 서비스 통합이 같은 일을 합니다. `holderIdentity`에 적히는 신원은 보통 파드 이름이라서, 장애 상황에서 운영자가 오브젝트만 보고 현재 리더를 읽을 수 있습니다. 따라오는 실무 요건이 셋 있습니다. 파드의 서비스 계정에는 자기 네임스페이스의 lease를 get, create, update할 RBAC 권한이 필요하고, 갱신 루프는 느린 작업과 스레드를 나눠 쓰지 말아야 하며, 워크로드는 언제든 자리를 잃어도 견뎌야 합니다. Lease가 주는 것은 API 서버 안의 주장이지, 다른 곳의 프로세스가 아직 무엇을 믿고 있는지에 대한 보장이 아니기 때문입니다.
