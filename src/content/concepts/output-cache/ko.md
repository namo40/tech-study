---
title: "Output Cache"
summary: "출력 캐시는 응답 전체를 서버에 담아 두고 미들웨어에서 다시 틀어 줍니다. 적중하면 엔드포인트에는 아예 닿지 않습니다. 데이터가 아니라 바이트를 캐시하므로 키 공간은 요청의 변화 축이 되고, 기본 대상은 익명 호출자입니다."
category: "캐시"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Tag
    slug: cache-tag
  - label: HybridCache
    slug: hybridcache
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: REST
    slug: rest
references:
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## 언제 쓰나

- 엔드포인트가 내놓는 답 전체가 여러 호출자에게 똑같을 때 씁니다. 공개 카탈로그 목록, 마케팅 페이지, 발행된 글, 재고 현황 피드가 그렇습니다. 매번 하는 일이 똑같고 보는 쪽은 익명이므로, 담아 둘 자연스러운 단위는 뒤에 있는 행이 아니라 응답입니다.
- 쿼리만이 아니라 전부를 건너뛰고 싶을 때 씁니다. 이것이 cache-aside와 갈라지는 축입니다. cache-aside는 데이터를 캐시하고 적중할 때마다 라우팅과 모델 바인딩과 인가와 핸들러와 직렬화를 여전히 돌립니다. 출력 캐시는 미들웨어에서 답하므로 적중 한 번의 값이 키 조회와 소켓 쓰기이고, 절약되는 것 안에는 쿼리보다 큰 경우가 많은 직렬화도 들어 있습니다.
- 변형을 셀 수 있을 때 씁니다. 응답 캐시는 같은 키가 다시 와야 쓸모가 있으므로, 엔드포인트가 작고 닫힌 것들로만 변해야 합니다. 페이지 번호, 정렬 순서, 로캘, 테넌트가 그런 것입니다. 변화 축이 알려져 있고 몇 개 안 되면 적중률이 높고 메모리도 묶입니다.
- 무효화가 거칠고 빨라야 할 때 씁니다. 영향 준 것을 전부 물러나게 해야 하는 발행 동작에는 키를 부를 방법이 없는데, 엔드포인트의 응답에 태그를 달아 두면 거기서 만들어 낸 모든 변형에 닿는 손잡이가 하나 생깁니다. 태그가 무엇이고 얼마나 넓게 잡아야 하는지는 cache-tag 페이지의 몫입니다.

## 주의점

- 중요한 실패는 개인화된 응답이고, 기본값이 여러분을 지키고 있습니다. 미들웨어는 인증을 달고 온 요청을 캐시하지 않고 쿠키를 설정하는 응답도 캐시하지 않습니다. 한 사용자에게 그려 준 페이지를 다른 사용자에게 내어 주는 것은 낡은 데이터 버그가 아니라 데이터 유출이기 때문입니다. 그 조건을 뒤집는 것은 가능하지만, 신원을 실제로 담은 vary 키를 받쳐 두고 이름을 걸고 내리는 결정이어야 합니다.
- 변화 축 하나하나가 키 공간을 곱합니다. 쿼리 매개변수 둘과 로캘 헤더 하나와 라우트 값 하나로 변한다면 그 곱이 담길 수 있는 항목 수이고, 값이 무한한 축은, 이를테면 임의의 쿼리 문자열이나 클라이언트가 주는 식별자는, 적중은 한 번도 없이 자라기만 하는 캐시를 만듭니다. 쿼리 문자열 전체로 변하게 두지 말고 축을 하나씩 이름으로 적으세요.
- 기본 저장소는 프로세스의 메모리에 삽니다. 로드 밸런서 뒤의 인스턴스 열 개는 서로 독립한 캐시 열 개를 들고 있으므로, 인스턴스마다 첫 요청이 빗나가고, 배포 한 번이 열 개를 동시에 비우며, 한쪽의 축출은 나머지 아홉에게 보이지 않습니다. 만료가 짧으면 받아들일 만하고 비싼 응답에는 받아들이기 어려운데, 공유 저장소가 있는 이유가 그것입니다.
- 이것은 HTTP 캐싱이 아니며, 둘을 섞으면 양쪽 방향으로 놀랄 일이 생깁니다. 출력 캐시는 서버가 다스리고 클라이언트가 요구하는 바를 무시합니다. 헤더를 따르는 쪽은 response caching 미들웨어이고, 그쪽은 `Cache-Control`을 존중하므로 `no-cache`를 보내는 클라이언트에게 무력해집니다. CDN과 브라우저가 다시 받아 가지 않게 하는 것이 목표라면 그것은 헤더에 관한 이야기이고, 내 서버가 같은 일을 두 번 하지 않게 하는 것이 목표라면 이쪽입니다.

## .NET에서는

- 출력 캐시는 ASP.NET Core에 들어 있습니다. `AddOutputCache`로 등록하고, `UseOutputCache`를 `UseCors`와 라우팅 뒤, 엔드포인트 앞에 놓고, 엔드포인트는 `CacheOutput()`이나 `[OutputCache]` 특성으로 참여합니다. 참여하는 것이 없으면 아무것도 캐시되지 않습니다.

```csharp
builder.Services.AddOutputCache(options =>
{
    // 정책 이름을 대지 않고 참여한 모든 엔드포인트에 적용됩니다.
    options.AddBasePolicy(policy => policy.Expire(TimeSpan.FromSeconds(30)));

    // 이름 붙인 정책은 자기 수명과 자기 키 공간과 자기 태그를 선언합니다.
    options.AddPolicy("catalog", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        // 키는 이것들로만 변하므로 공간이 셀 수 있는 크기로 남습니다.
        .SetVaryByQuery("page", "sort")
        .Tag("catalog"));
});

var app = builder.Build();
app.UseOutputCache();

// 익명 GET만 담깁니다. 인증된 요청은 기본적으로 건너뜁니다.
app.MapGet("/catalog", (int page, string sort) => catalogue.Query(page, sort))
   .CacheOutput("catalog");
```

- 한 영역을 물러나게 하는 것은 내용이 바뀐 것을 아는 관리자 동작이나 메시지 핸들러에서 부르는 `IOutputCacheStore.EvictByTagAsync("catalog", ct)`입니다. 태그에 무엇을 담아야 하는지와 제거 한 번이 얼마나 부수도록 허락할지는 cache-tag가 다룹니다. 이 페이지에만 있는 이야기는 태그가 항목이 아니라 정책에 선언된다는 점뿐입니다. 항목이 여러분이 쓴 객체가 아니라 미들웨어가 만들어 낸 응답이기 때문입니다.
- 분산 저장소를 등록하면 캐시가 공유됩니다. `AddStackExchangeRedisOutputCache`는 항목을 프로세스 밖으로 옮기므로 인스턴스들이 서로의 채움을 얻어 쓰고 배포 뒤에도 차갑게 시작하지 않습니다. 대신 적중할 때마다 네트워크 한 홉과 직렬화를 치릅니다.
- 여기서의 만료는 재검증 없는 평범한 TTL입니다. 조건부 요청도, 뒤에서 도는 갱신도, 쇄도 방지도 없으므로, 인기 있는 항목이 부하 아래에서 만료되면 동시에 있던 호출자가 전부 한꺼번에 엔드포인트로 들어갑니다. 이런 일이 드물 만큼 수명을 넉넉히 두고, 비싼 부분을 하나로 접을 값어치가 있다면 데이터 계층에서 HybridCache를 집어 드세요.
