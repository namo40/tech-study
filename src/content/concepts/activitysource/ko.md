---
title: "ActivitySource"
summary: "ActivitySource는 스팬을 만드는 .NET 객체입니다. 한 번 만들어 정적 필드에 두는 이름 붙은 공장이고, 그 이름이 수집기가 구독하는 문자열입니다. 구독하는 쪽이 없으면 StartActivity가 null을 돌려주므로, 코드에 남겨 둔 계측은 거의 공짜입니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "Add distributed tracing instrumentation"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs
  - title: ".NET observability with OpenTelemetry"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel
---

장면의 두 번째 단계에서는 홉마다 자기 시작과 끝을 가진 span을 기록합니다. .NET에서 그 span은 `Activity`이고, 그것을 만들어 내는 것이 `ActivitySource`입니다. 이름이 붙은 공장이며, 한 번 만들어 정적 읽기 전용 필드에 담아 프로세스가 사는 동안 그대로 둡니다. 요청마다 새로 만드는 성격의 물건이 아니고, 여러 개를 두라고 만든 것도 아닙니다. 보통은 라이브러리 하나 또는 구성 요소 하나에 소스 하나를 두고, 그것이 들어 있는 어셈블리 이름을 그대로 붙입니다. 그 이름이 나머지 모든 것이 기준으로 삼는 단위이기 때문입니다.

`new ActivitySource("Contoso.Orders")`는 그 문자열로 발행하고, 옆에 버전을 함께 줄 수 있습니다. 수집하는 쪽은 같은 문자열을 그대로 되짚어 계측을 켭니다. OpenTelemetry에서는 `AddSource("Contoso.Orders")`이고, 한 무리를 통째로 잡고 싶으면 `AddSource("Contoso.*")`입니다. 이 한 겹의 간접이 설계의 전부입니다. 라이브러리는 어떤 추적 SDK도 참조하지 않고 데이터가 어디로 가는지에 대한 의견도 없이 계측만 담아 배포하고, 어떤 소스를 들을지는 애플리케이션이 시작 시점에 정합니다. 그래서 추적에서 가장 흔한 실패가 오타입니다. trace에는 나타나는데 자기 span이 하나도 없는 서비스는 대개 소스 이름을 등록하지 않은 것이고, 어디에서도 오류를 알려 주지 않습니다.

`StartActivity`는 `Activity?`를 돌려주는데, null인 경우는 오류 경로가 아닙니다. 듣는 쪽이 아무도 없을 때 벌어지는 정상 동작입니다. 객체도 할당하지 않고 타임스탬프도 찍지 않습니다. 예제마다 보이는 `activity?.SetTag(...)`는 꺼져 있는 경로의 비용을 거의 0에 가깝게 만드는 장치입니다. 표본 추출을 정하는 자리도 듣는 쪽입니다. `ActivityListener`는 후보마다 질문을 받고 얼마나 기록할지 답하는데, 아무것도 기록하지 않는 쪽부터 전부 기록하고 표본에도 넣는 쪽까지 폭이 있습니다. 그래서 구독은 되어 있지만 표본에서 빠진 소스도 여전히 쌉니다. span을 풍부하게 만들려고만 존재하는 비싼 계산을 건너뛰고 싶다면 `ActivitySource.HasListeners()`가 그 질문에 바로 답해 줍니다.

몇 가지 습관이 이 구조를 깔끔하게 유지해 줍니다. 소스는 정적으로 만들고 요청마다 만들지 않습니다. 만들 때마다 런타임에 등록되며, 호출보다 오래 살도록 설계된 물건이기 때문입니다. 구성 요소에 버전이 있다면 생성자에 함께 넘깁니다. 이름과 버전은 계측 범위로서 모든 span에 따라다니고, 백엔드는 그것으로 우리 span과 HTTP 클라이언트의 span을 구분합니다. 그리고 이름은 공개 API처럼 다룹니다. 이름을 바꾸면 예전 문자열로 설정해 둔 수집기가 조용히 구독에서 떨어져 나갑니다. 구독 너머의 배선, 즉 내보내기 대상과 리소스 속성, 들은 activity를 실제 span으로 내보내는 SDK는 OpenTelemetry 쪽 이야기입니다. ActivitySource는 우리 코드가 손에 쥐는 관의 끝일 뿐입니다.
