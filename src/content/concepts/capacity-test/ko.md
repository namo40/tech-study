---
title: "Capacity Test"
summary: "Capacity Test는 한 가지 질문에 답합니다. 서비스가 여전히 목표를 만족하는 가장 높은 부하는 얼마인가. 최고점이 아니라 그 숫자가 약속할 수 있는 값입니다."
category: "테스트와 검증"
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Soak Test
    slug: soak-test
  - label: SLO
    slug: slo
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
---

Capacity Test는 Load Test를 거꾸로 읽는 일입니다. p95나 오류율이 목표를 넘을 때까지 부하를 올립니다(먼저 무너지는 쪽이 기준이고, 흔히 오류 쪽입니다). 그런 다음 둘 다 목표 아래였던 마지막 단계로 물러나, 그 수준이 운이 좋았던 게 아니라 안정적이라고 확신할 만큼 유지합니다. 올라가는 길에 본 최고 처리량은 답이 아닙니다. 아무도 합의한 적 없는 지연 시간에서 잰 값이기 때문입니다.

답은 세 부분으로 이루어진 숫자입니다. 처리량, 그것을 재는 기준이 된 목표, 그리고 그때 사용한 요청 구성과 데이터입니다. 뒤의 둘 없이 보고하면 소문일 뿐입니다. 같은 서비스라도 핫 키 하나를 읽기만 하는 구성에서는 훨씬 큰 숫자를 내주고, 쓰기와 차가운 읽기가 제 비율로 섞이면 훨씬 작은 숫자를 내주기 때문입니다.

여유를 남겨 둡니다. 따뜻하고 방해받지 않는 시스템에서 잰 용량은 목표가 아니라 천장이며, 배포와 가비지 컬렉션, 시끄러운 이웃, 실패한 레플리카 하나가 모두 그 천장을 갉아먹습니다. 잰 숫자보다 충분히 낮은 목표를 잡고, 거기에 닿기 전에 확장이 시작되도록 오토스케일러를 설정하고, 데이터 계층이나 풀 크기, 인스턴스 종류를 바꿀 때마다 다시 잽니다.
