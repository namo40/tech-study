---
title: "Minimal APIs"
summary: "Minimal APIs는 ASP.NET Core의 의식을 걷어낸 엔드포인트 모델입니다. 라우트와 핸들러가 호출 하나로 이어지고 그 사이에 컨트롤러 클래스가 없어서, 읽는 엔드포인트가 곧 도는 코드입니다."
category: ".NET 런타임과 호스팅"
related:
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
  - title: Minimal APIs quick reference
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis?view=aspnetcore-10.0
---

## 언제 쓰나

- 표면이 작은 서비스나 마이크로서비스에서는 기본값으로 둡니다. 의식의 무게가 기능의 무게보다 커지는 자리이기 때문입니다. `MapGet`과 `MapPost` 호출로 쓴 엔드포인트 몇 개는 한 화면에 들어가고, 라우트를 따라 동작을 찾아온 사람은 클래스 이름과 특성과 기반 타입을 먼저 풀어내는 대신 답을 주는 람다에 바로 도착합니다.
- 리소스 하나에 자리를 하나 주고 싶을 때 `MapGroup`을 씁니다. 그룹은 라우트 접두사와 함께 그 아래 모든 엔드포인트에 걸리는 메타데이터, 권한 부여 정책, 필터를 같이 나릅니다. `/orders`와 그 하위 라우트가 액션마다 특성을 되풀이하는 대신 선언 하나를 공유하게 됩니다.
- 횡단 관심사가 애플리케이션 전체가 아니라 일부 엔드포인트의 것일 때 엔드포인트 필터를 꺼냅니다. 검증, 테넌트 판별, 감사 로그는 모델 바인딩이 끝난 뒤 라우팅된 엔드포인트 안에서 돕니다. 미들웨어는 바인딩된 인자를 볼 수 없고 전역 필터는 필요 없는 라우트에서도 도는 자리가 바로 여기입니다.
- 시작 시간과 트리밍이 중요한 워크로드에서 고릅니다. 이 모델은 Native AOT와 요청 대리자 생성기와 함께 동작하고, 그것이 수십 밀리초 만에 뜨는 컨테이너를 현실적인 목표로 만들어 줍니다. 컨트롤러 액션의 리플렉션 중심 바인딩이 그 앞을 막는 부분이기도 합니다.

## 주의점

- `Program.cs`가 천 줄짜리 파일로 자라는 것을 막아 주는 장치는 없고, 프레임워크가 대신 막아 주지도 않습니다. 규율은 우리 몫입니다. 리소스마다 확장 메서드 하나를 두고, 그 안에 `MapGroup` 하나를 두고, 시작 코드에는 `app.MapOrders()` 한 줄만 둡니다. 이 단계를 건너뛴 팀은 대개 일 년쯤 뒤에 컨트롤러를 다시 발견하고, 같은 교훈의 값을 두 번 치릅니다.
- 익숙하던 관례 가운데 기본으로 오지 않는 것이 있습니다. `[ApiController]`가 모델 검증 실패에서 만들어 주던 자동 `400`은 컨트롤러의 동작입니다. 그래서 최소 엔드포인트의 검증은 우리가 직접 부르거나 필터로 얹거나 선택해서 켜는 내장 검증 지원에서 가져오는 일이 됩니다. 팀이 기대는 관례가 무엇인지 먼저 확인하고 넘어옵니다.
- 엔드포인트 필터는 MVC 필터가 아니라 별개의 체계입니다. `IEndpointFilter`는 라우팅된 엔드포인트 안에서 `EndpointFilterInvocationContext`에 담긴 바인딩된 인자와 함께 돌고, 액션 필터와 리소스 필터와 그 순서 규칙은 컨트롤러 파이프라인의 것입니다. 한쪽을 겨냥해 쓴 예제와 패키지는 다른 쪽에 그대로 들어맞지 않습니다.
- 표면이 크고 관례 중심이라면 정직한 선택은 controllers입니다. 두 모델은 같은 라우팅과 같은 호스트 위에 있으니, 결정의 기준은 어느 쪽이 요즘 방식이냐가 아니라 엔드포인트가 몇 개이고 관례가 얼마나 일해 주기를 바라느냐입니다. 한 애플리케이션에서 둘을 섞는 것도 지원되며, 자라난 서비스에서는 그편이 옳은 답인 경우가 많습니다.

## .NET에서는

- 그룹과 필터를 함께 쓰면 라우팅 표가 읽힙니다. 그룹이 접두사와 횡단 관심사를 쥐고, 확장 메서드가 리소스를 쥐고, `Program.cs`는 애플리케이션이 무엇을 노출하는지 적은 목록으로 남습니다.

```csharp
// OrderEndpoints.cs - 리소스마다 파일 하나, 그것을 매핑하는 메서드 하나.
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        // 그룹에 붙인 것은 그 아래에 더해지는 모든 엔드포인트에 적용됩니다.
        var group = app.MapGroup("/orders")
            .RequireAuthorization()
            .WithTags("Orders");

        group.MapGet("/{id:guid}", (Guid id, IOrderStore store, CancellationToken ct) =>
            store.FindAsync(id, ct));

        // 그래서 검증 필터는 검증할 것이 있는 엔드포인트에 붙입니다.
        // 그룹에 붙이면 GET에도 함께 도는데, 거기에는 찾을
        // OrderInput 인자가 없습니다.
        group.MapPost("/", (OrderInput input, IOrderStore store, CancellationToken ct) =>
                store.CreateAsync(input, ct))
            .AddEndpointFilter<ValidationFilter<OrderInput>>();

        return group;
    }
}

public sealed class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        // 필터는 바인딩된 인자를 봅니다. 미들웨어는 바인딩 전에 돌아서 보지 못합니다.
        if (context.Arguments.OfType<T>().FirstOrDefault() is not { } model)
            return Results.BadRequest();

        return Validate(model) is { Count: > 0 } errors
            ? Results.ValidationProblem(errors)
            : await next(context);
    }
}

// Program.cs는 목차로 남습니다.
app.MapOrders();
```

- 핸들러 매개변수는 어디서나 같은 방식으로 해석됩니다. 라우트 값과 쿼리 문자열과 본문과 컨테이너의 서비스가 타입과 이름으로 바인딩되므로 `Guid id`와 `IOrderStore store`를 받는 핸들러에는 특성이 필요 없고, 관례가 잘못 짚는 경우를 위해 `[FromKeyedServices]`나 명시적인 `[FromBody]`가 준비되어 있습니다.
- `AddOpenApi`와 `MapOpenApi`는 이미 선언해 둔 것에서 문서를 만들어 냅니다. 라우트 패턴과 매개변수 타입과 `TypedResults` 반환 타입이 생성되는 스키마로 그대로 들어가고, 그룹에 붙인 `WithTags`와 `WithName`과 `Produces`가 문서를 손으로 쓰지 않고 빈칸을 채우는 방법입니다.
- 필터 파이프라인은 중첩됩니다. 그룹에 붙인 필터가 개별 엔드포인트에 붙인 필터를 감싸고, 둘 다 라우팅된 엔드포인트 안에서 돌며, 그 전부는 미들웨어 파이프라인이 이 요청은 여기 것이라고 이미 판단한 뒤에 돕니다.
