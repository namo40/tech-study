---
title: "Readiness Probe"
summary: "readiness probe는 몇 초마다 한 가지를 묻습니다. 지금 이 인스턴스가 트래픽을 받아도 되는가. 실패하면 pod는 조용히 회전에서 빠지고, 통과하면 트래픽이 돌아옵니다. liveness는 더 가혹한 질문, 즉 이 프로세스가 계속 존재해도 되는지를 묻고 재시작으로 답합니다."
category: "컨테이너와 오케스트레이션"
scene: readiness-probe
steps:
  - title: "질문 두 개, 답 두 개"
    text: "readiness는 지금 이 인스턴스가 트래픽을 받아도 되는지 묻습니다. liveness는 이 프로세스가 계속 살아 있어도 되는지 묻습니다. 막 시작한 pod는 readiness에 실패해 아무것도 받지 않다가, 준비되는 순간 회전에 합류합니다."
  - title: "not ready는 조용한 퇴장입니다"
    text: "의존 서비스가 잠깐 흔들리면 readiness가 세 번 실패하고, pod는 endpoints에서 빠집니다. 무엇도 죽지 않습니다. 트래픽이 그 옆으로 흘러갈 뿐입니다. 프로브가 다시 통과하면 트래픽은 떠날 때만큼 조용히 돌아옵니다."
  - title: "liveness의 답은 재시작입니다"
    text: "멈춰 버린 프로세스는 아무것도 통과시키지 못하므로 kubelet이 컨테이너를 죽이고 다시 시작합니다. 카운터가 올라가고, readiness가 새 출발을 지키고, pod가 정말 준비될 때까지 트래픽은 기다립니다. 재시작은 멈춘 것의 처방이지 바쁜 것의 처방이 아닙니다."
  - title: "liveness는 자신을, readiness는 의존성을 봅니다"
    text: "liveness가 데이터베이스를 확인하게 하면 한 번의 흔들림에 모든 pod가 동시에 재시작합니다. 스스로 만든 장애입니다. 제대로 나누면 같은 흔들림은 pod를 회전에서 빼기만 하고, 의존성이 돌아오는 순간 pod도 돌아옵니다."
related:
  - label: Health Check
    slug: health-check
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

## 언제 쓰나

- 라우터 뒤에 놓이는 모든 배포에 씁니다. 롤아웃, 스케일 아웃, 복구는 모두 새것이 나타나는 상황이고, 트래픽이 너무 일찍 도착하지 않는 이유는 프로브가 아직 통과하지 않았기 때문입니다.
- 인스턴스에 예열 작업이 있을 때 씁니다. 설정을 읽고, 캐시를 채우고, 커넥션 풀을 열고, 시작할 때 마이그레이션을 도는 일은 모두 첫 요청보다 앞서야 합니다. readiness는 프로세스가 그 사실을 알리는 방법입니다.
- 인스턴스가 고장 나지 않은 채로 잠시 서비스할 수 없는 곳에 씁니다. 의존성을 기다리는 pod, 부하를 흘려보내는 pod, 멈추라는 말을 듣고 남은 요청을 비우는 pod는 모두 죽는 것이 아니라 건너뛰어지기를 원합니다.
- ready 개수를 replica 개수와 나란히 보고, 그 옆에서 재시작 카운터를 봅니다. ready 개수가 내려가는 동안 재시작이 올라간다면 대개 함대가 아픈 것이 아니라 프로브가 엉뚱한 곳을 보고 있다는 뜻입니다.

## 주의점

- readiness는 의존성을 확인해도 되지만, liveness는 프로세스 자신만 확인해야 합니다. 데이터베이스까지 손을 뻗는 liveness probe는 느린 쿼리 하나를 함대 전체의 재시작으로 바꾸고, 그 재시작이 데이터베이스를 더 느리게 만듭니다.
- initial delay와 period, failureThreshold를 애플리케이션의 실제 예열 시간에 맞춥니다. 지켜보는 프로세스보다 엄격한 프로브는 몇 초마다 endpoints를 드나드는 파닥거림을 만드는데, 호출하는 쪽에는 아예 빠져 있는 것보다 나쁩니다.
- 임계값의 대가를 기억합니다. 주기 2초에서 세 번 거절은, 이미 서비스할 수 없다는 것을 스스로 아는 인스턴스로 6초 동안 트래픽을 보낸다는 뜻입니다. 임계값은 반응을 늦추는 대신 표본 하나의 실수에 흔들리지 않는 성질을 삽니다. 기본값을 그대로 두었다가 놀라지 말고 의도해서 고릅니다.
- 부하가 걸릴 때 실패하는 readiness 검사는 함대가 온전해야 할 바로 그 순간에 함대를 줄입니다. 검사가 지연 시간이나 큐 길이를 재면 바쁜 인스턴스가 스스로 빠지고, 그 몫이 이웃으로 옮겨 가고, 이웃도 차례로 빠집니다. 프로브를 느슨하게 하는 대신 부하 차단과 동시성 제한을 함께 둡니다.
- 느리게 뜨는 프로세스에는 liveness를 부팅 시간까지 늘이지 말고 startup probe를 씁니다. 2분짜리 시작을 견딜 만큼 넉넉한 liveness probe는 멈춰 버린 프로세스를 2분 동안 그대로 두기에도 넉넉합니다.
- 종료가 시작되면 readiness를 곧바로 실패시킵니다. endpoints에서 인스턴스를 빼는 일은 즉시 끝나지 않으므로, ready 보고를 멈추는 순간에 요청도 함께 거절하기 시작하는 pod는 아주 조금 전에 라우팅된 요청을 거절하게 됩니다.
- 엔드포인트는 클러스터 안에서 인증 없이 가볍게 두고, 공개 라우터에는 올리지 않습니다. 모든 인스턴스에서 초당 몇 번씩 도는 검사이므로, 비싼 것을 조회하는 검사는 건강이라는 이름을 단 부하 생성기입니다.

## .NET에서는

ASP.NET Core에는 이 구분이 이미 들어 있습니다. 검사에 태그를 달아 등록한 다음 그 태그로 걸러 내는 엔드포인트를 두 개 매핑하면, readiness 경로는 의존성을 확인하고 liveness 경로는 프로세스만으로 답합니다.

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddCheck<OrdersDbHealthCheck>("orders-db", tags: ["ready"])
    .AddCheck<CacheWarmHealthCheck>("cache-warm", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Tags.Contains("live") });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

매니페스트는 그 경로와 맞아야 하고, 거기 적히는 숫자가 바로 장면이 보여 주는 값입니다. 첫 질문까지 얼마나 기다리는지, 얼마나 자주 묻는지, 연속 몇 번의 거절에 kubelet이 움직이는지입니다.

```yaml
readinessProbe:
  httpGet: { path: /healthz/ready, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 2
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /healthz/live, port: 8080 }   # the process only
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet: { path: /healthz/live, port: 8080 }
  periodSeconds: 5
  failureThreshold: 30                           # up to 150s to boot
```

마지막 조각은 종료입니다. `ApplicationStopping`이 발생하는 순간 not-ready를 보고하면, 남은 요청이 끝나는 동안 endpoints 변경이 이미 퍼져 나갑니다. 그리고 호스트의 종료 타임아웃은 플랫폼의 유예 시간 안에 둡니다.

```csharp
// One flag, set by the lifetime and read by readiness, is the whole handshake.
builder.Services.AddSingleton<ShutdownState>();
builder.Services.AddHealthChecks()
    .AddCheck<ShutdownState>("not-shutting-down", tags: ["ready"]);

app.Lifetime.ApplicationStopping.Register(
    () => app.Services.GetRequiredService<ShutdownState>().Stopping = true);
```

HTTP 표면이 없는 워커에도 같은 발상이 통합니다. 프로세스가 남기는 표식을 확인하는 명령을 `exec`으로 돌리거나, 준비된 뒤에만 여는 리스너를 `tcpSocket`으로 두면 됩니다. 검사의 모양보다 두 질문 중 어느 쪽에 답하고 있는지가 훨씬 중요합니다.
