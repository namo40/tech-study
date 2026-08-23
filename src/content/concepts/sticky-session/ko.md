---
title: "Sticky Session"
summary: "Sticky Session은 각 사용자를 그 사용자의 메모리 상태를 들고 있는 인스턴스에 묶습니다. 상태를 가진 앱을 여러 대로 늘릴 수 있게 해 주지만, 부하가 한쪽으로 쏠리고 인스턴스가 사라지면 세션도 함께 사라집니다. 세션을 공유 저장소로 옮기면 이 묶음 자체가 필요 없어집니다."
category: "서버 상태 관리"
scene: sticky-session
steps:
  - title: "라운드 로빈에 메모리 세션"
    text: "A가 inst 1에서 로그인합니다. 다음 요청은 A를 본 적 없는 inst 2에 떨어지고, 로그아웃된 것처럼 보입니다. B도 inst 3에서 로그인한 뒤 다음 요청에서 같은 벽에 부딪힙니다."
  - title: "Sticky"
    text: "로드 밸런서가 쿠키를 심고 A의 모든 요청을 inst 1로 돌려보냅니다. 동작은 합니다. 대신 바쁜 사용자 하나가 한 인스턴스에 몰리는 동안 다른 인스턴스는 놉니다."
  - title: "인스턴스가 가면 세션도 갑니다"
    text: "배포로 inst 1이 재시작됩니다. A의 쿠키는 여전히 그곳을 가리키지만 상태는 사라졌고, A는 순번이 내주는 인스턴스에서 다시 로그인합니다. 배포 때마다 누군가는 로그아웃됩니다."
  - title: "세션을 밖으로 꺼냅니다"
    text: "공유 저장소에 두면 어떤 인스턴스든 어떤 사용자든 처리합니다. 배포가 사람을 로그아웃시키지 않고, 부하는 고르게 퍼지며, stickiness는 캐시를 위한 선택 사항이 됩니다."
related:
  - label: Session State
    slug: session-state
  - label: Distributed Session
    slug: distributed-session
  - label: Stateless Server
    slug: stateless-server
  - label: Stateful Server
    slug: stateful-server
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
  - label: Rolling Update
    slug: rolling-update
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
  - title: YARP session affinity
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/session-affinity
---

## 언제 쓰나

- 다리로 씁니다. 기존 애플리케이션이 상태를 메모리에 두는데 오늘 당장 여러 인스턴스에서 돌아가야 하고, 구조를 다시 짜는 일은 이번 주에 할 수 있는 일이 아닌 경우입니다.
- 최적화로 씁니다. 사용자가 자주 쓰는 데이터가 인스턴스마다 캐시되어 있어서 같은 곳으로 돌려보내면 캐시를 다시 만드는 비용을 아낄 수 있고, 어디에 떨어지든 정확성은 달라지지 않는 경우입니다.

## 주의점

- stickiness는 내구성이 아닙니다. 축소, 배포, 장애로 그 인스턴스에 묶인 세션은 전부 사라지고, 사용자는 오류가 아니라 로그아웃을 봅니다.
- 부하는 마침 바쁜 사용자를 들고 있는 인스턴스 쪽으로 기웁니다. 오토스케일링이 용량을 더해도, 라우팅이 이미 그 용량을 쓰지 않기로 정해 둔 상태입니다.
- ASP.NET Core에서는 세션 상태만 옮겨서는 부족합니다. Data Protection 키 링도 함께 공유해야 하며, 그러지 않으면 한 인스턴스가 발급한 인증 쿠키를 다음 인스턴스가 거부합니다.
- 게임 방이나 실시간 협업처럼 상태와 계산이 한곳에 있어야 하는 경우에는, stickiness나 무상태를 억지로 밀어붙이기보다 상태를 명시적으로 나누는 파티션 모델을 택합니다.

## .NET에서는

```csharp
var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis"]!);

// Session state lives in Redis, so any instance can read it.
builder.Services.AddStackExchangeRedisCache(options =>
    options.Configuration = builder.Configuration["Redis"]);
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(20);
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
});

// The key ring must be shared as well, or cookies signed on one
// instance are unreadable on the next.
builder.Services.AddDataProtection()
    .PersistKeysToStackExchangeRedis(redis, "shop:data-protection-keys")
    .SetApplicationName("shop");

var app = builder.Build();
app.UseSession();
```

YARP나 클라우드 로드 밸런서의 session affinity 옵션은 이득이 있다면 켜 둬도 됩니다. 다만 정확성이 아니라 캐시 적중을 위한 것으로만 씁니다. 세션이 공유 저장소에 들어간 뒤에는 요청이 다른 인스턴스에 떨어져도 왕복 한 번을 더 쓸 뿐, 그 밖에 잃는 것은 없습니다.
