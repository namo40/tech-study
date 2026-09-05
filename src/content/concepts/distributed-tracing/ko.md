---
title: "Distributed Tracing"
summary: "Distributed tracing은 요청 하나가 거쳐 간 모든 서비스를 따라갑니다. trace id가 요청과 함께 이동하고, 홉마다 자기 시작과 끝을 가진 span을 기록하며, 그 span들이 모여 시간이 실제로 어디에 쓰였는지 보여 주는 타임라인이 됩니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
steps:
  - title: "로그는 셋, 답은 없음"
    text: "요청이 서비스 셋을 거쳐 느리게 돌아옵니다. 각 서비스가 무언가 남겼지만 세 줄을 묶어 주는 것이 없어서, 어느 홉이 시간을 썼는지 아무도 말할 수 없습니다."
  - title: "id 하나, span 여럿"
    text: "gateway가 trace id를 만들어 헤더에 실어 보냅니다. 홉마다 자기 시작과 끝을 가진 span을 기록합니다. 시간 순으로 펼치면 800ms가 payments 안에 있다는 것이 보입니다."
  - title: "메시지를 넘어서"
    text: "컨텍스트는 HTTP 헤더뿐 아니라 메시지 헤더에도 실리므로, 나중에 작업을 꺼내는 worker도 같은 trace에 속합니다. 중첩이 아니라 link로 이어집니다. baggage는 테넌트 같은 키와 값 몇 개를 끝까지 실어 나릅니다."
  - title: "샘플링"
    text: "모든 trace를 남기면 지켜보는 시스템보다 비용이 더 듭니다. head 샘플링은 시작에서 정하니 싸지만 딱 하나뿐인 느린 요청을 버릴 수 있습니다. tail 샘플링은 끝에서 정해 오류와 이상치를 남깁니다."
related:
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
  - label: Correlation ID
    slug: correlation-id
  - label: Structured Logging
    slug: structured-logging
  - label: Sampling
    slug: sampling
  - label: Tail Latency
    slug: tail-latency
  - label: Competing Consumers
    slug: competing-consumers
references:
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## 언제 쓰나

- 프로세스 경계를 넘는 요청이라면 무엇이든 해당합니다. gateway에서 서비스로, 서비스에서 서비스로, 큐를 지나 worker로 가는 경우입니다. 로그 파일 하나가 이야기 전체를 담지 못하게 되는 순간부터, 그것을 다시 이어 붙이는 일이 추적입니다.
- 지연 조사를 할 때 씁니다. waterfall은 "어느 홉인가"에 몇 초 만에 답하지만, 로그 파일 셋과 타임스탬프만으로는 한나절이 걸리고 그마저도 부정확합니다.
- 호출 사슬을 가로지르는 오류의 원인을 짚을 때 씁니다. 실패를 보고한 서비스가 실패를 일으킨 서비스인 경우는 드뭅니다.
- 의존 관계 지도와 서비스 수준 목표를 만들 때 씁니다. 둘 다 이미 기록하고 있던 span에서 그대로 나오므로 별도의 계측이 필요 없습니다.

## 주의점

- W3C `traceparent` 헤더는, `baggage`를 쓴다면 그것도 함께, 모든 외부 호출과 모든 발행 메시지에 실어 보냅니다. 이를 흘리는 홉이 하나만 있어도 trace는 서로 무관한 두 조각으로 끊어지고, 그 끊김은 찾아 나서기 전까지 보이지 않습니다.
- span은 로그가 아닙니다. span에는 속성 몇 개만 담고 세부 내용은 trace id로 상관 지은 로그에 둡니다. 속성 쉰 개짜리 span은 모든 요청마다, 그리고 앞으로 계속 비용을 부릅니다.
- 샘플링은 의도를 가지고 정합니다. 엣지의 head 샘플링은 양을 줄여 주지만 그 요청이 흥미로운지 알기 전에 결정합니다. 컬렉터의 tail 샘플링은 버퍼 비용이 들지만 오류와 느린 호출을 남깁니다. 대부분의 시스템에는 둘 다 필요합니다.
- baggage는 컨텍스트가 가는 곳이면 어디든 따라가며, 여기에는 호출하는 외부 업체까지 포함됩니다. 짧은 키 몇 개로 제한하고, 비밀이나 개인 정보는 절대 넣지 않습니다.
- 사용자 정의 span을 쓰기 전에 내장 계측부터 씁니다. ASP.NET Core, `HttpClient`, EF Core, 주요 메시징 라이브러리는 이미 부모가 제대로 붙은 좋은 이름의 span을 만들어 주고, 직접 만든 span은 대개 그것을 중복해서 만들 뿐입니다.
- 큐를 건너간 trace는 부모 자식이 아니라 link입니다. 소비자는 발행한 span이 닫히고 한참 뒤에 시작하는 일이 많아서, 억지로 중첩시키면 몇 시간짜리로 보이는 span이 생깁니다.

## .NET에서는

.NET은 추적을 기반 클래스 라이브러리에 두고 있습니다. `System.Diagnostics`의 `Activity`와 `ActivitySource`가 API이고, OpenTelemetry는 그 위에 얹히는 구성과 내보내기 계층입니다. 그래서 BCL만 참조하는 라이브러리도 trace에 그대로 나타납니다.

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("orders"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("Shop.Orders")
        .AddOtlpExporter());

// 내장 요청 span 안에 두는 사용자 정의 span.
private static readonly ActivitySource Source = new("Shop.Orders");

public async Task PlaceAsync(Order order, CancellationToken ct)
{
    using var activity = Source.StartActivity("place order", ActivityKind.Producer);
    activity?.SetTag("order.id", order.Id);
    Baggage.SetBaggage("tenant", order.TenantId);

    // 소비자가 같은 trace를 이어 가도록 컨텍스트를 메시지에 싣는다.
    // 듣는 쪽이 없으면 StartActivity가 null을 돌려주므로 여기서 절대 역참조하지 않는다.
    var spanContext = activity?.Context ?? Activity.Current?.Context ?? default;
    var headers = new Dictionary<string, string>();
    Propagators.DefaultTextMapPropagator.Inject(
        new PropagationContext(spanContext, Baggage.Current), headers,
        (carrier, key, value) => carrier[key] = value);
    await bus.PublishAsync(new OrderPlaced(order.Id), headers, ct);
}
```

`AddAspNetCoreInstrumentation`은 들어오는 요청에서 `traceparent`를 읽어 요청 span을 보낸 쪽의 자식으로 만들고, `AddHttpClientInstrumentation`은 나가는 모든 호출에 그 헤더를 다시 써 줍니다. 그래서 HTTP로만 이어진 사슬에는 전파 코드가 아예 필요 없습니다. `AddSource`에 넘기는 `ActivitySource` 이름은 코드가 만드는 이름과 같아야 하며, 다르면 사용자 정의 span은 만들어지자마자 버려집니다.

메시지를 받는 쪽에서는 `Propagators.DefaultTextMapPropagator.Extract`로 헤더를 다시 읽고, `ActivityKind.Consumer`로 activity를 시작합니다. 그 작업이 큐에 넣은 요청과 정말로 분리되어 있다면 추출한 컨텍스트를 부모가 아니라 link로 넘깁니다. MassTransit이나 Azure Service Bus SDK 같은 라이브러리는 inject와 extract를 알아서 처리하므로, 남는 일은 자체 봉투 형식에서 헤더를 삼키지 않는 것뿐입니다.

샘플링은 내보내기 설정 옆에서 정합니다. `SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(0.1)))`은 프로세스 안에서 하는 head 샘플링이고, parent-based 래퍼는 root가 아닌 서비스가 호출자가 이미 내린 결정을 다시 굴리지 못하게 막아 줍니다. 오류와 이상치를 남기겠다는 결정은 OpenTelemetry Collector의 tail 샘플링 프로세서가 맡을 자리입니다. trace 전체를 본 것은 컬렉터뿐이기 때문입니다.
