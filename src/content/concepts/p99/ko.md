---
title: "p99"
summary: "p99는 백 번 중 가장 느린 한 번이 겪는 지연입니다. 지연 목표는 보통 여기에 두며, 의미를 가지려면 구간 안에 표본이 충분해야 합니다."
category: "요구사항과 품질 속성"
scene: tail-latency
sceneStep: 1
related:
  - label: Tail Latency
    slug: tail-latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: Hedging
    slug: hedging
references:
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

목표를 p99에 두는 이유는, p99가 실제 사용자 세션이 만나는 숫자이기 때문입니다. 한 번 방문에서 페이지 서른 개를 여는 사람은 가장 느린 1%를 적어도 한 번 만날 가능성이 매우 큽니다. 그리고 그 한 페이지가 기억에 남습니다.

p99에는 표본이 필요합니다. 초당 요청 10개로 1분이면 관측값이 600개이므로 p99는 그중 여섯 개가 정하고, 운 나쁜 가비지 컬렉션 한 번에도 움직입니다. 숫자가 더 이상 튀지 않을 때까지 구간이나 범위를 넓히고, 엔드포인트별, 인스턴스별, 1분 단위 p99는 대체로 잡음으로 봅니다.

집계 방식도 조심합니다. 백분위는 평균 낼 수 없습니다. 인스턴스 10대의 p99를 구해 그 열 개를 평균 내면 나오는 값은 전체의 p99도 아니고 다른 무엇도 아닙니다. 히스토그램의 구간을 먼저 합치고, 합쳐진 히스토그램에서 백분위를 읽습니다.
