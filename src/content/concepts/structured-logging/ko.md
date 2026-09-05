---
title: "Structured Logging"
summary: "구조화 로깅은 로그 한 줄을 완성된 문장이 아니라 메시지 템플릿과 이름 붙은 값들로 씁니다. 그래서 저장소가 `OrderId`와 `CorrelationId`를 색인 가능한 필드로 간직합니다. 로그 검색을 부분 문자열 스캔에서 쿼리로 바꿔 주는 것이 바로 이것입니다."
category: "관측 가능성과 운영"
scene: correlation-id
sceneStep: 2
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Sampling
    slug: sampling
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Message ID
    slug: message-id
references:
  - title: "Logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
  - title: "High-performance logging in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/high-performance-logging
  - title: "Compile-time logging source generation"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/source-generation
  - title: "Message Templates"
    url: https://messagetemplates.org/
---

장면의 2단계는 id가 관념이기를 그만두고 시스템이 실제로 다룰 수 있는 물건이 되는 자리입니다. 그렇게 될 수 있는 이유는 로그 줄이 구조화되어 있기 때문입니다. 한 흐름의 새 줄마다 칩이 붙는 것은, id가 그 줄의 이름 붙은 속성이라서 메시지 안이 아니라 메시지 옆에 자리 잡고 있기 때문입니다. 만약 id를 문장 안에 적어 넣었다면 패널에 보여 줄 수는 있었겠지만 4단계는 아무것도 작동하지 않습니다. 문장을 상대로 한 필터는 부분 문자열 검색이고, 부분 문자열 검색은 필드와 우연을 구별하지 못합니다.

차이는 소스에서는 작고 그 바깥 모든 곳에서는 큽니다. `logger.LogInformation("charge failed for {CorrelationId}", id)`는 `logger.LogInformation($"charge failed for {id}")`와 거의 똑같아 보이고, 콘솔에 찍히는 글자도 같습니다. 앞의 것은 로깅 공급자에게 두 가지를 건넵니다. 템플릿 하나와 `CorrelationId`라는 이름에 묶인 값 하나이고, 공급자는 둘 다 씁니다. 뒤의 것은 완성된 문자열 하나만 건네고, 공급자가 보기도 전에 구조를 버립니다. grep을 넘어서는 모든 일은 그 둘 중 무엇을 썼는지에 달려 있습니다.

저장소가 얻는 것은 로그 한 줄을 레코드로 다룰 수 있는 능력입니다. `CorrelationId`가 컬럼이 되므로 그 컬럼을 거는 필터는 스캔이 아니라 색인 조회가 되고, 게다가 정확합니다. 문장 안에서 `7f3a`를 찾으면 우연히 그 글자를 품은 주문 번호까지 걸리지만, 필드를 찾으면 그렇지 않습니다. 필드는 세고 묶을 수 있으므로 "지난 한 시간 동안 이 테넌트에서 결제가 몇 번 실패했나"는 누군가 잊지 않고 추가해야 하는 지표가 아니라 이미 쓰고 있던 줄들을 훑는 쿼리가 됩니다. 그리고 템플릿 자체가 하나의 값으로 남으므로, "charge failed for {CorrelationId}"라는 줄은 거기를 지나간 id가 몇 개든 하나의 묶음에 속합니다. 특정 종류의 줄이 갑자기 늘어난 것을 볼 수 있는 이유가 그것입니다.

여기에는 지켜야 할 규율이 딸려 오고, 대부분은 이름에 관한 것입니다. 속성은 어디서나 같은 뜻이거나 아무 뜻도 없거나 둘 중 하나입니다. 한 서비스는 `CorrelationId`를, 다른 서비스는 `correlation_id`를, 또 다른 서비스는 `corrId`를 남기면 필드는 세 번 존재하고 그 사이에서는 아무것도 이어지지 않습니다. 카디널리티도 중요한데, 방향은 지표와 반대입니다. id처럼 값의 가짓수가 많은 것은 오히려 로그 속성에 어울립니다. 로그는 지표의 레이블처럼 집계되지 않기 때문입니다. 어울리지 않는 것은 비밀이나 개인 정보입니다. 구조화된 필드는 그것이 나온 문장보다 덜 오래가고 덜 검색되는 것이 아니라 더 오래가고 더 잘 검색됩니다.

규율의 나머지 절반은 스코프이고, 장면이 실제로 그리는 것도 그것입니다. 호출 지점마다 id를 적는 방식도 되기는 하지만 잘 깨집니다. 누군가 급히 덧붙인 그 한 줄이 꼭 id 없는 줄이 되고, 하필 그 줄이 필요한 줄입니다. 요청마다 한 번 여는 스코프는 그 안에서 쓰이는 모든 줄에 속성을 붙여 줍니다. 그 id를 들어 본 적도 없는 라이브러리가 쓴 줄까지 포함해서 말입니다. 그래서 적용 범위가 누가 기억하느냐에 더는 좌우되지 않습니다.

.NET에서 쓰는 부품은 `ILogger`의 메시지 템플릿, 주변 속성을 붙이는 `BeginScope`, 그리고 할당까지 신경 쓸 만큼 뜨거운 줄을 위한 `[LoggerMessage]`입니다. `LogInformation("charge failed for {CorrelationId}", id)`는 이미 구조화되어 있고, 조용히 그렇지 않은 보간 문자열을 잡아내라고 CA2254 분석기 규칙이 있습니다. `logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id })`가 주변 속성 형태이고, 공급자는 설정되어 있을 때만 그 값을 흘려보냅니다. 콘솔과 OpenTelemetry 익스포터에서 `IncludeScopes`는 기본이 꺼짐이고, 분명히 있는 스코프가 하류 어디에도 나타나지 않는 흔한 이유가 이것입니다. `[LoggerMessage(Level = LogLevel.Information, Message = "charge failed for {CorrelationId}")]`는 템플릿을 컴파일 시점에 검사하고 호출마다 박싱하지 않으면서 같은 줄을 만들어 내므로, 빠른 길과 구조화된 길이 같은 길이 됩니다.
