---
title: "Load Balancer"
summary: "로드 밸런서는 요청을 여러 서버에 나눠 보냅니다. 다음 요청을 누가 받을지는 정책이 정하는데, 요청 비용이 고른 곳에서는 라운드 로빈, 그렇지 않은 곳에서는 least connections를 쓰고, 어느 쪽이든 헬스 체크를 통과한 서버에만 보냅니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: load-balancer
steps:
  - title: "라운드 로빈"
    text: "요청이 차례대로 다음 서버에 갑니다. 요청마다 비용이 비슷하다면 이것만으로 충분합니다."
  - title: "고르지 않은 일"
    text: "라운드 로빈은 Server 2가 아직 느린 요청 셋을 붙들고 있다는 것을 모르고 계속 보냅니다. least connections는 처리 중인 수를 보고 여유 있는 곳으로 다음 요청을 보냅니다."
  - title: "헬스 체크"
    text: "probe가 두 번 실패하면 서버를 순환에서 빼고, 두 번 성공하면 되돌립니다. 고장과 두 번째 probe 사이에는 요청 둘이 여전히 실패하므로 probe 주기가 중요합니다."
  - title: "스케일아웃"
    text: "새 서버는 probe를 통과하면 합류하고, 캐시와 JIT가 데워지는 동안 받는 트래픽 비율이 서서히 늘어납니다. 어느 서버든 어느 요청이든 답할 수 있어야 가능한 일이라, 한 서버에만 있는 상태가 없어야 합니다."
related:
  - label: Round Robin
    slug: round-robin
  - label: Weighted Round Robin
    slug: weighted-round-robin
  - label: Least Connections
    slug: least-connections
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Health Check
    slug: health-check
  - label: Layer 4 Load Balancing
    slug: layer-4-load-balancing
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: Service Discovery
    slug: service-discovery
  - label: Sticky Session
    slug: sticky-session
  - label: Readiness Probe
    slug: readiness-probe
references:
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: YARP destination health checks
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/dests-health-checks
---

## 언제 쓰나

- 요청에 답하는 것이 둘 이상 있을 때. 웹 서버, HTTP API, gRPC 서비스 모두 해당합니다.
- 무중단 배포와 확장. 둘 다 인스턴스가 아무도 모르게 들어오고 나갈 수 있어야 성립하는데, 그것을 가능하게 하는 것이 로드 밸런서입니다.
- 기계 한 대가 죽어도 트래픽이 살아남아야 할 때. 망가진 인스턴스를 순환에서 빼는 것만으로 복구가 끝나는 구조를 만들 수 있습니다.

## 주의점

- 라운드 로빈은 일이 고르다고 가정합니다. 오래 유지되는 연결이나 느린 엔드포인트가 있다면 least connections나 power of two choices를 씁니다. 이미 바쁜 서버에도 순번은 똑같이 돌아오기 때문입니다.
- 헬스 체크는 포트가 아니라 애플리케이션을 확인해야 합니다. 트래픽을 받는 데 필요한 의존성까지 확인하는 readiness 엔드포인트가 정직한 신호이고, probe 주기가 장애 지속 시간을 정합니다. 1초 간격으로 두 번이면 요청이 2초 동안 실패합니다.
- 프록시 뒤에서는 forwarded 헤더를 설정해 앱이 실제 클라이언트 IP와 스킴을 보게 합니다. 설정하지 않으면 모든 요청이 로드 밸런서에서 온 것처럼 보이고, HTTPS 사이트인데 리다이렉트가 `http`로 돌아옵니다.
- 스티키 세션은 임시방편입니다. 세션 상태를 밖으로 빼서 어느 서버든 어느 요청이든 받을 수 있게 하고, 정말 옮길 수 없는 경우에만 어피니티를 남깁니다.
- L4 로드 밸런서는 패킷을 그대로 넘기므로 빠르고 프로토콜을 가리지 않습니다. L7 로드 밸런서는 요청을 읽기 때문에 경로, 호스트, 헤더로 라우팅하고 TLS를 종료하며 재시도해도 안전한 호출을 다시 보낼 수 있는데, 요청마다 하는 일이 그만큼 늘어납니다.
- 빼는 일도 넣는 일만큼 중요합니다. 내리는 인스턴스에는 새 요청을 먼저 끊고 들고 있던 것을 나중에 마치게 해야 하며, 그렇지 않으면 배포가 오류 다발로 바뀝니다.

## .NET에서는

YARP는 직접 만드는 대신 설정하는 리버스 프록시입니다. 클러스터가 목적지를 나열하고, 정책이 다음 요청을 누가 받을지 정하며, 능동 헬스 체크가 망가진 목적지를 순환 밖으로 빼 둡니다.

```json
{
  "ReverseProxy": {
    "Routes": { "api": { "ClusterId": "api", "Match": { "Path": "/{**catch-all}" } } },
    "Clusters": {
      "api": {
        "LoadBalancingPolicy": "LeastRequests",
        "HealthCheck": {
          "Active": { "Enabled": true, "Interval": "00:00:01", "Timeout": "00:00:01",
                      "Policy": "ConsecutiveFailures", "Path": "/healthz/ready" }
        },
        "Metadata": { "ConsecutiveFailuresHealthPolicy.Threshold": "2" },
        "Destinations": {
          "s1": { "Address": "http://api-1:8080/" },
          "s2": { "Address": "http://api-2:8080/" },
          "s3": { "Address": "http://api-3:8080/" }
        }
      }
    }
  }
}
```

나머지 절반은 애플리케이션 쪽에 있고, 빠뜨리기 쉬운 쪽도 이쪽입니다. 앱이 필요로 하는 의존성까지 답하는 readiness probe와, 앱이 실제 상대를 알 수 있게 해 주는 forwarded 헤더입니다.

```csharp
// 앱 쪽: 트래픽을 받는 데 앱이 필요로 하는 것을 확인하는 readiness probe.
builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("shop")!, tags: ["ready"]);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

var app = builder.Build();
app.UseForwardedHeaders();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`LeastRequests`가 YARP의 least connections이고, 임계치 2의 `ConsecutiveFailures`(YARP 기본값이지만 분명히 보이도록 위에 적어 두었습니다)는 장면이 그리는 규칙의 실패 쪽 절반입니다. probe 한 번 실패는 잡음이고, 연속 두 번은 판단입니다. 되돌아오는 쪽은 YARP가 장면보다 단순합니다. 첫 probe가 성공하면 바로 목적지를 다시 정상으로 표시하기 때문입니다. 장면처럼 성공 횟수에 임계치를 두는 것은 YARP가 아니라 Kubernetes의 `successThreshold` 같은 설정입니다. Application Gateway나 Kubernetes Ingress 같은 L7 로드 밸런서는 같은 세 조각으로 설정합니다. 목적지를 고르는 정책, 목적지 목록을 정하는 헬스 체크, 그리고 뒤에 있는 앱이 원래 요청을 볼 수 있게 하는 forwarded 헤더입니다. Azure Load Balancer나 Kubernetes Service 같은 L4 로드 밸런서에는 앞의 둘만 있습니다. Service라면 두 번째는 자체 probe가 아니라 파드의 readiness입니다. 요청을 읽지 않으므로 헤더를 더할 곳이 없기 때문입니다.
