---
title: "Vertical Pod Autoscaler"
summary: "Vertical Pod Autoscaler는 컨테이너가 실제로 쓰는 양을 보고 CPU와 메모리 요청값을 거기에 맞춰 다시 씁니다. 정확도의 값은 재시작이고, 그렇게 얻은 정직한 숫자가 스케줄러와 클러스터 오토스케일러가 계획을 세우는 근거가 됩니다."
category: "컨테이너와 오케스트레이션"
scene: elasticity
sceneStep: 3
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
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
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "Vertical Pod Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
---

장면의 세 번째 단계에서 바뀌지 않는 것을 보세요. 캡슐의 개수입니다. 대신 둘의 모양이 바뀝니다. 하나는 내내 낮게 그려져 있었습니다. 받은 상자가 지금 하는 일보다 작기 때문입니다. 다른 하나는 내내 높게 그려져 있었습니다. 한 번도 건드려 본 적 없는 만큼의 여유를 받았기 때문입니다. 둘은 같은 결함을 양쪽 끝에서 본 것이고, 어느 쪽도 파드를 하나 더 붙인다고 해결되지 않습니다.

요청값은 두 방향의 약속입니다. 스케줄러에게는 이 컨테이너를 위해 노드를 얼마나 비워 두라고 말하고, kubelet에게는 노드가 바쁠 때 이 컨테이너가 CPU를 얼마나 가질 자격이 있는지를 말합니다. 그 약속이 현실과 맞는지는 아무도 확인하지 않습니다. 1년 전에 매니페스트에 적어 넣은 숫자는 그 뒤의 모든 배포를 그대로 통과하고, 그 아래의 워크로드는 계속 흘러갑니다. 직렬화기가 바뀌고, 페이로드가 커지고, 캐시가 자라고, 의존하던 곳이 빨라집니다. 수직 오토스케일러는 그 고리를 닫는 조각입니다. 워크로드에 속한 컨테이너들의 실제 사용 이력을 읽고, 최근 5분이 아니라 분포에서 권고값을 계산하고, 그것을 반영할 수도 있습니다.

값이 비싼 쪽은 반영입니다. 쿠버네티스의 역사 대부분 동안 파드의 리소스는 일단 승인되고 나면 바꿀 수 없었습니다. 그래서 요청값을 바꾼다는 것은 파드를 퇴거시키고 컨트롤러가 새 숫자로 대체 파드를 만들게 한다는 뜻이었습니다. 장면이 교정에 재시작이라는 값을 매기는 이유입니다. 캡슐이 내려갔다가 돌아오고, 돌아올 때 맞는 크기가 됩니다. 그 뒤로 제자리 크기 조정이 들어와 많은 경우 재시작을 없애 주지만, 어디서나 되는 것은 아닙니다. 조정 정책과 리소스 종류와 컨테이너 런타임에 따라 달라집니다. 퇴거를 전제로 계획하고, 제자리 조정은 가정이 아니라 개선으로 다루세요.

권고값은 아무것도 반영하지 않더라도 가질 만한 가치가 있습니다. 갱신 모드를 `Off`로 두고 돌리면 권고 오브젝트만 만들고 아무것도 바꾸지 않습니다. 측정 도구가 되는 셈입니다. 지난 한 주 동안 컨테이너별 메모리의 90 백분위수가 실제로 얼마였는지 알려 줍니다. 요청값의 절반이 필요한 양의 두 배이고 몇 개는 위험할 만큼 모자란다는 사실을 이때 처음 발견하는 팀이 많습니다. 믿을 만한 컨트롤러이기 이전에 읽을 만한 보고서입니다.

나머지보다 더 중요한 주의점이 둘 있습니다. 첫째, 수직 오토스케일러와 수평 오토스케일러를 같은 신호에 걸면 안 됩니다. 한쪽은 CPU가 높다고 복제본을 더하고 다른 쪽은 사용량이 높다고 CPU 요청값을 올린다면, 둘 다 같은 숫자에 반응하면서 서로의 입력을 바꾸는 셈입니다. 흔한 분담은 수평을 CPU나 별도의 부하 지표에, 수직을 메모리에만 두거나, 수직을 권고 모드로 돌리는 것입니다. 둘째, 퇴거는 다른 중단과 똑같은 중단입니다. 복제본이 하나뿐이고 중단 예산도 없는 워크로드는 요청값이 교정되는 순간 그냥 잠깐 사라집니다. 그러니 교정도 드레인과 같은 보호 뒤에 두어야 합니다.

이것이 각주가 아니라 가운데 단계인 이유는 자막의 마지막 문장에 있습니다. 다른 모든 층은 요청값을 보고 계획합니다. 스케줄러는 사용량이 아니라 요청값으로 노드에 무엇이 들어가는지 정하고, 클러스터 오토스케일러는 사용량이 아니라 요청값으로 기계를 몇 대 살지 정합니다. 요청값이 부풀려진 워크로드는 필요 없는 기계를 사고, 요청값이 모자란 워크로드는 여유 있어 보이던 노드 위에서 조여지거나 죽는 파드를 갖게 됩니다. 크기 교정은 정리정돈이 아닙니다. 나머지 두 오토스케일러가 계산에 쓰는 입력입니다.
