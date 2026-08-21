---
title: "Concurrency Limiter"
summary: "Concurrency Limiter는 동시에 처리 중인 호출 수를 제한하고, 정해진 수만큼만 대기열에 두며, 그보다 많은 호출은 거부합니다."
category: "복원력과 장애 대응"
scene: bulkhead
related:
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

Concurrency Limiter는 permit으로 만듭니다. permit 하나는 처리 중인 호출 하나이고, permit 한도는 그 의존 서비스가 어느 순간에 동시에 다루어도 되는 호출 수입니다. 호출은 나갈 때 permit을 가져가고, 응답이 오거나 Timeout이 걸리면 돌려줍니다.

큐는 크기가 정해진 대기실입니다. permit이 모두 나가 있으면 다음 몇 개의 호출은 곧바로 실패하는 대신 자리가 나기를 기다립니다. 크기를 정해 두는 것이 핵심입니다. 상한 없는 큐는 느려진 의존 서비스를 끝없는 메모리 사용과 끝없는 지연으로 바꾸는데, 그것은 거부보다 나쁜 결과입니다.

permit과 큐가 모두 차면 Limiter는 거부합니다. 이 거부는 감당하지 못한 실패가 아니라 기능입니다. 호출하는 쪽을 계속 응답하게 만들고, 가득 찬 칸을 지표에 드러내 줍니다.

Rate Limiter와 Concurrency Limiter는 서로 다른 것을 잽니다. Rate Limiter는 시간 구간마다의 요청 수를 세고, Concurrency Limiter는 지금 처리 중인 요청 수를 셉니다. 1밀리초에 응답하는 의존 서비스는 적은 동시 실행으로도 아주 높은 처리율을 받아 내지만, 10초가 걸리는 의존 서비스는 그러지 못합니다. 대부분의 서비스에는 둘 다 필요합니다.
