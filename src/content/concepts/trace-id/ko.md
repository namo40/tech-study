---
title: "Trace ID"
summary: "trace id는 한 trace 안의 모든 span이 지니는 16바이트 값입니다. 서로 다른 프로세스가 기록한 span을 다시 요청 하나로 모으라고 있는 값이며, W3C `traceparent` 헤더에 실려 이동하고 그 요청이 남기는 모든 로그 줄에도 들어가야 합니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Span ID
    slug: span-id
  - label: Correlation ID
    slug: correlation-id
  - label: Context Propagation
    slug: context-propagation
  - label: Structured Logging
    slug: structured-logging
references:
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "Distributed tracing concepts in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Logging in .NET: log scopes"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/overview
---

장면의 두 번째 단계에서 패널은 gateway가 요청을 받기 전까지 비어 있고 `no trace id`라고 적혀 있습니다. gateway가 요청을 받는 순간 id가 나타나고 막대 셋이 비로소 가능해집니다. 이 순서가 중요합니다. id는 trace에 나중에 붙이는 이름표가 아니라, trace를 존재하게 하는 것 자체입니다. id가 있기 전에는 서로 다른 파일 셋에 기록하는 서비스 셋이 있을 뿐이고, id가 생긴 뒤에는 부분이 셋인 요청 하나가 있습니다.

값 자체는 무작위 16바이트이고 32자리 16진수로 적습니다. 요청이 처음 만나는 계측된 구성 요소가 한 번 만들고, 그 뒤로는 모든 하위 span에 그대로 복사됩니다. 무작위성이 설계의 핵심입니다. 만드는 일을 조율하는 주체가 없으므로 유일성은 등록소가 아니라 공간의 크기에서 나와야 하고, 이 폭에서의 충돌은 대비할 대상이 아닙니다.

이 값은 `traceparent`에 실려 이동하는데, 이 헤더 하나에 네 가지가 들어갑니다. 버전, trace id, 보내는 쪽 span의 id, 그리고 이 trace가 샘플링되고 있는지를 최하위 비트로 말하는 플래그 1바이트입니다. 이 마지막 비트 때문에 head 샘플링은 한 번 정해지면 아래쪽 모두가 그대로 따르는 결정이 됩니다. 샘플 플래그가 꺼진 `traceparent`를 받은 서비스는 그 요청의 span을 기록하지 않으므로, 아무도 두 번 물을 필요가 없습니다.

trace id로 가장 크게 얻는 것은 tracing 바깥에 있습니다. 요청이 남기는 모든 로그 줄에 넣어 두면 로그 저장소를 요청 단위로 검색할 수 있습니다. 질의 하나로 모든 서비스가 순서대로 나옵니다. ASP.NET Core에서는 `Activity.Current?.TraceId`로 이미 값이 있고, 기본 로깅 구성이 이를 스코프에 써 주므로 구조적 로거는 코드 없이 그대로 집어 갑니다. 응답 헤더로 호출자에게 돌려주면, 지원 요청이 재구성 작업이 아니라 조회 한 번으로 바뀝니다.

두 가지는 구분해 두세요. trace id는 여러분이 만들어 내는 correlation id가 아닙니다. 업무용 correlation id가 이미 있다면 trace id를 그것으로 대체하지 말고 root span의 속성으로 붙이세요. 둘은 서로 다른 질문에 답합니다. 그리고 trace id는 비밀은 아니지만 강력한 조인 키이므로, 인가 토큰으로 쓰거나 클라이언트가 골라도 되는 값으로 두어서는 안 됩니다.
