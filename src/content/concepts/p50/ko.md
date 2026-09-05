---
title: "p50"
summary: "p50은 중앙값입니다. 요청의 절반은 이보다 빠르고 절반은 이보다 느립니다. 전형적인 요청이 어떤지는 말해 주지만, 느린 요청에 대해서는 아무것도 말해 주지 않습니다."
category: "요구사항과 품질 속성"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
---

중앙값은 평균이 그런 척하는 값입니다. 표본 20개 중 400ms짜리 요청 하나는 평균을 18ms 끌어올리지만 중앙값은 있던 자리에 그대로 둡니다. 평균으로 만든 대시보드가 평온해 보이는데도 스무 건 중 한 건이 불만스러운 상황은 이렇게 생깁니다.

p50은 용량 산정과 정상 경로의 모양을 볼 때 맞는 숫자입니다. 특별한 일이 없을 때 코드가 얼마나 드는지를 알려 주기 때문입니다. p50이 움직였다면 모두에게 무언가가 바뀐 것입니다. 쿼리 실행 계획, 배포, 전보다 일을 더 많이 하게 된 장비가 대표적입니다.

p50이 못 하는 일은 꼬리를 보는 것입니다. 백 번에 한 번이 400ms가 걸리는 동안에도 서비스는 몇 달이고 p50을 44ms로 유지할 수 있고, p50만 보는 사람은 끝내 그 사실을 모릅니다. p50은 혼자 읽지 말고 p95, p99와 나란히 읽습니다.
