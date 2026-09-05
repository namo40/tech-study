---
title: "Controllers"
summary: "Controllers는 ASP.NET Core의 클래스 기반 API 모델입니다. 액션을 타입 하나에 모으고, 같은 엔드포인트 라우팅 위에 특성 라우팅을 얹고, 인증과 검증과 오류 처리를 되풀이되는 코드가 아니라 필터 파이프라인의 계층으로 만듭니다."
category: ".NET 런타임과 호스팅"
related:
  - label: Minimal APIs
    slug: minimal-apis
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: Create web APIs with ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-10.0
---

## 언제 쓰나

- 표면이 커져서 관례가 값을 하기 시작할 때 꺼냅니다. 여러 리소스에 걸쳐 액션이 수십 개가 되면, 특성 라우팅을 쓴 리소스별 클래스가 모든 엔드포인트에 같은 모양을 줍니다. 새로 합류한 사람이 URL만 보고도 그것이 어디 있는지 짐작할 수 있게 됩니다. 짐작 가능성이 관례가 파는 물건이고, 엔드포인트가 많을수록 값이 올라갑니다.
- 인증과 검증과 감사와 예외 처리가 핸들러마다 되풀이되는 줄이 아니라 계층이어야 할 때 씁니다. 권한 부여 필터, 액션 필터, 결과 필터, 예외 필터가 정해진 순서로 액션을 감싸고, 전역이나 컨트롤러 단위나 액션 단위로 걸리며, 단위 테스트할 수 있는 평범한 클래스입니다.
- API 관례를 한 묶음으로 켜고 싶을 때 `[ApiController]`에 기댑니다. 특성 라우팅이 필수가 되고, 매개변수 바인딩이 특성 없이 출처를 추론하며, 모델 검증에 실패한 요청은 액션 본문이 돌기 전에 `400`으로 답을 받습니다.
- 팀이 이미 MVC로 생각하고 있을 때 고릅니다. 가지고 있는 필터와 모델 바인더와 관례, 십 년쯤 쌓인 익숙함은 실제 자산입니다. 큰 표면이라면 아무도 자신 있게 돌아다니지 못하는 새로운 방식보다 팀이 이미 읽는 방식으로 쓰인 편이 나은 결과입니다.

## 주의점

- 액션마다 붙는 기계 장치가 있고, 핫 패스에서는 그 값이 측정에 잡힙니다. 액션 선택과 모델 바인딩과 필터 호출과 결과 실행이 요청마다 각자의 비용을 치르므로, 부하가 큰 아주 작은 서비스라면 minimal APIs가 그 계층을 통째로 피합니다. 데이터베이스와 네트워크 시간이 대부분을 차지하는 평범한 API에서는 그 차이가 잡음 수준입니다.
- 액션이 마흔 개인 컨트롤러는 라우팅 특성이 붙은 거대 클래스일 뿐입니다. 처방도 늘 하던 것과 같습니다. 동사가 아니라 리소스로 쪼개고, 로직은 액션이 부르는 서비스로 밀어내고, 컨트롤러는 HTTP와 도메인 사이의 얇은 번역으로 둡니다. 컨트롤러를 쓸모 있게 만드는 것도 읽기 어렵게 만드는 것도 같은 성장이고, 갈라놓는 사람이 있느냐가 갈림길입니다.
- 자동 `400`은 편리하지만 오류 이야기의 전부는 아닙니다. `[ApiController]`는 액션이 돌기 전에 유효하지 않은 `ModelState`를 `ValidationProblemDetails` 응답으로 바꿔 줍니다. 이것은 오류 형식을 통일한다는 약속보다 좁은 약속입니다. 처리되지 않은 예외와 상태 코드만 있는 응답까지 포함해 모든 실패가 `application/problem+json`으로 돌아오게 하려면 `AddProblemDetails`와 그 위에 얹는 예외 처리 설정이 필요합니다.
- 두 모델 사이의 선택은 이념이 아니라 표면 크기와 관례가 얼마나 필요한가의 문제입니다. 둘 다 같은 엔드포인트 라우팅 위에 서 있고 같은 미들웨어 파이프라인을 지나고 같은 서버가 호스팅하므로, 한 애플리케이션이 웹훅에는 최소 엔드포인트를 매핑하고 본 API에는 컨트롤러를 쓰는 데에 아무 모순이 없습니다.

## .NET에서는

- `[ApiController]`와 특성 라우팅이 표준 모양이고, 자동 검증 응답은 관례가 없었다면 액션마다 되풀이했을 일을 관례가 대신해 주는 자리입니다.

```csharp
[ApiController]
[Route("api/[controller]")]                 // -> /api/orders
public class OrdersController(IOrderStore store) : ControllerBase
{
    // ActionResult<T>는 페이로드 타입과 상태 코드를 둘 다 드러내 두고,
    // OpenAPI 생성이 읽는 것도 그것입니다. CancellationToken
    // 매개변수는 HttpContext.RequestAborted에 바인딩됩니다.
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Order>> Get(Guid id, CancellationToken ct) =>
        await store.FindAsync(id, ct) is { } order ? Ok(order) : NotFound();

    // [ApiController]가 붙어 있으면 잘못된 모델은 이 본문이 돌기 전에
    // ValidationProblemDetails와 함께 400으로 답합니다. 여기서 ModelState를
    // 확인하는 것은 죽은 코드입니다.
    [HttpPost]
    public async Task<ActionResult<Order>> Create(OrderInput input, CancellationToken ct)
    {
        var created = await store.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }
}
```

- 필터는 그 필터의 범위가 있는 자리에 등록합니다. `builder.Services.AddControllers(o => o.Filters.Add<AuditFilter>())`는 모든 액션에 걸고, 클래스에 붙인 특성은 컨트롤러 하나로 범위를 좁히며, `[ServiceFilter]`는 필터를 컨테이너에서 해석해 의존성을 받을 수 있게 합니다.
- 나머지 실패를 하나로 묶는 것은 `AddProblemDetails`입니다. 한 번 등록해 두면 상태 코드만 있는 응답과 처리되지 않은 예외가 자동 검증 응답과 같은 `application/problem+json` 모양으로 돌아오고, 클라이언트는 세 가지 오류 형식 대신 하나만 해석하면 됩니다.
- 컨트롤러와 최소 엔드포인트는 한 애플리케이션 안에 함께 삽니다. `app.MapControllers()`와 `app.MapGroup("/hooks")`는 같은 라우팅 표에 더해지고, 그 앞의 미들웨어 파이프라인은 어느 모델이 그 엔드포인트를 만들었는지 알지도 못하고 신경 쓰지도 않습니다.
