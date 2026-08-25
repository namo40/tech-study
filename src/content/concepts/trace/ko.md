---
title: "Trace"
summary: "trace는 요청 하나가 일으킨 모든 일을 id 하나 아래에 모은 것입니다. 뿌리가 하나인 span의 트리이며, 시계 위에 그리면 시간이 어느 홉으로 들어갔는지 말해 주는 waterfall이 됩니다."
category: "관측 가능성과 운영"
scene: distributed-tracing
sceneStep: 2
related:
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Span
    slug: span
  - label: Trace ID
    slug: trace-id
  - label: Context Propagation
    slug: context-propagation
  - label: Baggage
    slug: baggage
  - label: Sampling
    slug: sampling
  - label: OpenTelemetry
    slug: opentelemetry
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Distributed tracing in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing
  - title: "W3C Trace Context"
    url: https://www.w3.org/TR/trace-context/
  - title: "OpenTelemetry: traces"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
---

장면의 두 번째 단계는 trace 하나가 눈앞에서 조립되는 모습입니다. gateway가 요청을 받아 id를 만들고 root span을 엽니다. orders가 그 아래에 자식을 열고, payments가 다시 그 아래에 자식을 엽니다. 패널에 막대 셋이 나타나는데, 각각은 자기 홉이 시작한 자리에서 시작해 자기 홉이 답한 자리에서 멈춥니다. 그렇게 만들어진 모양이 trace입니다.

이것이 서로 무관한 기록 셋이 아니라 하나의 trace가 되는 이유는, 셋 모두가 같은 id를 지니고 각자 자기 부모를 밝히기 때문입니다. id는 서로 다른 프로세스 셋에서, 어쩌면 몇 초씩 벌어진 채 순서 없이 도착한 span을 백엔드가 한데 모으게 해 주고, 부모는 그 더미를 트리로 바꿔 줍니다. 트리 자체는 전송되지 않습니다. 각 span은 자기 자신과 부모가 누구였는지만 보고하고, 모양은 받는 쪽에서 다시 세워집니다.

waterfall은 그 트리를 시계 위에 그린 것뿐이지만, 무엇을 보여 주는지는 정확히 말해 둘 가치가 있습니다. 자식 막대가 부모 안에 온전히 들어 있다면 부모가 그것을 기다렸다는 뜻이고, 부모의 길이에서 자식을 뺀 나머지가 부모가 자기 일에 쓴 시간입니다. 장면에서 root는 약 1,167ms이고 그중 800ms가 `charge`이며, 나머지는 네트워크 구간과 서비스마다 쓴 몇 밀리초입니다. 이 읽기가 애초에 trace를 두는 이유 전부입니다. 힌트가 아니라 답이기 때문입니다.

trace에는 부모가 없는 span, 곧 root가 정확히 하나 있고, 그 안의 마지막 span이 끝날 때 trace도 끝납니다. 이 시점은 대개 생각보다 늦습니다. 큐를 통해 꺼내진 비동기 소비자는 같은 trace에 속하지만 요청이 돌아가고 한참 뒤에 시작합니다. 장면이 그것을 중첩하지 않고 link로 잇는 이유이자, 뷰어가 보여 주는 trace의 "소요 시간"이 호출자가 기다린 시간이 아니라 트리 전체의 폭인 이유이기도 합니다.

현실적인 한계도 알아 둘 만합니다. trace의 범위는 전파가 정합니다. 컨텍스트가 닿는 데까지 정확히 닿고, 헤더를 흘리는 첫 홉에서 뚝 끊깁니다. 샘플링도 범위를 정하는데, 이것은 span이 아니라 trace 단위의 결정입니다. trace 전체를 남기거나 전혀 남기지 않거나 둘 중 하나입니다. 반쪽짜리 trace는 아무것도 답해 주지 못하기 때문입니다.
