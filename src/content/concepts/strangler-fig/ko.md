---
title: "Strangler Fig"
summary: "Strangler Fig는 시스템을 기능 하나씩 교체합니다. 옛 시스템 앞에 라우팅 facade를 두고, 기능을 하나씩 새로 만들어 그 경로만 새 시스템으로 넘깁니다. 옛 시스템은 그만큼 줄어들다가 facade 뒤에서 아무것도 남지 않게 됩니다."
category: "애플리케이션 아키텍처"
scene: strangler-fig
steps:
  - title: "먼저 facade를 세웁니다"
    text: "옛 시스템 앞에 라우터를 둡니다. 첫날에는 아무것도 바뀌지 않습니다. 모든 경로가 여전히 legacy를 가리킵니다. 달라진 것은 이제 경로를 하나씩 옮길 수 있다는 점입니다."
  - title: "기능 하나를 옮깁니다"
    text: "customers를 새 시스템에 다시 만들고 그 경로만 바꾸고 나머지는 그대로 둡니다. 새 코드가 아직 옛 데이터를 필요로 하는 곳에서는 anti-corruption layer가 legacy 모델이 새어 들어오지 않도록 번역합니다."
  - title: "천천히 바꿉니다"
    text: "orders 트래픽의 10%를 새 코드로 보내고, 다음에는 절반을 보냅니다. 실패하면 배포가 아니라 경로를 되돌리고, 고친 뒤에 전부를 보냅니다."
  - title: "아무것도 남지 않을 때까지"
    text: "reports가 마지막으로 옮겨 가고 번역 계층도 그와 함께 얇아지다가, 옛 시스템은 모든 줄이 new를 가리키는 라우터 뒤에서 퇴역합니다. 마이그레이션은 끝까지 합니다. 반만 옮긴 시스템은 양쪽의 단점만 남습니다."
related:
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Canary Release
    slug: canary-release
  - label: Modular Monolith
    slug: modular-monolith
  - label: Database per Service
    slug: database-per-service
  - label: Bounded Context
    slug: bounded-context
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

## 언제 쓰나

- 한 번에 다시 쓰기에는 너무 크거나 위험한 시스템을 교체할 때입니다.
- 기능을 경로 뒤로 나눌 수 있고, 옮긴 뒤에는 기능마다 데이터 주인이 분명할 때입니다.
- 옛 시스템을 다시 배포하지 않고도 기능 하나를 되돌릴 수 있어야 할 때입니다.

## 주의점

- 옮기기 전에 기능마다 데이터 주인을 정합니다. anti-corruption layer는 번역이지 공유 데이터베이스가 아닙니다.
- 경로를 바꾼 기능은 옛 경로가 퇴역할 때까지 양쪽 모두를 관측할 수 있어야 합니다.
- facade가 새로운 모놀리스가 되게 두지 않습니다. facade는 경로를 정할 뿐 로직을 담지 않습니다.
- 끝까지 합니다. 중간에 멈춘 마이그레이션은 운영해야 할 면적을 영구히 두 배로 만듭니다.

## .NET에서는

YARP facade는 경로가 가리키는 클러스터를 바꾸는 것만으로 기능을 하나씩 옮깁니다. 아래 설정에서 `customers`는 이미 옮겨 갔고, `orders`는 카나리 몫에만 새 시스템을 보여 주며, `reports`는 아직 그대로입니다.

```json
{
  "ReverseProxy": {
    "Routes": {
      "customers": { "ClusterId": "new",    "Match": { "Path": "/customers/{**rest}" } },
      "orders-canary": {
        "ClusterId": "new", "Order": 0,
        "Match": { "Path": "/orders/{**rest}", "Headers": [ { "Name": "X-Canary", "Values": [ "1" ] } ] }
      },
      "orders":    { "ClusterId": "legacy", "Order": 1, "Match": { "Path": "/orders/{**rest}" } },
      "reports":   { "ClusterId": "legacy", "Match": { "Path": "/reports/{**rest}" } }
    },
    "Clusters": {
      "legacy": { "Destinations": { "d1": { "Address": "https://legacy.internal/" } } },
      "new":    { "Destinations": { "d1": { "Address": "https://shop-new.internal/" } } }
    }
  }
}
```

```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.MapReverseProxy();
```

경로는 설정이므로 되돌리는 일도 설정 변경입니다. 옛 시스템을 다시 배포할 필요도, 커밋을 되돌릴 필요도, 두 버전이 어중간하게 함께 살아 있는 구간도 없습니다. 헤더 대신 비율로 나누는 것도 같은 생각을 한 걸음 더 밀고 간 것입니다. 일부 클라이언트만 지니는 헤더나 쿠키로 매칭하거나, 두 대상을 함께 담은 클러스터에 사용자 정의 로드 밸런싱 정책을 붙여 만듭니다.
