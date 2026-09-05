---
title: "Elasticity"
summary: "탄력성은 수요를 따라가는 용량입니다. 부하가 오르면 레플리카가 늘고, request가 어긋난 파드는 크기가 조정되며, 그 아래 노드 풀도 맞춰 늘고 줄어듭니다. 언젠가 필요할지 모르는 것이 아니라 지금 도는 것에 값을 냅니다."
category: "컨테이너와 오케스트레이션"
scene: elasticity
steps:
  - title: "고정 용량은 하루에 두 번 실패합니다"
    text: "아침 피크에는 파드 셋이 허우적대고 사용자가 기다립니다. 새벽 3시에는 같은 셋이 놀고 있는데 요금은 계속 갑니다. 피크에 맞추면 밤이 낭비되고, 밤에 맞추면 아침이 무너집니다. 탄력성은 그 선택을 거부합니다. 용량이 수요를 추측하는 대신 따라갑니다."
  - title: "먼저 수평입니다. 같은 파드를 더 놓습니다"
    text: "수요가 오르고 CPU가 목표를 넘으면 오토스케일러가 레플리카 하나를 더합니다. 서비스 하나 뒤에 똑같은 파드가 하나 더 서서 몫을 나눕니다. 수요가 내리면 그 여분은 지연을 두고 제거됩니다. 성급한 축소는 모든 잔물결을 재시작 폭풍으로 만들기 때문입니다."
  - title: "파드 자체가 잘못된 크기라면 수직입니다"
    text: "1년 전에 적어 둔 request가 오늘의 부하와 만납니다. 한 파드는 너무 작은 상자 안에서 굶고, 다른 파드는 쓰는 양보다 훨씬 큰 상자에 앉아 있습니다. 수직 오토스케일러는 재시작이라는 대가를 치르고 그 값을 바로잡습니다."
  - title: "노드 풀도 탄력적입니다. 파드에는 설 자리가 필요합니다"
    text: "확장이 노드를 채우면 다음 파드는 pending이 되고, 클러스터 오토스케일러가 그 파드를 위해 기계를 더합니다. 수요가 물러가면 비워진 노드는 드레인되어 반납됩니다. 요금이 드디어 일을 따라갑니다. 언젠가 필요할지도 모르는 것이 아니라 지금 도는 것에 값을 냅니다."
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
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
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Scaling options for applications in AKS"
    url: https://learn.microsoft.com/en-us/azure/aks/concepts-scale
---

## 언제 쓰나

- 시간대나 이벤트에 따라 오르내리는 수요입니다. 하루 주기, 캠페인, 배치 창처럼 트래픽 그래프에 수평선이 아니라 모양이 있는 경우입니다.
- "혹시 몰라서" 남겨 둔 유휴 용량에 돈을 내고 있고, 그 "혹시"가 하루의 대부분인 경우입니다.
- 고정된 규모로는 흡수되지 않는 피크에서 지연 예산이 무너지는 경우입니다. 피크에 맞춰 사면 일주일에 몇 시간을 위해 사는 셈이 됩니다.
- 레플리카 개수나 리소스 request(요청값)를 마지막으로 들여다본 지 몇 달이 된 Kubernetes 워크로드입니다. 그 숫자들은 이미 달라진 워크로드에 맞던 값입니다.

## 주의점

- 탄력성에는 움직여 줄 신호가 필요합니다. 애플리케이션이 실제로 막히는 지점이 아닌 지표로 오토스케일링을 걸면 엉뚱한 것이 비싸게 늘어납니다. 데이터베이스를 기다리는 서비스에서는 CPU가 아무것도 말해 주지 않고, 이미 포화된 컨슈머 그룹의 큐에 레플리카를 더하면 연결만 늘어납니다.
- 확장 속도는 파드 기동 속도를 넘지 못합니다. 이미지 풀, JIT 워밍업, 캐시 예열이 전부 트래픽이 도착한 시점과 용량이 도착하는 시점 사이에 들어갑니다. 그 틈이 1분이면 5분짜리 피크는 파드가 준비되기 전에 절반이 지나갑니다. 이미지를 미리 받아 두고, 기동을 가볍게 유지하고, 그 틈을 메울 여유 용량을 남겨 둡니다.
- 수평 오토스케일러와 수직 오토스케일러를 같은 지표에 걸면 서로 싸웁니다. 역할을 나눕니다. 수평은 부하에, 수직은 크기 교정에 두거나, 수직 쪽은 권고 모드로 돌리고 배운 값을 사람이 반영하는 방법이 있습니다.
- 위험한 방향은 축소이고, 중단 예산은 여기서 도움이 되지 않습니다. 레플리카 수를 낮추면 컨트롤러가 파드를 삭제하는데, 이 삭제는 축출 API를 거치지 않으므로 예산을 한 번도 참조하지 않습니다. 예산이 제약하는 것은 노드 드레인이나 클러스터 축소에서 오는 축출입니다. 축소를 안전하게 만드는 것은 안정화 창과, 파드가 쥐고 있던 일을 끝내는 정상 종료입니다. 늘릴 때는 적극적이고 줄일 때는 참을성 있게 움직이는 것은 일관성이 없는 것이 아니라 그 자체가 요점입니다.
- 상태가 있는 워크로드는 다르게 늘어납니다. 스토리지는 무상태 파드처럼 곱해지지 않고, 샤드나 리스를 소유한 레플리카는 그냥 두 배로 만들 수 없습니다. 탄력성이 잘 맞는 층은 상태를 들고 있지 않은 쪽이고, 상태를 들고 있는 층에는 다른 계획이 필요합니다.
- 클러스터 오토스케일러는 사용량이 아니라 request를 보고 용량을 계획합니다. request가 어긋난 인스턴스 전체는 같은 방향으로 어긋난 노드 풀을 갖게 됩니다. 크기 교정이 용량 계획과 별개의 문제가 아니라 그 입력인 이유입니다.

## .NET에서는

일의 대부분은 매니페스트가 아니라 애플리케이션 쪽에 있습니다. 수평으로 늘어나는 서비스는 두 번째 사본이 필요로 할 만한 것을 로컬에 들고 있지 않아야 하고, 멈추라는 말을 들으면 쥐고 있던 일을 마무리해야 하고, 실제로 응답할 수 있을 때까지는 스스로를 준비되지 않았다고 보고해야 합니다.

```csharp
var builder = WebApplication.CreateBuilder(args);

// 공유 상태는 파드 바깥에 둡니다. 그래야 어떤 레플리카든 어떤 요청이든 받습니다.
// 이 호출은 `IDistributedCache`를 등록합니다. 세션 상태에는 `AddSession`이 더 필요합니다.
builder.Services.AddStackExchangeRedisCache(options =>
    options.Configuration = builder.Configuration.GetConnectionString("Redis"));

// readiness가 트래픽을 통제합니다. 응답할 수 없는데 준비되었다고 보고하는 파드는
// 급증을 더 나쁘게 만듭니다. 로드 밸런서가 몫을 보내고 그 몫이 실패하기 때문입니다.
builder.Services.AddHealthChecks()
    .AddCheck<WarmupHealthCheck>("warmup", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});

// 축소는 축출입니다. 프로세스가 떠나기 전에 손에 든 일을 끝냅니다.
var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() => Drain.Begin());
app.Run();
```

HTTP가 아니라 큐가 몰고 가는 작업이라면 KEDA가 큐 길이나 컨슈머 지연을 직접 보고 스케일합니다. 워커가 뒤처질 때 실제로 움직이는 신호가 그것입니다. 배치 사이에는 0까지 줄일 수도 있는데, CPU 기반 규칙으로는 할 수 없는 일입니다. 할 일이 없는 워커는 어느 쪽이든 CPU를 쓰지 않기 때문입니다.
