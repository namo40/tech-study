---
title: "Resource Limit"
summary: "resource limit은 컨테이너가 붙들리는 천장입니다. CPU limit을 넘으면 스로틀링되고 메모리 limit을 넘으면 종료되는데, 두 고장은 전혀 다르게 보입니다. 하나는 느려진 서비스이고 다른 하나는 사라진 프로세스입니다."
category: "컨테이너와 오케스트레이션"
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Tail Latency
    slug: tail-latency
  - label: Garbage Collection
    slug: garbage-collection
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
  - title: "Run .NET applications in containers"
    url: https://learn.microsoft.com/en-us/dotnet/core/docs/containers/
---

장면의 네 번째 단계에 나오는 request는 컨테이너에게 약속된 바닥값입니다. limit은 컨테이너가 붙들리는 천장이고, 둘은 같은 컨테이너의 같은 블록에 적히기 때문에 그만큼 쉽게 헷갈립니다. request는 스케줄러가 잡아 두는 것이고, limit은 런타임이 강제하는 것입니다.

CPU limit은 스로틀링으로 강제됩니다. 커널이 100밀리초 주기마다 컨테이너에 할당량을 주고, 할당량이 떨어지면 다음 주기가 시작될 때까지 스레드를 세워 둡니다. 오류가 나지도 않고 애플리케이션이 로그를 남기지도 않으니 흔적은 지연뿐입니다. p50은 멀쩡해 보이는데 p99에 100밀리초짜리 계단이 생깁니다. 순간적으로 몰리는 서비스에서 CPU limit을 request 가까이 잡는 것은 아무도 설명하지 못하는 꼬리의 흔한 원인 가운데 하나입니다. 대시보드가 보여 주는 평균 사용률은 정작 문제를 일으키는 limit 근처에 가지도 않기 때문입니다.

메모리 limit은 종료로 강제됩니다. 프로세스를 스로틀링해서 메모리를 덜 쓰게 만들 수는 없으니, 넘긴 컨테이너는 종료되고 pod에는 `OOMKilled`가 기록되며 재시작은 지연이 아니라 가용성 문제로 나타납니다. 이 차이는 몸에 익혀 둘 값어치가 있습니다. 너무 낮은 CPU limit은 서비스를 나쁘게 만들고, 너무 낮은 메모리 limit은 서비스를 없애 버립니다.

둘은 request와 함께 QoS 등급도 정합니다. limit을 request와 같게 두면 `Guaranteed`가 되는데, 지연에 민감한 워크로드가 원하는 것이 이쪽입니다. 예약한 것보다 아래로 스로틀링되는 일이 없고 쫓겨나는 순서도 가장 마지막입니다. limit을 request보다 한참 높게 두면 `Burstable`이 되고, 몰림이 짧고 노드에 정말 여유가 있을 때는 효율적이지만 여러 컨테이너가 동시에 몰릴 때는 위험합니다.

.NET에서 메모리 limit은 울타리에 그치지 않고 입력값이기도 합니다. 런타임이 cgroup limit을 읽어 그것을 기준으로 GC 힙 크기를 정하고, 기본값이 limit의 75%인 `GCHeapHardLimitPercent`가 수집기가 예산의 꼭대기로 삼는 값입니다. 그래서 메모리 limit을 올리면 .NET은 덜 자주 수집하고 더 많이 씁니다. 보통은 그것이 원하는 바이지만, 예전 limit 아래에서 뽑은 메모리 그래프를 보고 고른 limit은 틀린 값이 된다는 뜻이기도 합니다. 서버 GC는 컨테이너에 보이는 CPU를 기준으로 힙 개수도 정하므로, CPU limit이 GC의 모양까지 조용히 바꿉니다.

대부분의 서비스에 현실적인 설정은 메모리 limit을 메모리 request와 같게 두고, CPU limit은 아예 두지 않거나 CPU request보다 넉넉히 높게 두는 것입니다. 이 조합이면 pod를 축출 목록에서 빼 주는 메모리 보장은 얻으면서, 꼬리에 계단을 만드는 스로틀링은 피할 수 있습니다. 어느 쪽을 고르든 `container_cpu_cfs_throttled_seconds_total`과 pod 재시작 사유는 꼭 챙겨 보세요. 두 고장 모두 프로세스 안에서는 보이지 않습니다.
