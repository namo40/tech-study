---
title: "Sampling"
summary: "샘플링은 트레이스 일부만 남기고 나머지는 버리기로 하는 결정입니다. 요청을 전부 기록하는 값이 지켜보는 대상 시스템보다 비싸지기 때문입니다. head 샘플링은 시작에서 정해서 싸고, tail 샘플링은 끝에서 정해서 흥미로운 것을 남깁니다."
category: "관측 가능성과 운영"
scene: correlation-id
sceneStep: 4
related:
  - label: Correlation ID
    slug: correlation-id
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Structured Logging
    slug: structured-logging
  - label: Trace ID
    slug: trace-id
  - label: Trace
    slug: trace
  - label: Span
    slug: span
  - label: Context Propagation
    slug: context-propagation
references:
  - title: "OpenTelemetry sampling"
    url: https://opentelemetry.io/docs/concepts/sampling/
  - title: "Sampling in OpenTelemetry .NET"
    url: https://opentelemetry.io/docs/languages/net/sampling/
  - title: ".NET distributed tracing concepts"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts
  - title: "Tail sampling processor"
    url: https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor
---

장면의 마지막 단계에서는 `sampling 10%` 칩이 나타나고 `trace` 칩이 가위표를 단 채 흐려지는 동안, 로그 줄들은 있던 자리에 그대로 남아 있습니다. 한 프레임에 논지 전체가 들어 있는 셈입니다. 샘플링은 고장도 아니고 설정 실수도 아닙니다. 부하가 걸린 트레이싱 시스템의 정상이고 옳은 상태이며, 로그 속 correlation id가 그 자체로 지닐 값어치가 있는 이유입니다. 바쁜 날에는 지금 파고 있는 그 흐름에 애초에 트레이스가 없었을 수 있고, 트레이싱 화면을 아무리 눌러도 지난 일의 트레이스가 생겨나지는 않습니다.

샘플링이 있어야 하는 이유는 산수입니다. 트레이스 하나는 여러 span이고 span마다 속성과 이벤트와 링크가 달립니다. 초당 수천 건을 받는 서비스는 업무 데이터보다 트레이스 데이터를 더 많이 만들어 냅니다. 그것을 전부 보관하면 저장 공간과 네트워크가 들고, 눈에 덜 띄지만 관측당하는 프로세스의 CPU도 듭니다. 그래서 샘플러는 양을 사고가 아니라 결정으로 만들려고 존재하고, 진짜 물음은 그 결정을 어디에서 내리느냐 하나뿐입니다.

head 샘플링은 아무 일도 일어나기 전, 맨 앞에서 정합니다. 비율 기반 샘플러는 trace id를 해시해 정해진 비율만 남기고, 그 결정이 `traceparent`의 sampled 플래그에 실려 가므로 하류의 모든 서비스가 같은 선택을 합니다. 트레이스는 통째로 남거나 통째로 버려집니다. 반쪽짜리 트레이스가 백엔드를 채우지 않는 이유가 그것입니다. 싸고, 예측 가능하고, 눈이 멀었습니다. 8초가 걸린 요청과 예외를 던진 요청이 남을 확률은 나머지 전부와 정확히 같습니다. 주된 쓰임이 8초 걸리고 예외를 던진 요청을 조사하는 도구치고는 묘한 성질입니다.

tail 샘플링은 트레이스 전체를 버퍼에 담아 둔 수집기에서, 끝에 가서 정합니다. 이제는 실제로 일어난 일을 보고 결정할 수 있습니다. 오류가 난 것은 모두, 기준보다 느린 것은 모두, 지금 조사 중인 테넌트의 것은 모두 남기고, 기준선을 위해 나머지에서 조금만 남깁니다. head 샘플링에 대한 반론에 정확히 답하지만, 값으로는 진행 중인 트레이스를 끝날 때까지 메모리에 붙들고 있어야 하는 부품이 하나 더 붙습니다. 게다가 그 크기는 평균이 아니라 최대치에 맞춰야 합니다. 신경 쓰는 시스템은 대개 둘 다 갖게 됩니다. 수집기가 볼 것이 충분하도록 head를 넉넉히 잡고, 무엇이 살아남을지는 tail 정책이 정합니다.

첫 번째 결정과 갈라 두면 좋은 두 번째 결정이 있습니다. 샘플러는 기록할지를 고르고, 필터는 계측할지를 고릅니다. 헬스 체크와 정적 자원의 span을 원천에서 버리는 것은 샘플링이 아니라 그 요청들이 애초에 흥미롭지 않았다고 정하는 일입니다. `ActivityListener`나 계측 필터에서 하면 값이 전혀 들지 않습니다. 데이터가 이미 네트워크를 건넌 뒤 수집기에서 정하는 것과는 다릅니다.

이 모든 것을 넘어 남는 것이 로그입니다. 로그는 보통 온전히, 더 오래 보관되고 트레이스보다 훨씬 덜 걸러집니다. 그리고 자기 트레이스보다 오래 산 흐름을 담는 유일한 기록입니다. 큐에서 하룻밤을 보낸 메시지, 이튿날 아침에 재시도된 작업, 사흘 동안 돈 saga 같은 것 말입니다. 네 번째 단계가 그리는 분업이 이것입니다. 트레이스는 마침 남겨 둔 요청들에 대해 "시간이 어디로 갔나"에 답합니다. 로그 속 correlation id는 샘플러가 버린 요청까지 포함해 모든 요청에 대해 "이 건에 무슨 일이 있었나"에 답합니다.

.NET에서 head 결정은 트레이서 공급자에 붙는 샘플러입니다. `.SetSampler(new TraceIdRatioBasedSampler(0.1))`은 10%를 남기고, `ParentBasedSampler`는 상류 호출자가 이미 내린 결정을 다시 굴려 트레이스를 반으로 찢는 대신 그대로 따르게 만듭니다. `traceparent` 헤더의 sampled 플래그가 그 결정을 나르고, 직접 짠 코드에서는 `Activity.Recorded`로 읽습니다. 이것이 중요한 이유는 기록되지 않는 activity도 여전히 존재하고 여전히 전파되기 때문입니다. 아무것도 내보내지 않는 동안에도 id는 거기 있어서 로그에 남길 수 있습니다. tail 샘플링은 라이브러리 설정이 아니라 OpenTelemetry 수집기의 프로세서이고, 상태 코드와 지연 시간과 속성에 대한 정책으로 설정합니다. 버퍼링과 최대 메모리가 어디에 사는지를 바꾼다는 점은 기억해 둘 만합니다.
