---
title: "Rolling Update"
summary: "롤링 업데이트는 파드를 한 묶음씩 교체합니다. 새 파드가 뜨고, readiness probe를 통과하고, 트래픽을 받기 시작한 다음에야 옛 파드 하나가 멈추라는 말을 듣고 남은 요청을 비웁니다. 두 버전이 나란히 돌 수 있다면 아무도 눈치채지 못합니다."
category: "컨테이너와 오케스트레이션"
scene: rolling-update
steps:
  - title: "하나씩"
    text: "새 파드가 뜨고, readiness를 통과하고, endpoints에 들어간 다음에야 옛 파드 하나가 멈추라는 말을 듣습니다. 개수는 넷 아래로 내려가지 않아 트래픽은 눈치채지 못합니다. 잠시 동안은 두 버전이 함께 일합니다."
  - title: "readiness가 관문입니다"
    text: "새 버전이 probe에 실패하면 endpoints에 들어가지 못하고 요청을 한 번도 받지 않습니다. 롤아웃은 옛 파드가 계속 일하는 채로 멈추고, 되돌리는 것은 명령 하나입니다. 그러면 같은 컨트롤러가 파드를 하나씩 되돌려 놓습니다."
  - title: "비운 뒤에 나갑니다"
    text: "고친 빌드가 다시 롤아웃되고, 그 파드가 준비되면 옛 파드 하나가 멈추라는 말을 듣습니다. 종료 중인 파드는 endpoints에서 빠지지만 잠깐 걸리므로, 잠시 더 받아 주고 이미 받은 것을 끝냅니다. SIGTERM은 요청이지 강제 종료가 아닙니다."
  - title: "두 버전, 데이터베이스 하나"
    text: "롤아웃 동안 옛 파드와 새 파드는 스키마와 API를 공유합니다. 도중에 시도한 이름 바꾸기는 아직 도는 버전을 깨뜨려 되돌려집니다. 대신 확장합니다. 컬럼을 추가하고 옛 컬럼을 남긴 뒤, 모든 파드가 새 버전이 된 다음에야 축소합니다."
related:
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Load Balancer
    slug: load-balancer
  - label: Sticky Session
    slug: sticky-session
  - label: Replication Lag
    slug: replication-lag
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## 언제 쓰나

- 상태를 들고 있지 않은 서비스의 기본 배포 전략으로 씁니다. Kubernetes뿐 아니라 프로세스를 여러 벌 돌리는 대부분의 플랫폼에서 그렇습니다.
- 두 버전이 동시에 도는 것을 감당할 수 있을 때 씁니다. 감당할 수 없다면 블루-그린이 대안인데, 그쪽도 데이터 계층의 호환성은 똑같이 필요합니다.
- 레플리카가 서로 바꿔 쓸 수 있을 때 씁니다. 롤링 업데이트는 어느 파드든 어느 요청이든 답할 수 있다고 전제하므로, 한 인스턴스에 묶인 것은 먼저 메모리 밖으로 옮겨 두어야 합니다.

## 주의점

- readiness probe는 뜰 수 있는지가 아니라 일할 수 있는지를 나타내야 합니다. 의존 대상에 아직 닿지 못하고 캐시도 데워지지 않았는데 통과하는 probe는 트래픽을 실패로 밀어 넣습니다. 그리고 그 실패는 하필 전체의 절반이 새 파드인 때에 도착합니다.
- SIGTERM을 처리합니다. 새 일감 받기를 멈추고, 처리 중인 것을 끝내고, 유예 시간이 다하기 전에 나갑니다. 호스트 종료 타임아웃은 `terminationGracePeriodSeconds`보다 위가 아니라 아래에 두어야 합니다. 그러지 않으면 프로세스가 요청 처리 도중에 죽습니다.
- pre-stop 지연을 짧게 넣습니다. 파드를 endpoints에서 빼는 일은 즉시 끝나지 않으므로, SIGTERM이 오자마자 리스너를 닫으면 조금 전에 배정된 요청을 거절하게 됩니다.
- 스키마와 API 변경은 한 버전 차이만큼은 호환되게 만듭니다. 지우기 전에 더하고, 두 모양을 모두 다루는 코드를 배포하고, 그다음에야 옛 모양을 치웁니다.
- 진행 기한을 정하고 리비전 이력을 남깁니다. 그것이 없으면 끝내 준비되지 않는 롤아웃이 그대로 멈춰 있고, 해결책은 아무도 실행해 본 적 없는 명령이 됩니다.
- surge가 파드 뒤쪽에 무엇을 하는지 봅니다. `maxSurge`는 잠시나마 레플리카 하나만큼의 연결을 데이터베이스와 브로커에 더합니다. 파드 넷을 기준으로 잡은 풀은 다섯을 기준으로 잡은 풀이 아닙니다.
- 오래 붙어 있는 연결은 요청처럼 비워지지 않습니다. WebSocket이나 gRPC 스트림은 설계상 유예 시간을 넘겨서 살아 있으므로, 기다릴 것이 아니라 클라이언트에게 다시 연결하라고 알려야 합니다.

## .NET에서는

동작의 대부분은 매니페스트에 들어 있습니다. `maxUnavailable: 0`이 용량을 평평하게 유지하고, readiness probe가 새 파드에서 트래픽을 막아 주며, pre-stop의 sleep이 파드가 멈추라는 말을 듣는 시점과 endpoints 변경이 라우팅하는 쪽에 닿는 시점 사이의 틈을 메웁니다.

```yaml
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  progressDeadlineSeconds: 300
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          readinessProbe: { httpGet: { path: /healthz/ready, port: 8080 }, periodSeconds: 5 }
          lifecycle:
            preStop: { exec: { command: ["sh", "-c", "sleep 5"] } }   # endpoints가 퍼질 시간을 줍니다
```

애플리케이션 쪽 몫은 보기보다 작습니다. 종료가 시작되자마자 not-ready로 보고합니다. 파드를 직접 프로브하는 라우터를 위해서입니다. Kubernetes에서는 endpoints 변경이 삭제 시점에 이미 시작되었고 preStop의 sleep이 그 전파를 덮어 줍니다. 종료 타임아웃은 유예 시간 안쪽에 둡니다.

```csharp
// 종료가 시작되자마자 준비되지 않았다고 보고하고, 그다음 진행 중인 일을 마칩니다.
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(20));
builder.Services.AddHealthChecks()
    .AddCheck("shutting-down", () => lifetimeState.IsStopping
        ? HealthCheckResult.Unhealthy("shutting down")
        : HealthCheckResult.Healthy(), tags: ["ready"]);

var app = builder.Build();
app.Lifetime.ApplicationStopping.Register(() => lifetimeState.IsStopping = true);
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

매니페스트가 손대지 못하는 부분이 데이터입니다. EF Core 마이그레이션을 확장 배포와 축소 배포로 나누고 그 사이에 릴리스를 하나 넣습니다. 컬럼을 nullable로 추가하고, 양쪽에 쓰고, 과거 데이터를 채우고, 읽기를 옮긴 다음에야 옛 컬럼을 지웁니다. 한 번에 이름을 바꾸는 마이그레이션은 아직 옛 코드로 도는 파드를 깨뜨리는 마이그레이션이고, 롤링 업데이트 중에는 그런 파드가 절반입니다.

오래 붙어 있는 연결에는 따로 답이 필요합니다. SignalR과 gRPC 스트림은 유예 시간보다 오래 살아남으므로, `ApplicationStopping` 핸들러를 등록해 의도적으로 닫고 클라이언트에게 다시 연결하라고 알립니다. 기한이 지나 플랫폼이 끊어 버리게 두는 것보다 낫습니다.
