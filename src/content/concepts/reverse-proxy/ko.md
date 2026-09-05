---
title: "Reverse Proxy"
summary: "리버스 프록시는 여러 내부 서비스 앞에 서는 하나의 공개 현관입니다. 클라이언트를 대신해 모든 요청을 받아 TLS, 라우팅, forwarded 헤더, 헬스 같은 경계의 일을 처리한 다음 나머지를 안쪽으로 넘깁니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: reverse-proxy
steps:
  - title: "주소는 하나, 서비스는 여럿입니다"
    text: "모든 클라이언트가 같은 현관과 이야기합니다. 프록시는 경로를 읽어 `/app`은 이쪽으로, `/api`는 저쪽으로 넘기고 답을 되돌려 줍니다. 백엔드는 클라이언트가 결코 보지 못하는 내부 주소로만 살아갑니다."
  - title: "경계의 일은 엣지가 맡습니다"
    text: "TLS는 프록시에서 끝납니다. 바깥은 암호화, 안쪽은 평문입니다. 이제 백엔드에게는 프록시가 호출자로 보이므로 원래 클라이언트는 `X-Forwarded-For`에 실려 함께 전달됩니다. 이 헤더는 자기 프록시가 적은 것만 믿어야 합니다."
  - title: "장애는 문 뒤에 머뭅니다"
    text: "프록시는 백엔드를 계속 살핍니다. 인스턴스 하나가 죽으면 다음 요청은 클라이언트가 눈치채지 못한 채 건강한 쪽으로 흐르고, 살아나면 조용히 되돌아옵니다. 장애를 흡수하는 자리가 엣지입니다."
  - title: "이 자리에 제품의 일까지 맡기면 게이트웨이가 됩니다"
    text: "자리는 같고 일이 늘어납니다. 토큰 없는 요청은 문에서 거절하고, 한도를 넘는 폭주는 잘라 내고, 같은 현관에 세 번째 라우트를 더합니다. API 게이트웨이는 제품의 관심사까지 맡게 된 리버스 프록시입니다."
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

## 언제 쓰나

- 여러 서비스가 하나의 사이트처럼 보여야 할 때 씁니다. 클라이언트는 호스트 이름 하나와 인증서 하나만 받고, 어느 서비스가 답할지는 경로가 정합니다. `/app`과 `/api`가 서로 다른 기계의 다른 프로세스라는 사실은 아무도 알 필요가 없습니다.
- 인증서와 TLS를 한곳에 모을 때 씁니다. 갱신하고, 암호 스위트를 고르고, HTTP/2를 켜는 일을 엣지에서 한 번만 하면 서비스마다 반복하는 것보다 훨씬 적게 일하고, 그중 하나에서 틀릴 가능성도 훨씬 줄어듭니다.
- 구성이 밖으로 드러나지 않아야 할 때 씁니다. 백엔드는 클라이언트가 라우팅할 수 없는 주소에서 듣기 때문에 실수 한 무리가 통째로 사라집니다. 공개할 생각이 없던 내부 관리 엔드포인트에는 애초에 닿을 수가 없습니다.
- 서비스 인스턴스 하나가 죽어도 호출자가 몰라야 할 때 씁니다. 프록시는 백엔드를 살펴 응답이 끊긴 쪽으로는 일을 보내지 않으므로, 배포든 장애든 재시작이든 엣지에서 흡수됩니다.
- 이전 작업에서 옛것과 새것을 가르는 자리가 필요할 때 씁니다. 스트랭글러 방식의 재작성이 통하는 이유는 프록시가 경로 하나만 새 서비스로 보내고 나머지는 그대로 옛 서비스로 보낼 수 있고, 그 경계를 경로 단위로 옮길 수 있기 때문입니다.
- 횡단 관심사를 한집에 모을 때 씁니다. 압축, 요청 로깅, correlation id, HTTP에서 HTTPS로 보내는 리다이렉트는 모두 서비스마다 최신으로 유지해야 하는 라이브러리보다 앞단의 규칙 하나로 두는 편이 쌉니다.

## 주의점

- forwarded 헤더는 사실이 아니라 입력입니다. `X-Forwarded-For`와 `X-Forwarded-Proto`는 무언가 걷어 내지 않는 한 요청을 보낸 쪽이 적은 값이므로, 클라이언트는 아무 주소나 자기 것이라고 주장할 수 있습니다. `ForwardedHeaders`에는 실제로 신뢰하는 프록시와 네트워크만 적고, 그 밖에서는 이 값을 신뢰하지 않는 입력으로 다룹니다.
- 홉의 개수도 신뢰만큼 중요합니다. 서비스 앞에 프록시가 둘 있으면 헤더에는 주소가 둘 들어가고, `ForwardLimit`이 어디까지 거슬러 읽을지 정합니다. 이 값을 잘못 두면 속도 제한도, 위치 추정도, 감사 로그도 모두 엉뚱한 클라이언트를 기록합니다.
- 타임아웃과 재시도는 두 층에 다 있고 서로 곱해집니다. 30초를 기다리는 서비스 앞에서 프록시가 30초를 기다리면 클라이언트는 1분을 침묵 속에 보내고, 두 번 재시도하는 서비스 앞에서 프록시가 두 번 재시도하면 요청 하나가 아홉 개가 됩니다. 바깥 예산을 안쪽보다 짧게 잡고, 재시도는 한곳에서만 합니다.
- 프록시 자신이 단일 장애점입니다. 뒤가 아무리 이중화되어 있어도 프록시가 하나뿐이면 소용이 없습니다. 최소 둘을 돌리고, 그 앞에 둘 사이를 넘길 수 있는 무언가를 두고, 이제는 설정 리로드까지 운영에 치명적인 경로가 되었다는 점을 기억합니다.
- 버퍼링은 기본값이 아니라 결정입니다. 요청과 응답 본문을 버퍼링하는 프록시는 느린 백엔드를 지켜 주지만 스트리밍을 망가뜨립니다. 서버 전송 이벤트는 마지막에 한 덩어리로 도착하고, 큰 업로드는 메모리에 쌓이며, gRPC 스트림은 아예 동작하지 않습니다. 손대지 않고 통과시켜야 하는 엔드포인트가 어느 것인지 알고 있어야 합니다.
- 웹소켓, gRPC, 롱 폴링은 따로 생각해야 합니다. 이들은 요청과 응답의 짝이 아니라 연결이므로 유휴 타임아웃, 업그레이드 헤더, 배포 중 연결 정리가 모두 평범한 경우와 다르게 움직입니다.
- 라우팅 규칙은 우리 코드 밖에 사는 코드입니다. 두 서비스가 함께 주장하는 경로 접두사, 더 구체적인 규칙보다 먼저 걸리는 규칙, 매칭을 바꿔 버리는 끝의 슬래시는 모두 버그이고, 어느 것도 두 서비스의 테스트에는 잡히지 않습니다.

## .NET에서는

YARP는 ASP.NET Core 애플리케이션 안에서 호스팅하는 리버스 프록시입니다. 그래서 라우팅 표는 설정이 되고 나머지는 이미 익숙한 미들웨어 파이프라인 그대로입니다.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapReverseProxy();
app.Run();
```

설정은 서로를 참조하는 목록 둘입니다. 라우트는 들어온 요청이 어떤 모양이어야 하는지와 어느 클러스터가 답할지를 적고, 클러스터는 그 이름 뒤에 어떤 주소들이 있는지를 적습니다.

```json
{
  "ReverseProxy": {
    "Routes": {
      "app": {
        "ClusterId": "app",
        "Match": { "Path": "/app/{**catch-all}" }
      },
      "api": {
        "ClusterId": "api",
        "Match": { "Path": "/api/{**catch-all}" }
      }
    },
    "Clusters": {
      "app": {
        "LoadBalancingPolicy": "PowerOfTwoChoices",
        "HealthCheck": {
          "Active": {
            "Enabled": true,
            "Interval": "00:00:05",
            "Policy": "ConsecutiveFailures",
            "Path": "/healthz"
          }
        },
        "Destinations": {
          "a1": { "Address": "http://10.0.1.11:8080/" },
          "a2": { "Address": "http://10.0.1.12:8080/" }
        }
      },
      "api": {
        "Destinations": {
          "api1": { "Address": "http://10.0.2.11:8080/" }
        }
      }
    }
  }
}
```

장면의 3단계를 글로 적으면 이렇게 됩니다. 능동 헬스 체크가 곧 그 살핌입니다. `a1`이 `/healthz`에 답하지 않으면 목적지 집합에서 빠지고 새 요청은 `a2`로 가며, 다시 답하기 시작하면 돌아옵니다. 클라이언트의 요청에서 바뀌는 것은 하나도 없고 그것이 바로 요점입니다. 간격은 이미 죽은 목적지에 프록시가 계속 일을 보낼 수 있는 시간의 길이이므로, 다툴 거리는 장치가 아니라 그 숫자입니다.

백엔드 쪽에는 반드시 해야 하는 일이 하나 있는데, 가장 자주 빠뜨리는 대목이기도 합니다. 앞에 프록시가 서는 순간 `HttpContext.Connection.RemoteIpAddress`는 프록시가 되고, 클라이언트가 HTTPS로 왔더라도 `Request.Scheme`은 `http`가 됩니다. `UseForwardedHeaders`가 원래 값을 되돌려 놓는데, 무엇을 믿을지는 알려 주어야 합니다.

```csharp
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

    // 기본값은 루프백만 신뢰합니다. 어느 프록시가 우리 것인지 알려 줍니다.
    options.KnownProxies.Clear();
    options.KnownNetworks.Clear();
    options.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("10.0.0.0"), 8));

    // 앞에 홉이 둘이면 헤더에도 주소가 둘 들어갑니다.
    options.ForwardLimit = 2;
});

var app = builder.Build();

// 스킴이나 클라이언트 주소를 읽는 그 무엇보다도 먼저.
app.UseForwardedHeaders();
app.UseAuthentication();
```

이 순서는 장식이 아닙니다. 인증도, 속도 제한도, HTTPS 리다이렉트도, 요청 로깅도 모두 `UseForwardedHeaders`가 적어 놓은 값을 읽으므로 그 앞에 와야 합니다. 늦게 실행하면 리다이렉트 고리가 생깁니다. 서비스는 `http`를 보고 `https`로 보내고, 프록시는 같은 요청을 다시 `http`로 들여보냅니다.

설정으로 표현할 수 없는 규칙이 필요하면 YARP는 변환(transform)을 내어 줍니다. 프록시가 우리 대신 만들어 보내는 요청에 같은 파이프라인 개념을 적용한 것입니다. 아래 콜백은 모든 라우트에서 실행되므로, 규칙이 특정 라우트의 것이라면 그 안에서 `context.Route`를 확인하거나 설정에서 해당 라우트에 `Transforms` 항목을 두는 편이 낫습니다.

```csharp
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // 이 자리는 어느 클러스터가 답했는지 알지만, 클라이언트는 몰라야 합니다.
        context.AddResponseHeaderRemove("Server");
        context.AddRequestTransform(transform =>
        {
            transform.ProxyRequest.Headers.Remove("X-Internal-Token");
            return ValueTask.CompletedTask;
        });
    });
```

장면의 마지막 단계는 여기서 더 나아가면 무슨 일이 벌어지는지를 보여 줍니다. 라우트에 `.RequireAuthorization()`을 붙이고, `MapReverseProxy` 앞에 `AddRateLimiter`를 두고, 클러스터 둘로 퍼뜨린 뒤 답을 합치는 엔드포인트를 만드는 식입니다. 그렇게 해도 이 자리의 정체는 달라지지 않습니다. 여전히 여러 서비스 앞의 주소 하나이고, 여기에 무언가를 더할 때 조심해야 하는 이유는 여기에 두는 규칙마다 어느 서비스도 혼자서는 보거나 테스트하거나 따져 볼 수 없는 규칙이 하나씩 늘기 때문입니다.
