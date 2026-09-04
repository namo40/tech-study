---
title: "Dependency Injection"
summary: "Dependency Injection은 요청과 제작을 분리합니다. 클래스는 필요한 것을 선언하고, 컨테이너 한곳이 무엇을 어떻게 만드는지 알며, 요청마다 그래프가 주문대로 조립됩니다. 그리고 모든 인스턴스의 수명(singleton, scoped, transient)은 먼저 new를 부른 쪽이 아니라 등록이 정합니다."
category: ".NET 런타임과 호스팅"
scene: dependency-injection
steps:
  - title: "new는 설계를 손으로 배선합니다"
    text: "고스트는 각 클래스가 자기 의존을 직접 만드는 것을 보여 줍니다. 그 의존들도 저마다의 의존을 만들며, 선택이 그래프 깊숙이 배선됩니다. 구현 하나를 바꾸면 불이 들어온 자리 전부가 손댈 곳이고, 클래스 하나를 테스트하려 하면 나무 전체가 따라옵니다. 해법은 분리 하나입니다. 클래스는 필요를 선언하고, 제작은 한곳이 합니다."
  - title: "컨테이너는 그래프를 주문대로 조립합니다"
    text: "등록은 계약을 구현에 잇습니다. 요청이 오면 컨테이너가 생성자 사슬을 따라가며 각 조각이 선언한 필요를 만들어 채웁니다. 어느 클래스도 다른 클래스가 무엇으로 만들어졌는지 모릅니다. 구현 교체는 이제 등록 한 줄이고, 그래프는 스스로 다시 조립되며, 테스트도 같은 길로 가짜를 건네줍니다."
  - title: "수명은 등록이 정합니다"
    text: "요청 둘을 돌리고 칸을 세어 보세요. singleton은 한 인스턴스로 둘 다 답하고, scoped는 요청마다 하나를 만들고, transient는 주입마다 하나를 만듭니다. 같은 클래스, 세 개의 증가 곡선. 그리고 그 선택은 타입이 쓰이는 곳이 아니라 등록되는 곳에서 내려집니다. 수명 버그 대부분은 그 두 자리의 어긋남입니다."
  - title: "컨테이너에도 자기 삶이 있습니다"
    text: "시작할 때 한 번 지어지고, 등록은 닫히고, 실수는 새벽 세 시가 아니라 이 자리에서 드러납니다. 요청마다 스코프가 열리고 닫히며 scoped 인스턴스들을 데려갑니다. 종료할 때는 만든 순서의 역순으로 정리가 돕니다. 애플리케이션의 수명이 곧 컨테이너의 수명이고, 나머지 전부는 그 스코프 중 하나 안에서 삽니다."
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: IHostedService
    slug: ihostedservice
  - label: Background Service
    slug: background-service
  - label: DbContext
    slug: dbcontext
  - label: Unit of Work
    slug: unit-of-work
  - label: Application Lifetime
    slug: application-lifetime
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Dependency injection in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview
  - title: Dependency injection guidelines
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines
  - title: Dependency injection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection
---

## 언제 쓰나

- ASP.NET Core에서는 이미 기본값이라, 쓸지 말지가 아니라 무엇을 얻는지가 실제 질문입니다. 프레임워크가 컨트롤러, 최소 API 처리기, 필터, 호스티드 서비스를 모두 컨테이너에서 만들어 내므로 생성자 주입에는 추가 비용이 없고, 다른 방식은 프레임워크를 거슬러 헤엄치는 일이 됩니다. 클래스가 필요한 것을 생성자에 선언하고, 그것이 어디서 오는지는 생각하지 않으면 됩니다.
- 같은 계약에 정직한 구현이 둘 이상 있을 때가 등록을 꺼낼 자리입니다. 운영에서는 진짜 메일 발송기를, 테스트에서는 기록만 하는 가짜를 쓰거나, 실제 시계와 고정된 시계를 나눠 쓰거나, 클라우드 저장소를 로컬에서 폴더로 대체하는 경우입니다. 시험 대상 클래스는 그대로이고 차이는 컴포지션 루트의 한 줄입니다. 이것이 일상적인 이득이며, 테스트 가능성과 교체 가능성이 같은 성질을 두 각도에서 본 것인 이유입니다.
- 횡단 관심사는 상속이 아니라 조합으로 얹습니다. 처리기를 재시도로 감싸는 데코레이터, 핸들러 사슬을 가진 타입 지정 `HttpClient`, `IEnumerable<IValidator<T>>`로 해석되는 검증기 묶음이 모두 등록 시점의 배치이고, 감싸이는 클래스는 자기가 감싸였다는 사실을 알 필요가 없습니다.
- 설정도 옵션 패턴을 통해 같은 길로 들어오게 합니다. `IOptions<T>`와 그 스냅숏, 모니터 변형은 설정을 주입된 의존으로 표현한 것입니다. 덕분에 클래스가 설정 시스템을 직접 읽지 않게 되고, 그 설정값은 다른 의존과 똑같이 테스트에서 갈아 끼울 수 있게 됩니다.
- 그래프가 두 단계보다 깊어지는 순간부터 컨테이너는 값을 합니다. 클래스가 셋뿐인 작은 콘솔 도구라면 `Main`에서 손으로 잇는 것도 정당한 컴포지션 루트이고, 그것을 하려고 컨테이너가 필요하지는 않습니다. 컨테이너가 사 주는 것은 네 번째 단계가 생겨도 세 번째 단계가 바뀌지 않는다는 점입니다.

## 주의점

- 캡티브 의존은 이 페이지가 존재하는 이유입니다. scoped 서비스를 singleton에 주입하면, singleton은 처음 건네받은 인스턴스를 붙잡아 프로세스가 살아 있는 내내 들고 있습니다. `DbContext`가 대표적인 피해자입니다. scoped로 등록된 데는 이유가 있고, 스레드 안전하지 않으며, singleton이 하나를 쥐는 순간 요청 단위 작업 단위였던 것이 변경 추적기가 끝없이 커지는 공유 객체가 되어 낡은 엔터티와 요청 간 오염을 만듭니다. 의존은 자기를 쥔 것보다 오래 살면 안 됩니다.
- 스코프 검증이 이것을 대신 잡아 주지만, 켜져 있을 때만 그렇습니다. 기본 컨테이너는 Development 환경에서만 스코프를 검증하고 Production에서는 검증하지 않으므로, 로컬에서 한 번도 밟지 않은 경로가 만든 캡티브 의존은 그대로 배포됩니다. 테스트가 도는 환경에서 `ValidateScopes`와 `ValidateOnBuild`를 명시적으로 켜세요. 그러면 이 결함은 은근한 운영 버그에서 CI의 시작 예외로 자리를 옮깁니다.
- singleton이 정말로 scoped 서비스를 필요로 한다면 `IServiceScopeFactory`를 주입해 작업 단위마다 스코프를 엽니다. 백그라운드 코드에서 이미 쓰이는 실무 방식이고, 호스티드 서비스가 반복마다 하는 일이 바로 이것이며, Background Service 페이지가 적용 쪽에서 그리는 그림도 같습니다. 스코프를 만들고, 그 안에서 해석하고, 일을 하고, 스코프를 버립니다. 해석한 인스턴스를 스코프 밖으로 들고 나가지 마세요.
- `IServiceProvider`를 주입해 클래스 안에서 `GetService`를 부르면, 걷어냈던 배선을 제자리에 돌려놓는 셈이 됩니다. 의존이 생성자에서 보이지 않게 되고, 빠진 것이 있어도 컴파일러가 알려 주지 못하며, 테스트는 객체를 건네는 대신 컨테이너를 지어야 합니다. 프레임워크가 직접 넘겨주는 자리이면서 실행 시점까지 타입을 알 수 없는 경우에만 프로바이더를 쓰고, 그 밖에는 필요한 것 자체를 요청합니다.
- 패턴이 그렇게 하라고 해서 모든 클래스에 인터페이스를 하나씩 등록하는 것은 의례입니다. 구현이 정확히 하나뿐이고, 두 번째 구현이 보이지도 않고, 그것을 가짜로 바꾸는 테스트도 없는 인터페이스는 아무 이유 없이 관리하는 파일입니다. 구체 타입을 등록하면 됩니다. 인터페이스는 나중에 넣어도 작고 기계적인 변경이며, 미리 넣으면 모든 스택 추적에 간접 계층 하나가 얹힙니다.
- 해제는 소유를 따라가고, 만든 순서의 역순으로 돕니다. 컨테이너는 자기가 만든 것을, 스코프는 스코프가 만든 것을 해제하고, `new`로 직접 지어서 등록에 건넨 것은 직접 해제해야 합니다. 루트 프로바이더에서 해석한 `IDisposable` transient는 루트가 붙잡아 종료 시점까지 놓지 않는데, 이는 누수처럼 보이고 실제로도 누수입니다.
- 비동기 해제에는 비동기 스코프가 필요합니다. `IAsyncDisposable`을 구현한 서비스를 동기적으로 버린 스코프 안에서 해석했다면 예외가 나거나 블로킹 해제로 물러섭니다. 스코프에는 `await using`을, 프로바이더에는 `DisposeAsync`를 씁니다. 스코프를 프레임워크가 아니라 직접 만드는 백그라운드 루프에서 특히 틀리기 쉽습니다.
- 수명 표는 외울 만큼 짧고, 버그 대부분은 그 표의 한 줄입니다. singleton 안의 transient는 합법이지만 얼어붙습니다. 등록이 무엇이라 말하든 프로세스가 사는 동안 인스턴스는 하나입니다. singleton 안의 scoped는 버그입니다. 무엇 안의 singleton이든 괜찮습니다. scoped 안의 scoped는 같은 스코프를 공유하므로 괜찮습니다. 나머지는 전부 지금 내가 어느 스코프 안에 있는가 하는 질문입니다.

## .NET에서는

등록은 메서드 셋이고, 셋의 차이는 그것이 만든 것이 얼마나 오래 사는지뿐입니다.

```csharp
// 애플리케이션 전체에 하나. 스레드 안전해야 하고,
// 자기보다 짧게 사는 것을 쥐고 있으면 안 됩니다.
builder.Services.AddSingleton<IClock, SystemClock>();

// 스코프마다 하나. 웹 애플리케이션에서는 요청마다 하나라는 뜻입니다.
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddDbContext<ShopContext>(options => options.UseSqlServer(cs));

// 주입될 때마다 새 인스턴스. 값싸고, 상태가 없고, 공유되지 않습니다.
builder.Services.AddTransient<IPriceCalculator, PriceCalculator>();
```

이것들을 이름으로 찾아 쓰는 곳은 없습니다. 클래스는 생성자에 필요를 선언하고, 컨테이너가 채웁니다.

```csharp
public sealed class CheckoutService(
    IOrderRepository orders,
    IPriceCalculator prices,
    IClock clock)
{
    public async Task<Receipt> PlaceAsync(Cart cart, CancellationToken token) =>
        await orders.SaveAsync(prices.Total(cart), clock.UtcNow, token);
}
```

빌드 실패가 운영 사고보다 싼 환경이라면 어디서든 검증을 켭니다.

```csharp
builder.Host.UseDefaultServiceProvider((context, options) =>
{
    // singleton이 붙잡은 scoped 서비스를 잡아내고,
    // 그것을 어쩌다 닿은 첫 요청이 아니라 시작 시점에 잡아냅니다.
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

singleton이 scoped인 것을 필요로 하면, 하나를 쥐고 있는 대신 자기 스코프를 엽니다.

```csharp
public sealed class OutboxPump(IServiceScopeFactory scopeFactory)
{
    public async Task PumpAsync(CancellationToken token)
    {
        // 반복마다 스코프 하나. DbContext는 요청 안에서 그러듯이
        // 이 안에서 태어나고 이 안에서 죽습니다.
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ShopContext>();
        await db.DispatchPendingAsync(token);
    }
}
```

나머지는 호스트의 몫입니다. `IHostApplicationLifetime`이 시작, 중지 요청, 중지 완료 이벤트를 주고, `builder.Services.Configure<T>`와 `IOptions<T>`가 설정을 다른 것과 같은 주입된 의존으로 만들며, `IHost.StopAsync`가 컨테이너를 해제하면서 아직 쥐고 있던 것을 만든 순서의 역순으로 놓습니다. 애플리케이션의 수명이 곧 컨테이너의 수명이고, 나머지 전부는 그 스코프 중 하나 안에서 삽니다.
