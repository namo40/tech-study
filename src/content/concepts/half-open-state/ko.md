---
title: "Half-Open State"
summary: "Half-Open은 Circuit Breaker의 시험 상태입니다. 차단 시간이 지나면 호출 하나만 통과시켜 의존 대상이 회복했는지 확인합니다."
category: "복원력과 장애 대응"
scene: circuit-breaker
sceneStep: 3
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Open State
    slug: open-state
  - label: Closed State
    slug: closed-state
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
---

Half-Open은 시험 상태입니다. 차단 시간이 끝나면 Circuit Breaker는 적은 수의 호출, 보통은 하나만 통과시키고 그 시험이 진행되는 동안 나머지는 모두 거부합니다.

이 상태가 있는 이유는 달리 알 방법이 없기 때문입니다. 의존 대상이 회복했다고 알려 주는 것은 없으므로 직접 물어봐야 하고, 그 질문을 한꺼번에 열어젖히는 대신 가장 작은 표본으로 던집니다.

시험 호출의 결과가 모든 것을 정합니다. 성공하면 Closed로 닫히고, 실패하면 차단 시간만큼 다시 Open이 됩니다. 이때 시험은 실제 호출이어야 합니다. 정작 쓰는 엔드포인트는 여전히 실패하는데 성공하는 헬스 체크로는 소용이 없습니다.
