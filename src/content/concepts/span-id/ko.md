---
title: "Span ID"
summary: "span id는 span 하나에 붙는 8바이트짜리 이름입니다. trace id와 짝을 이루면 작업 하나를 가리키는 주소가 되고, 자식의 부모 항목에 복사되면 트리의 간선 하나가 되며, 로그 한 줄에 실리면 요청의 어느 부분이 그 줄을 썼는지 말해 줍니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace ID
    slug: trace-id
  - label: Span
    slug: span
  - label: Trace
    slug: trace
  - label: Structured Logging
    slug: structured-logging
  - label: ActivitySource
    slug: activitysource
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
---

장면의 두 번째 단계에서 홉마다 span을 기록하는데, 그 span들에는 다른 무언가가 가리킬 수 있는 이름이 필요합니다. span id가 그 이름입니다. 무작위 8바이트를 16진수 열여섯 자로 적은 값이고, span을 시작한 쪽이 만들며, 그 span 바깥에서는 아무 의미도 없습니다. trace id의 절반 너비인 것은 일부러이고, 이유는 절약이 아니라 범위의 차이입니다. trace id는 백엔드가 앞으로 저장할 모든 것에 걸쳐 고유해야 하므로 그에 맞춰 크기가 정해집니다. span id는 trace 하나 안의 span들 사이에서만 고유하면 되고 그 집합은 수십에서 수백이므로, 열여섯 자면 넉넉합니다. 값은 순차가 아니라 무작위이고, 작업이나 서비스에서 유도되지 않으며, 0으로만 채워진 span id는 값이 아니라 "없음"의 표기입니다.

범위가 좁은 대가로 span id 하나만으로는 아무것도 가리키지 못합니다. 주소는 짝입니다. trace id가 어느 요청인지 말하고 span id가 그 안의 어느 작업인지 말하며, 뷰어나 질의가 막대 하나에 내려앉으려면 둘 다 있어야 합니다. 이 id가 하는 두 번째 일은 구조를 만드는 것입니다. 각 span은 자기 id 옆에 자기가 어느 span 아래에서 시작됐는지를 함께 기록하고, 부모 자식 관계의 전부가 그 항목 하나입니다. 트리를 전송하는 것은 아무것도 없고, 요청이 도는 동안 트리를 아는 쪽도 없으며, 참여한 서비스들은 서로의 모양을 본 적이 없습니다. 백엔드는 각자 다른 span 하나를 지목하는 span 더미를 받아 id를 맞춰 가며 트리를 다시 세웁니다. 부모 항목이 비어 있는 span이 루트이고, 그래서 trace의 꼭대기는 통보받는 것이 아니라 알아보는 것입니다.

선 위에서 이 id는 `traceparent` 헤더의 세 번째 항목에 실리고, 그 항목의 뜻은 홉의 어느 쪽에 서 있느냐에 따라 달라집니다. 서비스가 거기에 실어 보내는 것은 지금 보내고 있는 span의 id이고, 다음 서비스가 거기서 읽는 것은 자기가 이제 시작할 span의 부모입니다. 그러고 나서 그 새 span에 쓸 span id를 새로 만들어 자기가 내보내는 헤더에 자기 값을 넣습니다. 그러니 같은 열여섯 자가 나갈 때는 신분이고 들어올 때는 부모 링크입니다. .NET에서는 두 역할이 같은 객체의 두 속성인 `Activity.Current?.SpanId`와 `ParentSpanId`이고, 복사는 전파기가 맡으므로 계측 코드가 헤더를 직접 만지는 일은 거의 없습니다. 만지는 유일한 경우는 `traceparent`를 나르지 않는 경계입니다. 큐 메시지나 일괄 인계 같은 곳에서는 id를 사람이 어딘가에 넣어 주어야 하고, 그러지 않으면 사슬은 거기서 끊기고 다음 서비스가 새 루트가 됩니다.

일상적인 이득은 로그에 있습니다. 로그 한 줄의 trace id는 검색을 요청 하나로 좁혀 주고 그것만으로도 값의 대부분입니다. 여기에 span id가 그 요청 안의 작업 하나까지 더 좁혀 주는데, 요청이 같은 서비스를 두 번 불렀거나 어느 홉을 재시도했거나 세 가지를 나란히 돌리고 그중 하나만 느렸을 때 필요한 것이 그것입니다. 둘 다 줄에 실려 있으면 trace 뷰어의 막대 하나와 로그 몇 줄은 같은 것을 두 방향에서 본 것이 되고, structured logging이 그것을 grep 대상 텍스트가 아니라 걸러 낼 수 있는 필드로 만들어 줍니다. 두 가지 습관이 이것을 깔끔하게 지켜 줍니다. trace id만이 아니라 짝으로 남기세요. span id 없는 trace id는 두 시도를 구분하지 못합니다. 그리고 이 값을 다른 용도로 빌려 쓰지 마세요. 시도 단위이고 재시도하면 바뀌며 표본에 뽑히지 않은 trace에서는 아예 존재하지 않으므로, 중복 요청을 걸러 내는 Idempotency-Key나 업무용 상관 id는 다른 데서 와야 합니다.
