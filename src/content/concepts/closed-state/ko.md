---
title: "Closed State"
summary: "Closed는 Circuit Breaker의 평상시 상태입니다. 호출은 의존 서비스까지 그대로 전달되고, Circuit Breaker는 그중 몇 건이 실패했는지 셉니다."
category: "복원력과 장애 대응"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Closed는 Circuit Breaker의 평상시 상태입니다. 모든 호출이 의존 서비스까지 그대로 전달되고, Circuit Breaker는 그 호출이 성공했는지 실패했는지 기록합니다.

기록이야말로 핵심입니다. Closed 상태는 단순히 통과시키기만 하는 상태가 아니라, 표본 구간 안에서 실패 비율을 계속 갱신하는 상태입니다. 그 비율이 구간 안에서 임계치를 넘으면 Open으로 바뀝니다.

표본 구간에는 최소 처리량을 함께 정합니다. 그것이 없으면 호출 3건 중 2건 실패가 67%로 읽혀, 통계적으로 의미 없는 표본에 Circuit Breaker가 열립니다.
