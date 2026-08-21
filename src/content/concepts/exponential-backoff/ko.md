---
title: "Exponential Backoff"
summary: "Exponential Backoff는 시도 사이의 대기 시간을 배수로 늘려, 힘들어하는 의존 서비스가 재시도마다 더 긴 여유를 얻게 합니다."
category: "복원력과 장애 대응"
scene: retry
sceneStep: 2
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Exponential Backoff는 시도 사이의 대기 시간을 보통 두 배씩 늘립니다. 첫 재시도가 500ms 뒤라면 그다음은 1초, 2초, 4초가 됩니다. 의존 서비스는 매번 더 긴 여유를 얻습니다.

이 방식이 해결하는 문제는 고정 간격 재시도입니다. 200ms마다 다시 보내면 느려진 의존 서비스가 부하까지 받는 상태가 됩니다. 빠져나가는 것 없이 일만 계속 쌓이기 때문입니다. 간격을 두 배로 늘리면 밀린 작업이 빠질 틈이 생깁니다.

상한을 둡니다. 제한 없이 늘어나면 아무도 기다리지 못할 만큼 긴 대기가 생기므로, 배수와 함께 최대 지연 시간과 전체 Deadline을 같이 정합니다.
