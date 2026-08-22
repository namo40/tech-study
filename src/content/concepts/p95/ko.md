---
title: "p95"
summary: "p95는 스무 번 중 가장 느린 한 번이 겪는 지연입니다. 경고로 쓸 만큼 일찍 움직이고 흔들리지 않을 만큼 표본이 뒷받침되어서, 알림 기준은 보통 여기에 둡니다."
category: "요구사항과 품질 속성"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
references:
  - title: Built-in metrics in ASP.NET Core
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics-aspnetcore
---

p95를 알림 기준으로 삼는 이유는, 하나의 숫자에 바라는 두 가지인 민감도와 안정성 사이에 놓여 있기 때문입니다. p99는 요청 몇 개에 반응하며 그만큼 함께 흔들리고, p50은 거의 반응하지 않습니다. p95는 트래픽의 의미 있는 비율이 느려졌을 때 움직이고, p99보다 먼저 움직입니다.

hedge를 설정할 때 기준으로 삼는 숫자이기도 합니다. p95만큼 기다린 뒤에 두 번째 사본을 보내면 스무 번 중 열아홉 번은 사본이 나가지 않습니다. 추가 부하가 그만한 값어치를 할 정도로 작게 유지되는 것은 이 덕분입니다.

p95는 혼자 읽지 말고 p50과의 비율로 읽습니다. p95가 p50의 두 배라면 흔한 정도의 분포입니다. p95가 p50의 열 배라면 그 안에 서로 다른 두 집단이 있다는 뜻이고, 재미있는 질문은 무엇이 둘을 갈랐는가입니다. 캐시 미스, 새로 여는 연결, 다른 샤드가 흔한 답입니다.
