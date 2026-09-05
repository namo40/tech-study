---
title: "Hedging"
summary: "Hedging은 느린 호출의 두 번째 사본을 잠시 기다렸다가 다른 레플리카로 보내고, 먼저 돌아온 답을 씁니다."
category: "요구사항과 품질 속성"
scene: tail-latency
sceneStep: 3
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

hedge를 싸게 만드는 것은 기다리는 시간입니다. 대기 시간을 p95쯤에 두면 스무 번 중 한 번만 사본이 나가므로 추가 부하는 몇 퍼센트에 머무릅니다. 그러면서 꼬리로 향하던 호출은 두 번째 기회를 얻고, 그 기회는 대개 훨씬 빠릅니다.

조건은 두 가지입니다. 하나는 두 번 보내도 되는 호출이어야 한다는 것입니다. 답은 하나만 쓰지만 사본 둘 다 끝까지 실행될 수 있기 때문입니다. 다른 하나는 hedge에 예산이 있어야 한다는 것입니다. 트래픽의 일정 비율을 클라이언트 전체에 걸쳐 강제해야, 어디서나 느려진 백엔드가 가장 감당하기 어려운 순간에 두 배의 트래픽을 받는 일이 생기지 않습니다.

.NET에서는 복원력 파이프라인의 `AddHedging`이 `MaxHedgedAttempts`와 `Delay`를 받고, 둘 중 하나가 답하면 진 쪽을 취소합니다. `Delay`를 0으로 두면 다른 패턴이 됩니다. 처음부터 모든 호출을 병렬로 내보내므로, 첫 사본이 느렸는지와 무관하게 부하가 두 배가 됩니다.
