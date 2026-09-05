---
title: "Health-Based Routing"
summary: "헬스 기반 라우팅은 probe 결과와 실제로 넘긴 요청이 어떻게 끝났는지를 보고 로드 밸런서가 어떤 목적지가 아직 살아 있는지 판단하는 일입니다. 죽은 기계를 실패한 요청의 몫이 아니라 짧아진 순환으로 바꿔 줍니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: load-balancer
sceneStep: 3
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Health Check
    slug: health-check
  - label: Readiness Probe
    slug: readiness-probe
  - label: Liveness Probe
    slug: liveness-probe
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: YARP
    slug: yarp
references:
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
  - title: Health checks in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks?view=aspnetcore-10.0
  - title: Configure liveness, readiness and startup probes
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
---

## 언제 쓰나

- 구성원이 둘 이상인 풀 전부, 그러니까 사실상 모든 풀입니다. 헬스 체크 없는 로드 밸런서는 아무도 알아채지 못하는 동안 망가진 인스턴스 하나를 실패 요청의 고정 비율로 바꿔 놓습니다.
- 롤링 배포. 인스턴스를 멈추기 전에 순환에서 먼저 빼고, 정말 응답할 수 있게 된 다음에야 다시 넣어야 합니다.
- 스스로 실패할 수 있는 의존성이 있을 때. 데이터베이스 연결이 끊긴 인스턴스는 살아는 있지만 응답할 수 없고, 그 차이는 데이터베이스까지 확인하는 readiness 체크만 알 수 있습니다.

## 주의점

- 능동 체크는 일정에 따라 probe를 보내고, 수동(passive) 체크는 실제 트래픽의 결과를 읽습니다. 능동 체크는 한가한 인스턴스가 죽는 것을 알아채고, 수동 체크는 probe 엔드포인트로는 재현되지 않는 실패를 알아챕니다. 가능하면 둘 다 돌립니다.
- 임계치와 주기는 하나의 결정입니다. 1초 간격으로 연속 2회라면 죽은 인스턴스로 가는 요청이 최대 2초 동안 생기고, 장면의 3단계가 그리는 것이 정확히 그 틈입니다. 주기를 줄이면 틈이 좁아지고 probe 비용이 늘어납니다.
- 한 번의 실패는 잡음입니다. probe 한 번에 반응하면 순환이 출렁이고, 출렁이는 순환은 어느 인스턴스도 예열될 틈이 없을 만큼 빠르게 부하를 옮깁니다.
- 포트가 아니라 애플리케이션을 확인합니다. TCP 연결 테스트는 무언가가 듣고 있다는 것만 증명하고, 무조건 200을 돌려주는 `/healthz`는 그보다도 못한 것을 증명합니다.
- liveness와 readiness는 분리합니다. readiness는 "트래픽을 받아도 되는가"에, liveness는 "재시작해야 하는가"에 답합니다. 의존성 확인을 liveness에 넣으면 데이터베이스 장애가 전 서버의 재시작 루프로 번집니다.
- readiness 체크를 먼저 실패시키는 것은 깔끔한 종료의 시작이기도 합니다. 새 일을 그만 받고, 들고 있는 것을 마치고, 그다음에 나갑니다.

## .NET에서는

로드 밸런서 쪽 절반은 연속 실패 정책을 쓰는 능동 체크이고, 애플리케이션 쪽 절반은 의존성까지 답하는 readiness 엔드포인트입니다. 어느 한쪽만으로는 쓸모가 없습니다.

```csharp
// 밸런서: /healthz/ready를 1초에 한 번 찔러 보고, 두 번 실패하면 뺍니다.
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HealthCheck = new HealthCheckConfig
            {
                Active = new ActiveHealthCheckConfig
                {
                    Enabled = true,
                    Interval = TimeSpan.FromSeconds(1),
                    Timeout = TimeSpan.FromSeconds(1),
                    Policy = HealthCheckConstants.ActivePolicy.ConsecutiveFailures,
                    Path = "/healthz/ready",
                },
                Passive = new PassiveHealthCheckConfig
                {
                    Enabled = true,
                    Policy = HealthCheckConstants.PassivePolicy.TransportFailureRate,
                    ReactivationPeriod = TimeSpan.FromSeconds(10),
                },
            },
            Metadata = new Dictionary<string, string> { ["ConsecutiveFailuresHealthPolicy.Threshold"] = "2" },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
            },
        },
    ]);
```

```csharp
// 애플리케이션: liveness는 의존성에 관해 아무 말도 하지 않고, readiness는 전부 말합니다.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`Predicate = _ => false`가 liveness 엔드포인트의 핵심입니다. 아무 체크도 돌리지 않으므로 프로세스가 무엇이든 답할 수 있는 동안에는 200을 돌려주고, 데이터베이스 장애가 전 서버를 재시작시키는 일이 없습니다. Kubernetes도 같은 두 엔드포인트를 `readinessProbe`와 `livenessProbe`로 읽으며, `failureThreshold`와 `periodSeconds`가 위의 임계치와 주기 역할을 합니다. 그 앞에 `startupProbe`를 두면 느리게 뜨는 인스턴스가 예열을 마치기 전에 죽는 일도 막을 수 있습니다.
