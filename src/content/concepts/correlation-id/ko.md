---
title: "Correlation ID"
summary: "correlation id는 하나의 업무 흐름이 스치는 모든 것에, 즉 모든 로그 줄과 모든 메시지와 모든 홉에 찍히는 값 하나입니다. 그래서 검색 한 번이면 이야기 전체가 순서대로 돌아옵니다. 트레이싱은 샘플링에 밀려 사라질 수 있지만, 로그 속 id는 언제나 남습니다."
category: "관측 가능성과 운영"
scene: correlation-id
steps:
  - title: "서비스 셋, 이야기 하나, 실은 없음"
    text: "요청 하나가 웹, 주문, 결제를 차례로 지나가고, 각자가 자기 로그를 같은 물줄기에 씁니다. 다른 모두의 로그와 뒤섞인 채로 말입니다. 그 어딘가에서 결제 하나가 실패했습니다. 누구의 것일까요."
  - title: "가장자리에서 태어나 모든 줄에 찍힙니다"
    text: "시스템이 가장 먼저 하는 일은 이 흐름의 id 하나를 만드는 것입니다. 그 뒤로 id는 문장이 아니라 모든 구조화 로그 줄의 이름 붙은 속성이 되고, 뒤섞인 두 흐름은 더 이상 닮아 보이지 않습니다."
  - title: "id는 전송로를 타고 갑니다"
    text: "서비스 사이에서는 헤더로, 큐를 건널 때는 메시지 속성으로 실려 갑니다. 요청의 컨텍스트가 끊기는 비동기 틈을 곧장 통과합니다. 실패한 결제 로그 줄은 이미 실을 쥔 채 도착합니다."
  - title: "필터 하나에 이야기 전체"
    text: "id로 검색하면 흐름이 위에서 아래로 순서대로 읽히고, 실패가 맥락 안에 놓입니다. 트레이싱은 샘플링되므로 바쁜 날 이 흐름의 트레이스는 애초에 만들어지지 않았을 수 있습니다. 로그 속 id는 언제나 버텨 주는 바닥입니다."
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
  - label: Saga
    slug: saga
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging
  - title: "Logging in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/logging/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## 언제 쓰나

- 프로세스를 둘 이상 건너는 흐름이라면 언제나 씁니다. 서비스 두 개가 로그 물줄기 두 개에 쓰기 시작하는 순간, 그 줄들을 다시 한 줄로 세워 줄 수 있는 것은 양쪽이 함께 들고 다니는 값 하나뿐입니다.
- 비동기 경계를 건너는 흐름에도 씁니다. 큐, 백그라운드 작업, 예약된 재시도처럼 일이 실제로 도는 시점에는 그 일을 시작한 요청이 이미 사라지고 없습니다. 그 틈을 건너는 것이 id입니다.
- 당직 업무에도 씁니다. 호출을 받은 사람이 로그 검색창에 가장 먼저 치는 것이 id여야 하므로, 알림에도 오류 응답에도 지원 티켓에도 id가 들어가 있어야 합니다.
- 사용자에게 보이는 실패에도 씁니다. 사용자가 그대로 읽어 줄 수 있는 짧은 id를 건네면 "오늘 아침에 안 됐어요"가 검색 한 번으로 바뀝니다.
- 나중에 되짚어 볼 수도 있는 흐름에도 씁니다. 트레이스는 만료되고 샘플링에 걸러지지만 로그는 보통 더 오래, 더 온전히 남습니다. 그래서 같은 요청이라도 로그 속 id가 트레이스보다 오래 살아남습니다.

## 주의점

- id는 가장자리에서, 한 곳에서, 다른 무엇보다 먼저 부여합니다. 중간에 만든 id는 이야기의 절반만 덮고, 부품 둘이 각자 자기 id를 만들면 영영 만나지 않는 반쪽짜리 이야기 둘이 생깁니다.
- 들어오는 id는 신뢰하는 호출자에게서만 받습니다. 헤더에 담겨 온 것을 그대로 되뿌리는 공개 엔드포인트는 아무나 로그 검색을 오염시키거나 남의 흐름에 일부러 끼어들 수 있는 통로가 됩니다.
- correlation id는 trace id가 아닙니다. trace id는 트레이스 하나의 것이고 그 트레이스와 함께 끝납니다. correlation id는 업무 흐름의 것이라서 트레이스 여러 개와 재시도 몇 번, 큐에서 보낸 하룻밤을 넘겨 살아남습니다. 둘 다 기록하고, 한쪽을 다른 쪽인 척하는 대신 둘 사이의 관계를 기록합니다.
- 문장 안에 녹여 넣지 말고 구조화된 속성으로 남깁니다. `"order {OrderId} failed for {CorrelationId}"`를 문자열로 미리 조립해 버리면 로그 저장소가 색인할 수 없는 값이 되고, 검색은 전체를 훑는 부분 문자열 스캔으로 바뀝니다.
- 백그라운드 작업에는 id를 명시적으로 실어 보냅니다. `ILogger` 스코프와 `Activity`는 요청 하나의 비동기 흐름을 따라가지만, 큐에 건넨 메시지는 새로운 흐름을 시작합니다. 그래서 id를 메시지에 적어 보내고 받는 쪽에서 다시 읽어 내야 합니다.
- 값은 짧고 불투명하고 눈으로 읽을 수 있게 둡니다. 티켓에 인용되고 전화로 불러 주고 검색창에 붙여 넣는 값이므로, 중괄호까지 붙은 GUID보다 짤막한 16진 문자열이 낫습니다.
- 의미 있는 정보는 id 안에 넣지 마세요. 고객 번호를 담은 id는 모든 로그 줄과 모든 메시지 헤더, 그리고 호출하는 모든 외부 서비스에 개인 식별자를 흘리는 셈입니다.

## .NET에서는

일은 두 장치가 나눠 합니다. id가 무엇인지 정하는 미들웨어, 그리고 요청 안에서 쓰이는 모든 줄이 호출 지점마다 id를 언급하지 않고도 id를 달고 나가게 만드는 로깅 스코프입니다.

```csharp
public sealed class CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
{
    private const string Header = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext context)
    {
        // Trust an inbound id only from callers inside the boundary.
        var inbound = context.Request.Headers[Header].ToString();
        var id = context.User.Identity?.IsAuthenticated == true && !string.IsNullOrEmpty(inbound)
            ? inbound
            : Activity.Current?.TraceId.ToString()[..8] ?? Guid.NewGuid().ToString("n")[..8];

        context.Response.Headers[Header] = id;
        Activity.Current?.SetBaggage("correlation.id", id);

        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        {
            await next(context);
        }
    }
}
```

중요한 것은 딕셔너리를 넘긴 `BeginScope`입니다. 구조화 로깅을 이해하는 공급자라면 스코프의 키와 값을 그 안에서 쓰인 모든 줄에 붙여 주므로, `CorrelationId`가 질의로 걸러 낼 수 있는 진짜 열이 되고 요청 안 어떤 `ILogger` 호출도 id를 언급할 필요가 없어집니다. 대신 조립된 문자열을 `BeginScope`에 넘기면 아무것도 색인할 수 없는 스코프가 남습니다. 눈에는 보이지만 검색은 되지 않는 id가 생기는 가장 흔한 경로가 이것입니다.

트레이싱과의 관계는 의식하고 정해 둘 만합니다. `Activity.Current.TraceId`는 값의 출처로 충분히 훌륭하고, 여기서 파생시켜 두면 로그의 한 줄과 트레이싱 백엔드의 span을 나란히 놓을 수 있습니다. 그래도 같은 식별자는 아닙니다. 트레이스는 요청이 끝나면 끝나지만 흐름은 재시도 세 번을 거쳐 두 시간을 더 돌 수도 있습니다. `TraceId`와 `CorrelationId`를 둘 다 남기면 한쪽이 다른 쪽을 대신하지 않고도 두 시야가 계속 이어집니다.

큐를 건널 때는 id를 메시지에 적어야 합니다. `Activity.Current`는 그 홉을 넘지 못하기 때문입니다. Azure Service Bus에는 `ServiceBusMessage.CorrelationId`라는 제자리가 있고, 그 밖에 싣고 싶은 것은 `ApplicationProperties`가 받아 줍니다. RabbitMQ에는 `IBasicProperties.CorrelationId`와 헤더 테이블이 있습니다. 소비자 쪽에서는 그것을 다시 읽어 핸들러가 돌기 전에 같은 종류의 스코프를 엽니다. 그래야 워커가 새벽 세 시에 쓴 줄들이 그 일을 큐에 넣은 요청과 같은 검색 결과에 들어옵니다.

```csharp
var message = new ServiceBusMessage(body) { CorrelationId = id };
message.ApplicationProperties["correlation.id"] = id;
```

Serilog, NLog, OpenTelemetry 로깅 익스포터는 모두 `ILogger` 스코프를 읽으므로 위 미들웨어는 공급자를 가리지 않습니다. 다른 것은 보강 방식입니다. Serilog는 `LogContext`로 명시적인 스코프 없이도 같은 속성을 밀어 넣을 수 있고, `AddOpenTelemetry(o => o.IncludeScopes = true)`는 스코프 값이 나가는 길에 버려지지 않고 OTLP 수집기까지 닿게 해 주는 설정입니다.
