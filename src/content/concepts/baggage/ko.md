---
title: "Baggage"
summary: "baggage는 trace 컨텍스트와 함께 이동하는 작은 키와 값의 모음입니다. 엣지에서 한 번 넣어 두면 아래쪽 어디에서나 읽을 수 있어서 메서드 서명마다 값을 추가하지 않아도 됩니다. 편리하지만 호출하는 모든 곳에 뿌려지므로 아주 작게 유지해야 합니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 3
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Context Propagation
    slug: context-propagation
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "W3C Baggage"
    url: https://www.w3.org/TR/baggage/
  - title: "OpenTelemetry: baggage"
    url: https://opentelemetry.io/docs/concepts/signals/baggage/
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
---

장면의 3단계에서 요청이 든 칩에는 `tp + baggage`라고 적혀 있고, 큐를 건너서도 그 뒤 worker가 거는 호출에서도 같은 글자가 남아 있습니다. 그 호출이 닿으면 payments는 자기 로그에 `tenant=acme`라고 씁니다. 아무도 테넌트를 매개변수로 내려보내지 않았습니다. 엣지에서 한 번 넣었을 뿐인데 그 뒤의 모든 서비스가 읽을 수 있었습니다.

기능은 그것이 전부입니다. baggage는 컨텍스트에 붙는 짧은 키와 값의 모음이고, `traceparent` 옆의 `baggage` 헤더에 실려 갑니다. 대표적인 쓰임은 장면이 보여 주는 것들입니다. 공용 서비스가 작업의 주인을 가릴 수 있게 하는 테넌트, 부하 테스트 요청을 실제 요청과 구분하게 하는 합성 트래픽 표시, 아래쪽 판단이 위쪽 판단과 어긋나지 않게 하는 기능 플래그나 실험 집단 같은 값입니다.

비용은 baggage가 지정 전달이 아니라 방송이라는 점에 있습니다. 컨텍스트가 닿는 모든 홉이 그것을 보게 되며, 다른 팀이 소유한 서비스도, 외부 호출까지 전파한다면 제삼자도 포함됩니다. 항목 하나하나가 그 trace의 모든 요청마다 바이트를 차지하고, 표준은 전체 크기에 일부러 넉넉하지 않은 한계를 둡니다. 그래서 따라야 할 규칙은 짧습니다. 키는 두어 개로 제한하고, 값은 작고 범위가 닫힌 것으로 두고, 비밀이나 개인 정보는 절대 넣지 말고, 시스템이 끝나는 경계에서 떼어 냅니다.

baggage가 자동으로 span에 붙는 것도 아닙니다. 값을 읽을 수 있다는 것과 값이 기록되었다는 것은 다르며, 무언가가 그 값을 속성으로 span에 옮겨 적지 않는 한 뷰어는 baggage 항목을 보여 주지 않습니다. 그 값으로 검색할 가치가 있는 span에만 의도를 가지고 옮기는 편이, 모든 것을 모든 것에 복사하는 프로세서보다 낫습니다. 후자야말로 작은 편의가 큰 청구서로 바뀌는 경로입니다.

.NET에서는 `Baggage.SetBaggage("tenant", value)`와 `Baggage.GetBaggage("tenant")`가 API이고, 항목은 `Activity.Current`와 마찬가지로 비동기 컨텍스트를 따라 흐릅니다. 전송로 위의 전파는 복합 전파기가 맡아 baggage를 trace 컨텍스트와 함께 실어 주므로, HTTP 홉에는 코드가 필요 없고 메시지 홉에는 나머지 컨텍스트와 같은 inject와 extract가 필요합니다. `Activity`에도 `AddBaggage`가 있습니다. 같은 발상을 BCL 수준에서 먼저 적은 표현이지만 둘은 하나의 저장소가 아닙니다. OpenTelemetry 전파기는 `Baggage.Current`만 주입하므로 `Activity.AddBaggage`로 넣은 항목은 전송로에 닿지 않습니다. OpenTelemetry API README도 이 점을 분명히 적어 두었습니다. baggage를 넣는 권장 방법은 `Baggage.SetBaggage()`이고, OpenTelemetry 사용자는 `Activity.AddBaggage`를 쓰지 말아야 합니다.

말썽을 피하는 어림 규칙은 이렇습니다. baggage는 어디에서나 동작에 영향을 주거나 동작을 설명해 주는 값을 위한 것이지, 데이터를 넘기는 수단이 아닙니다. 아래쪽 서비스가 자기 일을 하려고 그 값을 필요로 한다면 요청에 담습니다. 모두가 알아서 득을 보고 누구도 봐서 해가 되지 않는 값이라면 baggage가 알맞은 자리입니다.
