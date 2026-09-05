---
title: "Context Propagation"
summary: "context propagation은 프로세스를 떠나는 것에 trace 컨텍스트를 함께 실어 주는 일입니다. HTTP 헤더, gRPC 메타데이터 항목, 메시지 속성이 그 자리입니다. trace가 프로세스 경계를 넘어 살아남는 이유는 이것뿐이며, 이를 건너뛴 첫 홉이 trace를 반으로 자릅니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Baggage
    slug: baggage
  - label: Competing Consumers
    slug: competing-consumers
  - label: OpenTelemetry
    slug: opentelemetry
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "OpenTelemetry: context propagation"
    url: https://opentelemetry.io/docs/concepts/context-propagation/
---

장면의 3단계는 전파를 놓치기 쉬운 바로 그 지점을 다룹니다. HTTP에서는 칩이 요청을 따라 함께 가고 아무도 코드를 쓰지 않아도 trace가 온전히 유지됩니다. 클라이언트 계측이 나갈 때 `traceparent`를 쓰고 서버 계측이 들어올 때 읽기 때문입니다. 그런 다음 orders가 메시지를 발행하고, 그 메시지를 만든 요청은 돌아갑니다. 그 메시지에 나중에 일어나는 일이 같은 trace의 일부가 되려면, 컨텍스트가 메시지 자체에 적혀 있어야 합니다.

방식은 일부러 밋밋합니다. 전파는 운반체를 사이에 둔 inject와 extract입니다. inject는 현재 컨텍스트를 키와 값의 쌍으로 전송 수단이 실을 수 있는 곳에 쓰고, extract는 그것을 다시 읽어 span을 시작할 컨텍스트를 돌려줍니다. 표준 이름은 id와 sampled 플래그를 담는 `traceparent`, 벤더별 추가 정보를 담는 `tracestate`, 직접 정한 키와 값을 담는 `baggage`입니다. 형식이 W3C 표준이므로 .NET 서비스에서 Go 서비스로, 다시 관리형 게이트웨이로 건너가는 요청도 그 내내 하나의 trace id를 유지합니다.

실제로 동작하느냐를 가르는 세부는 둘입니다. 하나는 프로세스 안의 전파가 전송로 위의 전파와 별개라는 점입니다. 프로세스 안에서 `Activity.Current`는 비동기 실행 컨텍스트를 따라 흐르므로 자식 span이 알아서 부모를 찾지만, await하지 않고 일을 넘겨 버리는 것은 그 흐름을 끊습니다. 백그라운드 서비스가 소비하는 채널, 직접 시작한 스레드, 실행 컨텍스트를 억제한 코드가 그렇습니다. 결과를 기다리지 않는 `Task.Run`은 반대쪽 함정입니다. 실행 컨텍스트를 캡처하므로 `Activity.Current`가 그 안으로 흘러 들어가고, 거기서 시작한 span은 몇 분 전에 닫힌 요청 span 아래에 매달립니다. 뷰어는 그것을 요청보다 훨씬 오래 이어진 부모로 그립니다. 다른 하나는 메시지 소비자가 대개 발행한 span을 부모로 삼아서는 안 된다는 점입니다. 소비자는 그 span이 닫힌 뒤에, 흔히 요청이 돌아간 뒤에 시작하므로 trace에는 link로 속합니다.

이 실패는 조용히 일어나고, 그래서 단계 하나를 따로 둘 만합니다. 홉이 헤더를 흘려도 오류는 나지 않습니다. trace가 하나가 아니라 둘이 되고 둘 다 완결되어 보이며, 빠진 홉은 빨간 막대가 아니라 알아차려야만 보이는 빈자리로 나타납니다. 흔한 원인은 요청을 처음부터 직접 만드는 손수 쓴 HTTP 클라이언트, 스키마가 아는 필드만 복사하는 메시지 봉투, 그리고 페이로드를 풀었다가 다시 싸는 모든 구성 요소입니다.

.NET에서는 `AddHttpClientInstrumentation`이 나가는 HTTP를, `AddAspNetCoreInstrumentation`이 들어오는 HTTP를 맡으므로 동기 쪽 절반은 공짜입니다. 메시징에서는 inject와 extract를 대신해 주는 라이브러리를 쓰거나, `Propagators.DefaultTextMapPropagator`로 직접 처리하고 그렇게 얻은 딕셔너리를 본문이 아니라 전송 수단 자체의 헤더 모음에 싣습니다.
