---
title: "Horizontal Pod Autoscaler"
summary: "Horizontal Pod Autoscaler는 지표 하나와 목표값 하나로 워크로드의 레플리카 개수를 바꿉니다. 계산은 desired = ceil(현재 개수 × 실제값 / 목표값)입니다. 일이 벌어진 뒤에 반응하고, 새 파드가 준비되기까지 시간이 걸리며, 보고 있는 지표만큼만 정확합니다."
category: "컨테이너와 오케스트레이션"
scene: horizontal-pod-autoscaler
steps:
  - title: "정상"
    text: "파드 둘이 목표 60%에 대해 CPU 35%로 돕니다. 15초마다 오토스케일러가 원하는 개수를 다시 계산하고 같은 답을 얻습니다. 둘입니다. 아무것도 바뀌지 않는 것이 바로 의도입니다."
  - title: "급증"
    text: "트래픽이 세 배가 되자 파드 둘이 포화됩니다. 오토스케일러는 다음 주기에 넷을 요청합니다. 새 파드가 뜨는 데 걸리는 30초 동안 기존 둘이 전부 감당하고, 요청 한둘이 거절됩니다. 그 틈을 메우는 것이 여유 용량입니다."
  - title: "줄일 때는 천천히"
    text: "트래픽이 줄면 계산은 다시 둘을 말하지만, 오토스케일러는 안정화 창이 지나기를 기다린 뒤에 파드를 제거합니다. 그 사이의 짧은 급증이 오르락내리락을 만들지 않게 하려는 것입니다. 늘릴 때는 적극적으로, 줄일 때는 참을성 있게 움직입니다."
  - title: "맞는 지표"
    text: "일이 이제 I/O 대기 위주가 됩니다. CPU는 request의 30%에 머물러 아무것도 요구하지 않는데, 큐는 자기 한도를 향해 자랍니다. 오토스케일러가 큐를 보게 하자 드디어 넷을 말합니다. 새 파드가 준비될 때까지 요청은 버려집니다."
related:
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Resource Limit
    slug: resource-limit
  - label: Readiness Probe
    slug: readiness-probe
  - label: Horizontal Scaling
    slug: horizontal-scaling
  - label: Elasticity
    slug: elasticity
  - label: Load Balancer
    slug: load-balancer
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "HorizontalPodAutoscaler walkthrough"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
---

## 언제 쓰나

- 하루 사이에 부하가 오르내리는 무상태 워크로드. 웹과 API 파드, 컨슈머, 백그라운드 워커가 모두 해당합니다.
- 레플리카를 늘리는 것이 실제로 처리 용량을 늘려 줄 때. 뒤에 있는 데이터베이스, 캐시, 브로커가 늘어난 연결을 받아 줄 여유가 있어야 성립합니다.
- "너무 바쁘다"를 뜻하는 숫자를 지목해 내보낼 수 있을 때. 오토스케일러는 제어기이고, 제어기에는 사용자가 알아채기 전에 움직이는 신호가 필요합니다.

## 주의점

- 확장은 사후 반응이고 파드가 준비되기까지는 시간이 걸립니다. 부하가 도착한 시점과 용량이 도착한 시점 사이의 틈은 여유 용량으로 메우므로, 여기서는 영리한 정책보다 낮은 목표값과 빠른 기동이 더 값어치를 합니다.
- resource request를 설정합니다. CPU 사용률은 노드가 아니라 request에 대한 백분율이고, request가 없는 파드는 오토스케일러가 나눌 분모 자체를 주지 못합니다.
- readiness probe가 새 파드로 가는 트래픽을 막아 줍니다. 실제로 처리할 수 있기 전에 준비됐다고 답하는 파드는 급증을 더 나쁘게 만듭니다. 로드 밸런서가 몫을 보내는데 그것을 실패시키기 때문입니다.
- 줄일 때는 안정화 창을 두고, 늘릴 때는 두지 않습니다. 파드를 빼는 일은 미뤄도 손해가 적고 잘못하면 비싸며, 잠깐의 소강이 같은 레플리카를 뺐다 넣었다 하는 순환으로 번지지 않게 막아 주는 것이 이 창입니다.
- I/O 대기나 큐가 이끄는 일에는 CPU가 틀린 지표입니다. 처리 중 요청 수, 큐 깊이나 큐 대기 시간, 컨슈머 지연, p95 지연은 모두 CPU가 가만히 있을 때도 움직이고, 모두 custom metric이나 external metric으로 쓸 수 있습니다.
- `max`를 올리기 전에 뒤쪽 사슬을 먼저 확인합니다. 파드 열여섯 개가 연결을 열 개씩 들면 백육십 개인데, 데이터베이스는 백 개로 설정돼 있을 수 있습니다.
- 일이 고르지 않다면 파드 두 개가 곧 파드 두 개만큼의 처리 용량은 아닙니다. 확장이 평균에 무엇을 했는지만 보지 말고 꼬리에 무엇을 했는지를 봅니다.

## .NET에서는

정책이 사는 곳은 매니페스트입니다. 아래 `behavior` 블록은 Kubernetes가 기본으로 이미 하는 일(내려갈 때는 5분 안정화 창, 올라갈 때는 없음)을 적어 둔 것으로, 비대칭이 눈에 보이도록 한 번 명시해 둘 가치가 있습니다. 진짜로 필요해지는 때는 다른 창이 필요하거나, 1분에 파드 하나만 빼도록 허용하는 식으로 속도를 제한하는 `policies`가 필요할 때입니다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: orders-worker }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders-worker }
  minReplicas: 2
  maxReplicas: 8
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300 }
    scaleUp:   { stabilizationWindowSeconds: 0 }
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 60 } }
    - type: Pods
      pods:
        metric: { name: orders_queue_depth }
        target: { type: AverageValue, averageValue: "100" }
```

두 번째 지표는 애플리케이션이 내보내기 때문에 존재합니다. Prometheus exporter로 읽히는 `ObservableGauge` 하나와, 스크레이프 결과를 custom metric으로 바꿔 주는 클러스터 쪽 어댑터 하나가 배관의 전부입니다. exporter는 `OpenTelemetry.Exporter.Prometheus.AspNetCore`인데 안정 버전이 나온 적이 없습니다. 프리릴리스 의존성이 허용되지 않는 곳에서는 대신 OTLP로 collector에 내보내고 collector가 스크레이프 엔드포인트를 노출하게 합니다.

```csharp
// 애플리케이션이 오토스케일러가 기준으로 삼는 숫자를 내보냅니다.
private static readonly Meter Meter = new("Shop.Orders");
private static readonly ObservableGauge<long> QueueDepth =
    Meter.CreateObservableGauge("orders_queue_depth", () => queue.ApproximateDepth);

builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("Shop.Orders").AddPrometheusExporter());
app.MapPrometheusScrapingEndpoint();          // /metrics
```

Deployment의 두 줄이 오토스케일러 자체만큼 중요합니다. `resources.requests.cpu`는 CPU 퍼센트가 기준으로 삼는 분모이고, readiness probe는 파드가 처리할 수 있게 될 때까지 트래픽을 붙들어 두는 장치입니다. 앞의 것이 없으면 계산식에 쓸 값이 없고, 뒤의 것이 없으면 새 파드가 아직 쓸모없는 상태로 순환에 합류합니다. 하필 부하가 가장 높은 순간에 말입니다.
