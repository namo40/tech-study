---
title: "Retry Budget"
summary: "Retry Budget은 전체 트래픽 가운데 재시도가 차지할 수 있는 비율을 제한해, 이미 힘들어하는 의존 대상이 평소의 몇 배를 떠안지 않게 합니다."
category: "복원력과 장애 대응"
scene: retry
sceneStep: 4
related:
  - label: Retry
    slug: retry
  - label: Retry Storm
    slug: retry-storm
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
references:
  - title: "Handling Overload (Google SRE Book)"
    url: https://sre.google/sre-book/handling-overload/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Retry Budget은 재시도를 평상시 트래픽에 대한 비율로 제한합니다. 예를 들어 10%로 정합니다. 그 몫을 다 쓰면 이후의 실패는 재시도하지 않고 호출한 쪽에 그대로 돌려줍니다.

호출마다 두는 제한만으로는 부족합니다. 호출당 3회는 적어 보이지만, 모든 호출이 실패하는 순간 의존 대상은 평소의 세 배를 받게 됩니다. 가장 여력이 없을 때 말입니다. Budget은 호출 하나가 아니라 시스템 전체에 두는 제한입니다.

Budget은 호출하는 쪽의 인내심이 아니라 의존 대상의 여유를 기준으로 정하고, 사용률을 지표로 남깁니다. 오류율보다 먼저 포화되기 때문입니다.

.NET에는 기성 retry budget 전략이 없습니다. Polly도 `Microsoft.Extensions.Http.Resilience`도 제공하지 않으므로, 가장 가까운 대체물인 Circuit Breaker, 예산을 대신 구현해 주는 서비스 메시, 아니면 `OnRetry`에서 재시도를 평상시 트래픽에 견주어 직접 세는 것 중에서 고릅니다.
