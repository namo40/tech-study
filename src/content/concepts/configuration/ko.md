---
title: "Configuration"
summary: ".NET의 설정은 여러 공급자를 하나의 키-값 뷰로 합친 결과입니다. 파일과 환경 변수와 명령줄 인자가 정해진 순서로 겹쳐 쌓이고 나중 공급자가 이깁니다. 그래서 같은 바이너리가 어디서나 돌고, 바뀌는 것은 그 아래 깔린 층뿐입니다."
category: ".NET 런타임과 호스팅"
related:
  - label: Environment Variable
    slug: environment-variable
  - label: External Configuration
    slug: external-configuration
  - label: Secret Injection
    slug: secret-injection
  - label: Secret Store
    slug: secret-store
  - label: Feature Flag
    slug: feature-flag
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: Configuration in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration
  - title: Options pattern in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/options
  - title: Configuration in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/
---

## 언제 쓰나

- 호스트가 주는 기본 순서를 그대로 씁니다. 이미 원하는 순서가 들어 있기 때문입니다. `appsettings.json` 다음에 `appsettings.{Environment}.json`, 개발 환경에서는 user secrets, 그다음 환경 변수, 마지막으로 명령줄 인자입니다. 일반적인 것에서 구체적인 것으로, 커밋되는 것에서 주입되는 것으로 이어지고, 각 층은 자기가 지정한 키만 덮어씁니다. 아래 파일을 통째로 갈아 치우지 않습니다.
- 상수를 두 번 적게 되는 순간 꺼냅니다. 두 클래스에 나타난 타임아웃, 큐 이름, 기본 주소는 이미 어긋나기 시작한 값입니다. 가장 싼 해법은 시작할 때 키 하나를 읽어 타입 있는 객체에 바인딩하는 것입니다.
- 같은 산출물이 여러 환경에서 돌아야 할 때 기댑니다. 빌드는 그대로 두고 바깥쪽 층만 달라지므로, 컨테이너 이미지를 환경마다 다시 빌드하지 않고 스테이징에서 운영으로 승격할 수 있습니다.
- 값이 다른 곳에서 온다면 분기 대신 공급자를 붙입니다. Azure App Configuration, Key Vault, 데이터베이스 모두 같은 병합 뷰에 층 하나로 붙습니다. 소비자는 계속 `IOptions<T>`만 읽고 값이 어디서 왔는지는 끝까지 모릅니다.

## 주의점

- 공급자 순서가 곧 우선순위 규칙이고, 이것은 적어 둘 가치가 있습니다. 새벽에 이상한 값을 추적하는 사람에게는 환경 변수가 JSON 파일을 이기고 명령줄이 둘 다 이긴다는 사실이 필요합니다. 급한 상황에서 `Program.cs`를 뜯어보며 알아내는 것과 문서에 적혀 있는 것은 다릅니다.
- 비밀은 어느 환경에서든 `appsettings.json`에 두지 않습니다. 그 파일은 커밋되고 이미지에 복사되고 이슈에 붙여 넣어집니다. 값은 시크릿 저장소에 두거나 배포 시점에 환경 변수로 주입하고, 파일에는 값 없는 키만 남겨 둡니다.
- 없는 키는 조용히 바인딩됩니다. 오타 난 키나 옮겨진 섹션은 속성을 기본값에 그대로 두고, 애플리케이션은 타임아웃이 0인 채로 멀쩡하게 시작합니다. 바인더가 변환하지 못하는 값은 시끄러운 쪽이어서 예외를 던지므로, 우리를 지나쳐 가는 것은 잘못된 타입이 아니라 없는 키입니다. 옵션 클래스에 특성을 달고 `ValidateDataAnnotations().ValidateOnStart()`를 호출해서, 실패가 키 이름이 찍힌 시작 실패로 드러나게 합니다.
- 중첩 키를 환경 변수로 줄 때 구분자는 이중 밑줄입니다. `Logging:LogLevel:Default`는 `Logging__LogLevel__Default`로 설정합니다. 콜론은 셸과 플랫폼에 따라 통하지 않는 곳이 있기 때문입니다. 콜론 표기는 JSON 안과 코드 안에서만 쓰고 변수 이름에는 쓰지 않습니다.

## .NET에서는

- 섹션을 타입 있는 클래스에 바인딩하고 시작할 때 검증합니다. 이것이 옵션 패턴의 전부입니다. 서비스 안에 `IConfiguration`이 없고, 호출부에 문자열 키가 없고, 말이 안 되는 설정으로 시작할 방법도 없습니다.

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection("Payments"))
    .ValidateDataAnnotations()
    // 첫 요청이 아니라 시작 시점에 호스트를 실패시킵니다.
    .ValidateOnStart();

public sealed class PaymentOptions
{
    [Required, Url]
    public string BaseAddress { get; set; } = string.Empty;

    [Range(1, 120)]
    public int TimeoutSeconds { get; set; } = 30;
}
```

- 기본 JSON 공급자는 `reloadOnChange`가 켜져 있지만, 그 변화는 요청한 소비자에게만 닿습니다. `IOptions<T>`는 한 번 계산된 싱글턴이라 생성 당시의 값을 계속 들고 있고, `IOptionsSnapshot<T>`은 스코프 서비스에서 요청마다 다시 계산되며, `IOptionsMonitor<T>`는 싱글턴에 변경 알림을 밀어 줍니다. 셋 중 첫 번째를 골라 놓고 재로딩이 보이기를 기대하는 것은 흔하고 조용한 실망입니다.
- Azure App Configuration은 공급자 하나로 붙고 새로 고침 주기를 함께 가져옵니다. 애플리케이션 입장에서는 같은 병합 뷰라서, 키를 파일에서 서비스로 옮기면 배포 이야기가 달라질 뿐 그 값을 읽는 코드는 그대로입니다.
- 서비스에서는 `IConfiguration`을 주입받지 말고 `IOptions<T>`로 읽습니다. 검증을 가능하게 하고, 키 이름을 한 파일에 모아 두고, 어떤 서비스가 남의 섹션에 조용히 의존하는 일을 막아 주는 것이 바로 타입 있는 객체입니다.
