---
title: "Service Discovery"
summary: "Service Discovery(서비스 디스커버리)는 호출자가 서비스 이름을 실제로 연결할 수 있는 주소로 바꾸는 방법입니다. 호출자가 레지스트리나 DNS에서 현재 인스턴스 목록을 받아 직접 고르거나, 서비스 앞에 선 무언가가 대신 고릅니다."
category: "엣지, 라우팅과 서비스 네트워크"
related:
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Sidecar
    slug: sidecar
  - label: Health Check
    slug: health-check
  - label: Readiness Probe
    slug: readiness-probe
  - label: YARP
    slug: yarp
references:
  - title: "Service discovery in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/service-discovery
  - title: "DNS for Services and Pods"
    url: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - title: "Service"
    url: https://kubernetes.io/docs/concepts/services-networking/service/
---

## 언제 쓰나

- 이름 뒤에 놓인 인스턴스 집합이 고정되기를 멈추는 순간부터 씁니다. 배포가 파드를 갈아 끼우고, 오토스케일링이 파드를 늘렸다 줄이고, 비워지는 노드가 한 번에 여러 개를 데려가므로, 설정에 적어 둔 IP 주소는 유효 기간이 붙은 사실입니다. Service Discovery는 주소를 이름으로 바꾸고, 지금 어느 인스턴스가 답하고 있는가라는 질문을 그 집합을 지켜보는 쪽에 넘깁니다.
- 고르는 일을 호출자가 해야 한다면 클라이언트 측 발견입니다. 호출자가 레지스트리나 DNS에 현재 목록을 물어 스스로 인스턴스를 고릅니다. 네트워크 홉이 둘이 아니라 하나이고, 호출자마다 정책을 달리 둘 수 있습니다. 자기 존을 먼저 쓰거나, 다른 인스턴스로 재시도하거나, 그동안 느렸던 인스턴스를 건너뛰는 식입니다. 대가는 이제 모든 호출자가 클라이언트와 캐시와 정책을 지녀야 한다는 것이고, 서버 군이 쓰는 모든 언어로 지녀야 한다는 것입니다.
- 어느 호출자도 아무것도 고르지 않기를 바란다면 서버 측 발견입니다. 호출자는 안정된 주소 하나에 연결하고, 그 뒤의 로드 밸런서나 리버스 프록시나 Kubernetes `Service`가 인스턴스를 고릅니다. 호출자에는 아무것도 설치하지 않고 정책은 한곳에 모이며, 대가는 홉이 하나 늘고 죽을 수 있는 구성 요소가 하나 늘어난다는 것입니다.
- Kubernetes에서는 두 방식이 이미 만들어져 있고, 그것을 다시 만드는 일이 가장 흔한 낭비입니다. `Service`는 셀렉터에 걸린 파드들 앞에 놓인 안정된 이름과 가상 IP이고, 클러스터 DNS가 `catalog.shop.svc.cluster.local`을 그리로 풀어 줍니다. 설치할 것이 없는 서버 측 발견입니다. 헤드리스 `Service`(`clusterIP: None`)는 대신 파드 주소들로 풀리므로, 직접 고르려는 호출자에게 목록이 그대로 건네집니다. 그리고 이름 붙은 포트에는 `_grpc._tcp.catalog.shop.svc.cluster.local` 같은 SRV 레코드가 붙어 포트 번호까지 실어 주므로, 포트를 미리 모르는 클라이언트도 엔드포인트를 찾아냅니다.
- 주소가 정말로 안정적이라면 쓰지 않습니다. 엔드포인트가 하나인 관리형 데이터베이스, 남의 DNS 뒤에 있는 서드파티 API, 플랫폼이 이미 안정적으로 유지해 주는 주소 뒤의 인스턴스라면, 설정에 적은 이름만으로 필요한 간접 참조는 이미 다 갖춘 셈이고, 그 앞에 레지스트리를 두면 할 일 없는 구성 요소가 하나 늘어납니다.

## 주의점

- 받아 둔 답은 모두 유효 기간이 붙은 캐시입니다. 레지스트리 클라이언트는 목록을 쥐고 있고, 리졸버는 TTL이 다할 때까지 레코드를 쥐고 있으며, 커넥션 풀은 한 번 풀어 본 주소로 열어 둔 소켓을 쥐고 있습니다. 2초 전에 답하기를 멈춘 인스턴스는 셋 모두에 그대로 남아 있으므로, 질문은 목록이 맞는가가 아니라 얼마나 낡아도 되는가, 그 창에 걸린 요청은 어떻게 되는가입니다. 다른 인스턴스로 재시도하고, 그 재시도가 살아 있는 인스턴스를 찾을 만큼 창을 짧게 유지해야 합니다.
- 등록은 쉽고 썩는 쪽은 등록 해제입니다. 도착만 전해 듣는 레지스트리는 죽은 프로세스, OOM으로 끝난 프로세스, 배포 중에 교체된 프로세스의 주소로 차오릅니다. 그중 어느 것도 작별 인사를 보낼 틈이 없기 때문입니다. 집합을 솎아 내는 일은 인스턴스의 예의가 아니라 인스턴스를 지켜보는 쪽이 맡아야 합니다. 갱신하지 않으면 만료되는 리스이거나, 레지스트리가 직접 도는 헬스 체크입니다.
- 등록되어 있다는 것과 요청을 받을 준비가 되었다는 것은 다릅니다. Kubernetes는 둘을 일부러 묶어 두었습니다. readiness 상태인 엔드포인트만 `Service`에 들어가므로, readiness probe가 실패하면 아무것도 지우지 않고도 파드가 DNS와 분배 대상 집합에서 빠집니다. 직접 만든 레지스트리가 빠뜨리는 고리가 정확히 이 연결입니다. 프로세스는 살아 있지만 의존 대상이 죽어 있는 동안에도 200을 돌려주는 probe는, 받는 요청마다 실패할 파드를 집합에 다시 넣습니다.
- `HttpClient`는 연결을 열 때 이름을 풀고 그 연결에 대해서는 다시 풀지 않으며, 레코드의 TTL도 따르지 않습니다. 죽은 주소로 가는 연결을 이미 풀에 담아 둔 장수 클라이언트는 계속 그리로 요청을 건넵니다. `SocketsHttpHandler`의 `PooledConnectionLifetime`을 설정해 연결이 정해진 주기로 물러나고 이름이 다시 조회되게 해야 합니다. 그 값은 엔드포인트가 얼마나 자주 움직이는지에 거는 내기이지 그대로 베껴 쓸 상수가 아닙니다.
- 이제 레지스트리는 모든 첫 요청의 경로 위에 있습니다. 레지스트리에 닿지 못하면 아무도 아무것도 찾지 못하고, 디스커버리 장애는 한 서비스의 장애가 아니라 전면 장애로 보입니다. 닿지 못할 때 닫아 버리는 대신 마지막으로 받은 정상 응답으로 계속 답하고, 레플리카를 둘 이상 두고, 플랫폼이 제공하는 수단이 있다면 그쪽을 먼저 씁니다. 클러스터 DNS는 이미 복제되어 있고, 클러스터 안의 나머지 전부가 이미 그 위에 얹혀 있습니다.

## .NET에서는

`Microsoft.Extensions.ServiceDiscovery`는 Aspire의 서비스 참조가 쓰는 라이브러리이고, 하는 일은 작습니다. 호스트가 들어갈 자리에 논리 이름을 적은 `HttpClient`를 둘 수 있게 하고, 요청이 나가기 직전에 그 이름을 실제 엔드포인트로 바꿉니다. `AddServiceDiscovery`가 공급자를 등록하고, 클라이언트 빌더 쪽 호출이 특정 클라이언트를 그 대상으로 넣습니다.

```csharp
// 기본 엔드포인트 공급자다. 설정 공급자가 먼저이고, 그다음이 이름을 DNS
// 이름으로 그대로 돌려주는 통과 공급자다.
builder.Services.AddServiceDiscovery();

// 주소는 호스트가 아니라 서비스 이름이다. "https+http"는 HTTPS 엔드포인트를
// 먼저 풀고, 하나도 없을 때만 HTTP로 물러난다는 뜻이다.
builder.Services.AddHttpClient<CatalogClient>(static client =>
    {
        client.BaseAddress = new Uri("https+http://catalog");
    })
    .AddServiceDiscovery();

// 또는 모든 클라이언트를 한 번에 넣고, 풀에 든 연결을 정해진 주기로 물리게
// 해서 옮겨 간 엔드포인트를 붙든 채로 두지 않고 다시 풀게 한다.
builder.Services.ConfigureHttpClientDefaults(http =>
{
    http.AddServiceDiscovery();
    http.ConfigurePrimaryHttpMessageHandler(static () =>
        new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) });
});
```

설정 공급자는 `IConfiguration`에서 엔드포인트를 읽습니다. 그래서 `catalog`의 목록은 `Services:catalog:https` 아래의 평범한 설정이고, 그중 첫 번째가 `Services:catalog:https:0`입니다. `appsettings.json`에서 와도 되고, 환경 변수에서 와도 되고, 서비스를 어디에 띄웠는지 이미 아는 Aspire AppHost에서 와도 됩니다.

```json
{
  "Services": {
    "catalog": {
      "https": [
        "catalog-1.internal:8443",
        "catalog-2.internal:8443"
      ]
    }
  }
}
```

클러스터 안에서는 대개 그중 아무것도 설정하지 않습니다. `AddServiceDiscovery`가 함께 등록하는 통과 공급자는 이름을 그대로 `DnsEndPoint`로 돌려주므로, `https://catalog`는 클러스터 DNS가 `catalog` `Service`를 상대로 풀어 주고 발견은 플랫폼이 합니다. 이것이 이 작업의 요점입니다. 같은 코드가 손대지 않은 채로 노트북에서는 설정을 통해, 클러스터에서는 `Service`를 통해 풀립니다. DNS SRV 공급자는 예외이고, 헤드리스 `Service`의 이름 붙은 포트를 위한 것이며, 기본 등록이 아니라 핵심 등록 위에 얹습니다.

```csharp
// 패키지는 Microsoft.Extensions.ServiceDiscovery.Dns다.
// AddServiceDiscoveryCore는 기본 공급자 없이 뼈대만 등록하므로 물어보는
// 공급자는 SRV뿐이다. 그러면 "https://_dashboard.catalog"는 "catalog"
// 서비스의 "dashboard"라는 이름이 붙은 포트의 SRV 레코드로 풀린다.
builder.Services.AddServiceDiscoveryCore();
builder.Services.AddDnsSrvServiceEndpointProvider();
```

어느 공급자가 답하든 위의 주의점은 여전히 애플리케이션의 몫입니다. 풀린 엔드포인트가 그 뒤의 인스턴스보다 오래 살아남지 않게 막아 주는 것이 `PooledConnectionLifetime`이고, 서비스가 요청을 받는 데 필요한 의존 대상까지 답하는 readiness 엔드포인트가 이 인스턴스를 답할 수 없는 동안 집합 밖에 두어 줍니다. 발견은 어떤 주소가 존재하는지를 정하고, readiness는 그중 어느 주소가 트래픽을 받을 만한지를 정합니다.
