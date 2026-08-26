---
title: "Round Robin"
summary: "라운드 로빈은 정해진 순환을 따라 다음 서버에 요청을 넘깁니다. 커서 하나 말고는 상태가 필요 없고 아무것도 측정하지 않기 때문에, 요청 비용이 서로 비슷할 때 딱 맞는 기본값입니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: load-balancer
sceneStep: 1
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Least Connections
    slug: least-connections
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Weighted Round Robin
    slug: weighted-round-robin
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
references:
  - title: YARP load balancing
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/load-balancing
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: Kubernetes Service and kube-proxy
    url: https://kubernetes.io/docs/reference/networking/virtual-ips/
---

## 언제 쓰나

- 크기가 같은 인스턴스들이 비용이 비슷한 일을 할 때. 모든 엔드포인트가 몇 밀리초에 끝나는 무상태 HTTP API가 그렇습니다.
- 비용이 고르지 않다는 증거가 아직 없는 첫 설정. 라운드 로빈은 값이 싸서, 튜닝의 대상이라기보다 나중에 다른 것으로 바꾸는 출발점입니다.
- 로드 밸런서가 요청 시간을 볼 수 없는 곳. 패킷만 넘기고 응답 비용을 끝내 알지 못하는 대부분의 L4 로드 밸런서가 여기에 해당합니다.

## 주의점

- 순환은 앞을 보지 못합니다. 느린 요청 셋을 아직 붙들고 있는 서버에도 순번은 그대로 돌아오고, 장면의 2단계가 보여 주는 것이 바로 그 실패입니다.
- 크기가 다른 인스턴스에는 가중치가 필요합니다. 가중 라운드 로빈은 메모리가 두 배인 서버에 순번을 두 배로 주는데, 밑바탕은 여전히 같은 순환이고 가중치는 이름이 얼마나 자주 나오는지만 바꿉니다.
- 순환은 로드 밸런서마다 따로 돕니다. 여러 인스턴스가 각자 커서를 돌리면 결과는 순환보다 무작위에 가까워지는데, 부하 분산 자체에는 문제가 없지만 한 인스턴스의 로그만 읽으면 헷갈립니다.
- 오래 유지되는 연결 앞에서는 아예 무너집니다. 요청이 아니라 연결을 라우팅하면 라운드 로빈 결정 한 번이 그 연결의 모든 요청을 처리하게 되고, WebSocket이나 gRPC 채널 하나가 서버 한 대를 몇 시간씩 붙잡습니다.
- 새 서버는 순환에 들어오자마자 첫 순번부터 온전한 몫을 받습니다. 차가운 상태로 트래픽의 4분의 1을 받게 두지 말고 예열해야 하는 이유입니다.

## .NET에서는

`RoundRobin`이 YARP의 기본 정책이고, 분산을 일부러 하지 않으려면 `FirstAlphabetical`을 씁니다. 가중치는 목적지의 메타데이터로 두고, 가중치를 쓰는 정책이 그것을 읽습니다.

```csharp
builder.Services.AddReverseProxy().LoadFromMemory(
    routes: [new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/{**catch-all}" } }],
    clusters:
    [
        new ClusterConfig
        {
            ClusterId = "api",
            LoadBalancingPolicy = LoadBalancingPolicies.RoundRobin,
            Destinations = new Dictionary<string, DestinationConfig>
            {
                ["s1"] = new() { Address = "http://api-1:8080/" },
                ["s2"] = new() { Address = "http://api-2:8080/" },
                ["s3"] = new() { Address = "http://api-3:8080/" },
            },
        },
    ]);
```

같은 정책이 다른 이름으로 어디에나 있습니다. iptables 모드의 `kube-proxy`는 연결마다 백엔드를 무작위로 고르는데 평균을 내면 라운드 로빈이 되고, IPVS 모드에서는 `rr`이 문자 그대로의 알고리즘입니다. Nginx는 따로 지정하지 않으면 가중 라운드 로빈을 쓰고, Azure Load Balancer는 5-튜플을 해시해서 커서 없이도 연결을 고르게 흩습니다. 어느 쪽이든 주의할 점은 같습니다. 이 순환은 순번에서 공평할 뿐, 일의 양에서 공평한 것이 아닙니다.
