---
title: "Open State"
summary: "Open은 Circuit Breaker가 호출을 즉시 거부하는 상태입니다. 실패하고 있는 의존 대상에 회복할 시간을 줍니다."
category: "복원력과 장애 대응"
scene: circuit-breaker
sceneStep: 2
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Closed State
    slug: closed-state
  - label: Half-Open State
    slug: half-open-state
  - label: Retry
    slug: retry
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Open은 Circuit Breaker가 의존 대상을 아예 호출하지 않는 상태입니다. 모든 호출은 Circuit Breaker에서 거부되어 네트워크 왕복 없이 즉시 돌아옵니다.

빠르게 실패하는 것 자체가 호출하는 쪽에 주는 이득입니다. 그러지 않으면 이미 멈춘 것으로 알려진 의존 대상을 상대로 스레드가 타임아웃을 기다리게 되고, 그렇게 기다리는 스레드가 쌓이면 호출하는 쪽까지 함께 멈춥니다.

제대로 정해야 할 숫자는 차단 시간 하나입니다. 너무 짧으면 회복하지 않은 의존 대상을 계속 두드리게 됩니다. 너무 길면 이미 회복한 뒤에도 멀쩡한 트래픽이 막힌 채로 남습니다.
