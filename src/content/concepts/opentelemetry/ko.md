---
title: "OpenTelemetry"
summary: "OpenTelemetry는 trace와 메트릭과 로그를 위한 벤더 중립 표준입니다. API도 하나, 전송 형식도 하나, 전파되는 컨텍스트도 하나여서, 계측은 한 번만 작성하고 그것을 저장할 백엔드는 배포 시점의 선택으로 남습니다."
category: "관측 가능성과 운영"
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Baggage
    slug: baggage
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: ActivitySource
    slug: activitysource
references:
  - title: OpenTelemetry Documentation
    url: https://opentelemetry.io/docs/
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

## 언제 쓰나

- 계측이 벤더보다 오래 남기를 바랄 때 도입합니다. 백엔드가 바뀌어도 코드가 내보내는 span과 메트릭은 그대로이고, 움직이는 것은 익스포터 설정뿐입니다. 이것이 약속의 전부이고, 계약 갱신 시점이 아니라 그전에 갖춰 두는 편이 좋습니다.
- trace와 메트릭과 로그가 함께 한 질문에 답해야 할 때 꺼냅니다. trace와 로그는 같은 trace id를 달고 있으므로, 느린 요청 하나를 span 트리로 펼치고 그 요청이 남긴 로그 줄까지 이어 볼 수 있습니다. 손으로 타임스탬프를 맞출 필요가 없습니다. 메트릭은 집계값이라 trace id를 아예 달지 않습니다. 지연 히스토그램에서 예시 요청으로 되짚어 가는 연결은 exemplar이고, SDK는 그것을 켰을 때만 붙입니다.
- 요청이 서로 다른 언어로 쓰인 서비스들을 넘나들 때 씁니다. 전파 형식이 어디서나 같아서 .NET 게이트웨이가 Python 워커를 부르고 그 워커가 Java 서비스를 불러도 trace 하나가 나옵니다. 서로 무관한 trace 세 개가 아닙니다. 사내 계측 라이브러리가 더 싸다는 말이 멈추는 지점이 여기입니다.
- 여러 팀이 같은 것을 다르게 부르고 있다면 표준으로 삼습니다. 시맨틱 컨벤션은 HTTP와 데이터베이스와 메시징 작업의 속성 이름을 정해 주고, 이름이 공유되어야 대시보드를 다른 서비스로 옮길 수 있습니다.

## 주의점

- 명세와 SDK이지 데이터를 두는 곳이 아닙니다. OpenTelemetry는 신호를 만들고 내보내는 데까지 하고, 어디에 저장할지와 얼마나 보관할지와 쿼리 비용이 얼마인지는 여전히 우리가 정합니다. 백엔드를 늦게 고르면 보관 비용도 늦게 알게 됩니다.
- 카디널리티는 그대로 우리 몫입니다. SDK는 사용자 ID나 전체 URL이 태그로 붙은 메트릭도 군말 없이 기록하고, 그 비용은 트래픽에 따라 늘어나는 시계열 개수로 백엔드에 나타납니다. 속성 값은 범위가 정해진 집합으로 유지하고, 범위가 열린 식별자는 원래 자리인 span에 붙입니다.
- 대시보드가 기대는 시맨틱 컨벤션 버전은 고정해 둡니다. 릴리스를 거치며 속성 이름이 바뀐 적이 있고, 태그 이름을 바꾸는 업그레이드는 오류가 아니라 빈 시계열을 돌려주며 조용히 쿼리를 망가뜨립니다.
- 내보내기는 배치로 하고 핫 패스는 거기서 빼 둡니다. 배치 프로세서는 span을 백그라운드 익스포터에 넘겨 요청 스레드가 컬렉터를 기다리지 않게 하고, 단순 프로세서는 그 자리에서 내보내므로 테스트에서나 적당합니다. 컬렉터에 닿지 않을 때 나빠지는 것은 버려지는 텔레메트리여야 하고, 막히는 요청이어서는 안 됩니다.

## .NET에서는

- 계측 API는 기본 클래스 라이브러리이고 OpenTelemetry는 내보내는 경로입니다. `ActivitySource`가 span을 만들고 `Activity`가 곧 span이며 `Meter`가 계기를 만듭니다. 전부 패키지 참조 없이 존재하는 `System.Diagnostics` 타입입니다. OpenTelemetry는 여기에 구독해서 나온 것을 실어 보냅니다. 라이브러리를 계측해도 그 라이브러리가 OpenTelemetry에 의존하지 않는 이유가 이것입니다.
- 등록은 빌더 하나에 가지 둘이고, 익스포터는 양쪽에 같은 이름으로 한 번씩 붙습니다.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("checkout"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        // 우리가 만드는 span: 패키지가 아니라 ActivitySource 이름.
        .AddSource("Contoso.Checkout")
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        // .NET 9 이상은 런타임 메트릭을 패키지가 아니라 내장 Meter로 내보낸다.
        .AddMeter("System.Runtime")
        .AddOtlpExporter());
```

- 내장 계측이 우리가 무엇을 쓰기 전에 경계부터 덮어 줍니다. ASP.NET Core는 서버 span과 `http.server.request.duration` 히스토그램을 만들고, `HttpClient`는 서비스와 서비스를 잇는 클라이언트 span을 만들며, .NET 9 이상에서는 런타임이 자체 `System.Runtime` `Meter`를 내보내므로 가비지 컬렉션과 스레드 풀 메트릭에는 패키지 참조가 아니라 `AddMeter` 한 줄이 필요합니다. `OpenTelemetry.Instrumentation.Runtime`의 `AddRuntimeInstrumentation`은 .NET 8 이하에서 여전히 필요한 쪽입니다. 어느 쪽이든 쓸 만한 첫 trace는 설정만으로 나옵니다.
- 로그는 `ILogger`를 통해 같은 파이프라인에 합류합니다. OpenTelemetry 로깅 공급자를 붙이면 모든 로그 레코드에 현재 trace id와 span id가 찍히고, 이것이 구조화 로깅을 별도 보관소에서 같은 요청의 또 다른 화면으로 바꿔 줍니다.
