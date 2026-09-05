---
title: "Retry Storm"
summary: "Retry Storm은 같은 박자로 몰린 재시도가 회복을 시작한 의존 대상을 다시 쓰러뜨리는 현상입니다."
category: "복원력과 장애 대응"
scene: retry
sceneStep: 3
related:
  - label: Retry
    slug: retry
  - label: Jitter
    slug: jitter
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

Retry Storm은 많은 클라이언트가 같은 일정으로 재시도할 때 벌어지는 일입니다. 의존 대상이 실패하면 호출하는 쪽이 모두 같은 간격만큼 기다렸다가 같은 순간에 돌아옵니다. 그 몰림이 아직 회복이 끝나지 않은 의존 대상을 다시 쓰러뜨립니다.

피해는 스스로 만든 것입니다. 처음 장애는 짧았을 수 있지만, 재시도 정책이 그것을 의존 대상을 계속 눕혀 두는 반복된 파도로 바꿉니다. 여러 계층에 재시도를 두면 곱해집니다. 세 계층이 각각 3회면 호출 하나가 27번이 됩니다.

첫 번째 해법은 지터, 두 번째는 Retry Budget, 마지막 안전장치는 Circuit Breaker입니다. 셋이 함께 같은 박자를 깨고, 양을 제한하고, 회복 가능성이 낮은 동안에는 확인 자체를 멈춥니다.
