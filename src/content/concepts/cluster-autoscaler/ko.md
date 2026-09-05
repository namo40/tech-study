---
title: "Cluster Autoscaler"
summary: "Cluster Autoscaler는 스케줄되지 못한 파드를 보고 그 파드를 위해 기계를 더하고, 더는 아무도 필요로 하지 않는 노드는 드레인해서 반납합니다. 사용량이 아니라 request로 계획하기 때문에, 확보하는 규모는 파드에 적힌 숫자만큼만 정직합니다."
category: "컨테이너와 오케스트레이션"
scene: elasticity
sceneStep: 4
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Rolling Update
    slug: rolling-update
  - label: Load Balancer
    slug: load-balancer
  - label: Backpressure
    slug: backpressure
  - label: Throughput
    slug: throughput
references:
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Cluster Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler
  - title: "Use the cluster autoscaler in Azure Kubernetes Service"
    url: https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler
---

4단계는 그림이 소프트웨어 이야기이기를 그만두는 지점입니다. 레플리카 셋이 다섯이 되었고, 아래의 기계 둘은 이미 꽉 차 있었고, 다섯 번째 파드는 설 자리가 없었습니다. 실패한 것도 아니고 거절당한 것도 아닙니다. `pending`이 되었습니다. Kubernetes가 그 파드를 받아들이기는 했지만 놓을 곳이 없다고 말하는 상태입니다. 클러스터 오토스케일러가 하는 모든 일은 그 하나의 조건에서 시작합니다.

방아쇠는 스케줄러가 넣지 못한 파드이지, 바빠 보이는 노드가 아닙니다. 이 구분이 설계의 전부입니다. request의 90%까지 찬 노드는 아무 문제가 아니고 아무 일도 일어나지 않습니다. 스케줄되지 못한 파드 하나는 문제이고 무슨 일이 일어납니다. 오토스케일러는 그 pending 파드를 들고 자기가 관리하는 노드 그룹마다 그 모양의 노드를 하나 더 넣으면 이 파드를 놓을 수 있는지 묻습니다. 놓을 수 있는 그룹이 있으면 밀린 파드를 해소할 만큼의 최소 개수로 그 그룹의 크기를 올립니다. 나머지는 클라우드 공급자가 하고, 1, 2분 뒤에 노드가 등록되고 스케줄러가 그것을 알아채고 파드가 놓입니다. 장면에서 그 두 사건은 기계가 나타나는 순간과 파드가 그 위에 올라서는 순간입니다.

조심해야 하는 쪽은 축소이고, 그래서 일부러 느립니다. 노드는 그 위에 얹힌 request의 합이 한동안 임계값 아래에 머물러야 후보가 되고, 그 위의 파드를 전부 다른 데로 옮길 수 있을 때에만 실제로 제거됩니다. 그것을 막는 파드는 흔하고 대개 이유가 있습니다. 다시 만들어 줄 컨트롤러가 없는 것, 로컬 스토리지를 쓰는 것, 옮기면 중단 예산을 어기게 되는 것, 운영자가 축출하면 안 된다고 표시해 둔 것이 그렇습니다. 노드가 실제로 나갈 때는 먼저 cordon 처리되어 새 파드 배치가 막히고, 수동 드레인이 지키는 것과 같은 예산을 거쳐 파드가 축출되고, 그다음에 기계가 반납됩니다. 장면은 그것을 비워지고 `drain` 표시가 붙었다가 사라지는 칸으로 그립니다.

이 페이지를 앞 페이지에 묶는 단어는 `requests`(요청값)입니다. 오토스케일러는 스케줄링을 흉내 내 보고, 스케줄링은 request를 읽습니다. 그러니 확보하는 용량은 파드가 무엇을 하는지가 아니라 파드에 적힌 숫자의 함수입니다. request를 부풀린 워크로드는 필요 없는 노드를 붙들고 있으면서 축소되지도 않습니다. 서류상으로는 모든 노드가 넉넉하게 차 있기 때문입니다. request가 모자란 워크로드는 잘 들어가는 것처럼 보여서 기계를 너무 적게 확보하고, 스케줄러가 여유 있다고 여긴 노드 위에서 스로틀링되거나 메모리 부족으로 죽는 파드로 진실을 알게 됩니다. 둘 다 오토스케일러의 버그로 보이지 않습니다. 둘 다 청구서나 장애로 보입니다.

이 장치가 얼마나 잘 도는지는 실무적인 두 가지가 정합니다. 하나는 노드 그룹의 모양입니다. 아주 큰 기계로만 이루어진 그룹은 확장의 최소 단위를 비싸게 만들고 축소의 최소 단위를 드물게 만듭니다. 작은 기계로만 이루어진 그룹은 노드마다 시스템 몫으로 나가는 비율이 커지고 노드당 파드 개수 한도에도 더 빨리 닿습니다. 대개는 모양이 다른 그룹을 두어 개 두고 오토스케일러가 고르게 합니다. 다른 하나는 기동 경로입니다. 노드를 하나 더하는 데는 초가 아니라 분이 걸립니다. 급증을 즉시 흡수해야 하는 워크로드에는 여유 용량이 필요하거나, 진짜 일이 밀어낼 수 있는 낮은 우선순위의 자리 지킴 파드가 필요합니다. 이미 값을 치른 용량을, 비켜 줄 무언가가 대신 잡고 있는 셈입니다.

장면 전체를 정직하게 요약하면 이렇습니다. 탄력성은 용량을 공짜로도 즉시로도 만들어 주지 않습니다. 청구서의 크기를 일의 크기에 대한 함수로 만들어 줄 뿐이고, 그것도 설계로 감당해야 하는 지연을 끼고서, 각 층이 서로에게 건네는 숫자가 참일 때에만 그렇습니다.
