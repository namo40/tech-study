---
title: "Resource Request"
summary: "resource request는 컨테이너가 요청하는 몫입니다. 스케줄러가 노드에서 그 컨테이너를 위해 잡아 두는 CPU와 메모리이며, pod가 어느 노드에 놓일지, 바쁜 노드에서 얼마만큼을 보장받을지, 오토스케일러의 CPU 퍼센트가 무엇에 대한 퍼센트인지를 정합니다."
category: "컨테이너와 오케스트레이션"
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Readiness Probe
    slug: readiness-probe
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: assign CPU resources to containers"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
---

장면의 네 번째 단계는 CPU 수치 옆에 `requests: 500m`을 띄웁니다. 이 라벨은 보이는 것보다 훨씬 많은 일을 합니다. CPU 95%인 pod는 노드의 95%를 쓰고 있는 것이 아닙니다. 코어 절반의 95%를 쓰고 있는 것입니다. `500m`이 코어 절반이고 그것이 이 pod가 요청한 몫이기 때문입니다. request를 바꾸면 pod가 하는 일은 그대로인데 장면의 모든 퍼센트가 함께 바뀝니다.

request는 예약입니다. 스케줄러는 노드에 이미 올라간 것들의 request를 모두 더하고, 남은 자리에 들어가는 곳에만 pod를 놓습니다. 그래서 request가 pod가 어느 노드에 놓일지를, 그리고 놓일 수 있기는 한지를 정합니다. 상한은 아닙니다. 노드가 한가하면 컨테이너는 요청한 것보다 더 써도 됩니다. request가 보장하는 것은 바닥값입니다. 노드가 붐빌 때 CPU는 request에 비례해 나뉘므로, `500m`을 요청한 컨테이너는 포화된 기계에서도 최소한 그만큼은 받습니다.

이 바닥값 때문에 숫자가 두 번 중요해집니다. 너무 낮게 잡으면 pod가 붐비는 노드에 배치되고 이웃이 바빠지는 순간 눌립니다. 증상은 내 트래픽이 아니라 다른 팀이 무엇을 배포했는지에 따라 움직이는 지연입니다. 너무 높게 잡으면 스케줄러가 실제로 쓰이는 것보다 큰 자리를 찾아야 하므로, 아무도 쓰지 않는 예약으로 노드가 차고 클러스터 오토스케일러는 빈 공간을 담을 기계를 사들입니다.

메모리에서도 request는 같은 의미의 예약이지만, 틀렸을 때의 결과가 더 날카롭습니다. CPU는 압축할 수 있어서 자기 몫보다 더 원하는 컨테이너는 느려질 뿐입니다. 메모리는 그렇지 않아서, 다 쓴 노드는 pod를 쫓아내고 request보다 초과해서 쓰는 정도가 큰 것부터 쫓아냅니다. 실제 작업 집합을 정직하게 반영한 메모리 request가 pod를 그 목록에서 빼 줍니다.

장면이 그리는 의존 관계가 바로 오토스케일러 쪽 이야기입니다. `averageUtilization: 60`은 request의 60퍼센트를 뜻하며, pod들의 값을 합해 replica 개수로 나눈 것입니다. CPU request가 없는 컨테이너는 분모가 없으니 이 지표가 아예 존재하지 않고, HorizontalPodAutoscaler는 권장값을 계산할 수 없다고 보고합니다. request와 limit은 함께 pod의 QoS 등급도 정합니다. 둘이 같으면 `Guaranteed`, request만 있고 짝이 되는 limit이 없으면 `Burstable`, 둘 다 없으면 `BestEffort`인데 마지막이 노드가 압박을 받을 때 가장 먼저 쫓겨납니다.

.NET에서는 이 숫자를 짐작하지 말고 재서 정합니다. 실제와 비슷한 부하로 워크로드를 돌리면서 `process.cpu.utilization`과 GC 힙 크기를 보고, 정점이 아니라 정상 상태 근처에 request를 맞춥니다. 정점을 감당하라고 있는 것이 여유 용량과 오토스케일러이기 때문입니다. .NET에서는 `ServerGarbageCollection`을 바꿀 때마다 메모리 request를 다시 볼 값어치가 있습니다. 서버 GC가 컨테이너에 보이는 CPU와 메모리를 기준으로 힙 크기를 정하기 때문입니다.
