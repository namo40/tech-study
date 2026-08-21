---
title: "Jitter"
summary: "Jitter는 백오프 대기 시간마다 무작위 편차를 더해, 여러 클라이언트의 재시도가 같은 순간에 도착하지 않게 합니다."
category: "복원력과 장애 대응"
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Retry Storm
    slug: retry-storm
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Jitter는 백오프 대기 시간마다 무작위 편차를 더합니다. 정확히 1초 뒤에 재시도하는 대신 0.5초에서 1.5초 사이 어딘가에 재시도합니다.

필요한 이유는 클라이언트들이 같이 실패하기 때문입니다. 의존 서비스가 멈추면 호출하는 쪽이 전부 함께 실패하고, 그다음 모두가 같은 순간에 같은 백오프 일정을 시작합니다. Jitter가 없으면 재시도가 한 번에 몰린 봉우리로 도착하는 일이 되풀이됩니다.

Full Jitter를 권합니다. 0부터 현재 백오프 상한 사이에서 균등하게 지연을 고르는 방식입니다. 고정값에 작은 흔들림만 더하는 방식보다 부하가 고르게 퍼집니다.
