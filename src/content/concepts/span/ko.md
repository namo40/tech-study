---
title: "Span"
summary: "span은 trace 안의 작업 단위 하나입니다. 이름, 시작, 끝, 자기를 호출한 span, 그리고 속성 몇 개로 이루어집니다. 서비스가 실제로 기록하는 것은 이것뿐이며, trace 뷰어가 보여 주는 모든 것은 여기에서 조립됩니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Trace ID
    slug: trace-id
  - label: Span ID
    slug: span-id
  - label: ActivitySource
    slug: activitysource
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
  - title: "System.Diagnostics.Activity"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.activity
---

장면의 두 번째 단계에서 막대 하나를 보세요. 요청이 서비스에 닿는 순간 나타나고, 그 서비스가 요청을 붙들고 있는 동안 정확히 그만큼 자라며, 답이 떠날 때 멈춥니다. 그것이 span이고, 막대는 span을 그린 삽화가 아닙니다. 시작과 끝이 span을 이루는 두 사실이고, 길이는 그 뺄셈입니다.

이 두 타임스탬프 주위에 span은 이름, 종류, 자기 id, 부모의 id, 상태, 속성을 지닙니다. 이름은 인스턴스가 아니라 연산을 가리켜야 하므로 `GET /orders/4197`이 아니라 `GET /orders/{id}`여야 합니다. id가 박힌 이름은 결코 묶일 수 없는 백만 가지 연산을 만들어 내기 때문입니다. 종류는 이것이 호출을 처리한 서버였는지, 호출을 건 클라이언트였는지, 생산자인지 소비자인지, 아니면 내부 작업인지를 말해 주며, 뷰어가 한 네트워크 홉의 양쪽 끝을 구분하게 해 주는 것도 이 값입니다.

사람들이 과하게 쓰는 부분은 속성입니다. 잘 고른 키 몇 개는 값을 합니다. 라우트 템플릿, 상태 코드, 데이터베이스 종류와 쿼리 형태, 큐 이름, 테넌트 같은 것들입니다. 값의 범위가 열려 있는 것은 여기에 두면 안 됩니다. 속성은 샘플링된 모든 span에 기록되고 색인까지 되기 때문입니다. 세부 내용이 필요하면 trace id를 붙여 로그로 남기고, 양은 로그 저장소가 감당하게 하세요. 모양은 span이 맡고 세부는 로그가 맡는 이 구분이 tracing을 감당할 만한 비용으로 유지해 줍니다.

span은 오류가 있었다면 그것도 담습니다. 상태를 오류로 두고 예외를 기록해 두어야 실패한 홉을 나중에 찾을 수 있고, tail 샘플링이 이 trace를 남길 가치가 있다고 판단할 때 쓰는 신호도 이것입니다. 예외를 삼키고 대체 응답을 돌려준 span이라도 그 사실은 남겨야 합니다. 그러지 않으면 trace는 모든 것이 괜찮았다고 주장합니다.

.NET에서 span은 `Activity`입니다. `ActivitySource.StartActivity`가 하나를 돌려주고, 듣는 쪽이 없으면 null을 돌려줍니다. 모든 예제가 `activity?.SetTag(...)`라고 쓰는 이유입니다. activity를 dispose하는 것이 곧 멈추는 것이므로 `using`이 끝 타임스탬프이고, dispose를 잊은 span은 프로세스가 알아챌 때까지 계속 돌아갑니다. 부모는 같은 비동기 흐름의 `Activity.Current`에서 집어 오며, 요청 핸들러 안의 자식 span이 아무 말을 듣지 않고도 알아서 중첩되는 이유가 이것입니다.
