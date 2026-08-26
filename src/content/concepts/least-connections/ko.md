---
title: "Least Connections"
summary: "least connections는 처리 중인 요청이 가장 적은 서버에 다음 요청을 보냅니다. 요청 비용이 모두 같다는 가정을 로드 밸런서가 이미 가지고 있는 측정값으로 바꾸는 것이라, 일이 고르지 않을 때 꺼내 쓰는 정책입니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: load-balancer
sceneStep: 2
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Power of Two Choices
    slug: power-of-two-choices
  - label: Tail Latency
    slug: tail-latency
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: YARP
    slug: yarp
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: The Power of Two Choices in Randomized Load Balancing
    url: https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
---

## 언제 쓰나

- 요청 비용이 자릿수 단위로 차이 날 때. 검색 엔드포인트와 헬스 엔드포인트가 나란히 있거나, 리포트와 단순 조회가 섞여 있는 경우입니다.
- 오래 유지되는 연결. 로드 밸런서는 연결을 한 번 라우팅할 뿐이고 그 뒤로 그 연결이 어떤 트래픽을 실어 나를지는 모릅니다. 연결 수를 세는 것이 남은 유일한 손잡이입니다.
- 속도가 다른 백엔드. 하드웨어가 달라서든 한 대가 힘들어하고 있어서든, 느린 서버에는 처리 중인 요청이 쌓이고, 그 수가 더 얹지 말라는 신호가 됩니다.

## 주의점

- 세는 것은 처리 중인 요청이지 대기열이 아닙니다. 즉시 실패하는 서버는 가장 한가해 보이므로, 헬스 체크가 잡아내기 전까지 망가진 인스턴스가 건강한 인스턴스보다 더 많은 트래픽을 끌어갑니다. 장면의 3단계가 그 장면이고, least connections와 헬스 체크가 함께 가야 하는 이유입니다.
- 로드 밸런서는 자기 연결만 셉니다. 인스턴스가 여럿이면 각자 부분적인 시야만 가지므로, 각자 최적인 선택을 모아도 전체 최적이 되지는 않습니다.
- 백엔드가 많아지면 정확한 수를 유지하는 데도 비용이 듭니다. power of two choices는 목적지 둘을 무작위로 뽑아 그중 짧은 쪽을 고르는데, 조율 비용 없이 이득의 대부분을 가져가기 때문에 규모가 큰 시스템은 대개 이쪽을 돌립니다.
- 동점에는 규칙이 필요합니다. 항상 첫 번째를 고르지 말고 순번을 돌리며 깨야 하며, 그러지 않으면 한가한 풀에서 모든 요청이 서버 한 대로 갑니다.
- 이것이 맞추는 것은 동시 처리 수이지 지연 시간이 아닙니다. 꼬리 지연이 문제라면 서버별 동시 실행 한도와 타임아웃을 함께 걸어, 느린 서버가 일을 흡수하지 않고 흘려보내게 합니다.

## .NET에서는

YARP에서는 `LeastRequests`라고 부르고, 기본 정책이 `PowerOfTwoChoices`인 이유도 장부를 관리하지 않고 least connections를 근사하기 때문입니다.

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            // LeastRequests reads the exact in-flight count; PowerOfTwoChoices
            // samples two destinations and takes the smaller of the two.
            LoadBalancingPolicy = LoadBalancingPolicies.LeastRequests,
            HttpRequest = new ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromSeconds(10) },
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

위의 `ActivityTimeout`은 장식이 아닙니다. least connections는 요청이 언젠가 카운트에서 빠져야 동작하는데, 영원히 매달린 요청은 자리를 영원히 차지합니다. 정책과 타임아웃은 같은 장치를 양쪽 끝에서 본 것입니다. Nginx는 `least_conn`, HAProxy는 `leastconn`이라고 쓰고, Envoy의 기본값은 표본 수를 설정할 수 있는 power of two choices인 `LEAST_REQUEST`입니다.
