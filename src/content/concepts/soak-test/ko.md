---
title: "Soak Test"
summary: "Soak Test는 시스템이 감당할 수 있는 부하를 몇 시간 동안 유지하며, 시간이 지나야 드러나는 결함을 찾습니다. 누수, 드리프트, 그리고 늘어나기만 하고 돌아오지 않는 모든 것이 대상입니다."
category: "테스트와 검증"
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Garbage Collection
    slug: garbage-collection
  - label: Connection Lifetime
    slug: connection-lifetime
references:
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: Debug a memory leak in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-memory-leak
---

Soak Test는 일부러 지루합니다. 서비스가 감당할 수 있다고 이미 확인된 부하를 고르는데, 보통은 Capacity Test가 찾은 지속 가능한 처리량입니다. 그리고 몇 분이 아니라 몇 시간을 유지합니다. 극적인 일은 벌어지지 않아야 하고, 그게 바로 핵심입니다. 찾으려는 것은 10분짜리 실행으로는 만들어 낼 수 없는 느린 종류의 결함이기 때문입니다.

신호는 수준이 아니라 추세입니다. 작업 집합, gen 2 힙 크기, 열린 연결 수, 스레드 수, 핸들 수를 경과 시간을 축으로 그려 보고, 몇 시간에 걸쳐 꾸준히 오르기만 하고 내려오지 않는 것이 있다면 그것이 결과입니다. 지연 시간 지표가 전부 평평했더라도 마찬가지입니다. 요청당 수십 바이트짜리 누수는 첫 100만 건까지는 보이지 않다가 1000만 건째에 치명적이 됩니다. 반납되지 않는 연결, 상한 없는 캐시, 아무도 돌리지 않는 로그 파일도 똑같습니다.

실행 중에는 아무것도 재시작하지 않고, 마지막 한 시간을 목표가 아니라 첫 한 시간과 비교합니다. 그래프가 휘기 시작하는 순간 끝나는 soak는 주어진 질문에 답할 만큼 오래 돌지 않은 것이고, 모든 그래프가 평평한 채로 끝난 soak는 기록해 둘 가치가 있습니다. 다음 회귀를 한눈에 알아보게 해 주는 것이 바로 그 기록이기 때문입니다.
