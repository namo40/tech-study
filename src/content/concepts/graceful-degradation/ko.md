---
title: "Graceful Degradation"
summary: "핵심만 남기고 나머지를 접는 계획된 모드입니다. 부분적으로 살아 있는 법을 아는 것이 기술이며, 그래야 일부를 잃은 시스템이 전체를 잃지 않습니다."
category: "복원력과 장애 대응"
scene: fallback
sceneStep: 4
related:
  - label: Fallback
    slug: fallback
  - label: Load Shedding
    slug: load-shedding
  - label: Throttling
    slug: throttling
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Rate Limiter
    slug: rate-limiter
  - label: Tail Latency
    slug: tail-latency
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
---

장면의 마지막 단계에서 `core only` 칩이 켜지고, 추천 행은 빨갛게 변하는 대신 사라집니다. 그 차이가 이 개념의 전부입니다. 실패는 나에게 일어나는 일이고, 모드는 내가 설계하고 이름을 붙이고 문서에 적어 두어서 새벽 세 시에 일부러 켤 수 있는 것입니다. 행이 접히는 것은 서비스가 "지금 그 부분은 하지 않습니다"라고 말하는 것이고, 그 문장은 누군가 미리 적어 두어야만 시스템이 할 수 있는 말입니다.

설계 작업은 아무것도 불타지 않을 때 제품의 어느 부분이 핵심이고 어느 부분이 아닌지를 정하는 일입니다. 그 대화는 불편한데, 정확히 그래야 마땅합니다. 장애 중에 아무도 하고 싶지 않은 질문을 미리 하게 만들기 때문입니다. 하나만 제공할 수 있다면 그것은 무엇인가. 돈을 받을 수 있는 가게는 살아 있는 가게입니다. 추천도, 개인화 배너도, 리뷰 개수와 배송 예정일도 없는 같은 가게는 더 못한 가게이지만 여전히 가게입니다. 우선순위를 적어서 운영 문서와 함께 두세요. 가치의 절반은 스위치에 있고 절반은 목록에 있는데, 그 스위치를 얼마나 빨리 쓸 엄두를 내는지를 정하는 쪽은 목록입니다.

그다음으로 그 모드에 손이 닿아야 합니다. 배포가 필요한 저하는 모드가 아니라 압박 속의 릴리스이고, 그것은 엔지니어링이 최악의 결정을 내리는 상태입니다. 각 부분을 기본값이 켜짐인 기능 플래그 뒤에 두고, 꺼짐 경로를 한 번은 실제로 태워 보세요. 그러면 부가 기능을 끄는 일이 설정 한 번 바꾸는 일이 되고 몇 초 만에 반영됩니다. 플래그는 기능마다 하나씩 두는 것보다 묶음으로 엮는 편이 낫습니다. 압박 속에서 열한 개의 스위치를 기억해야 하는 운영자는 그중 하나를 틀리지만, 열한 가지를 한꺼번에 끄는 `core only` 하나는 누구나 내릴 수 있는 결정입니다.

낮추는 것은 모드의 절반일 뿐이고, 나머지 절반은 돌아오는 일입니다. 장면에서 복원은 일부러 한 번의 스위치가 아닙니다. 의존 대상이 스스로 정상이라고 알리고, 작은 모습이 꺼지고, 다음 요청이 추천 서비스가 정말로 답한다는 것을 증명하고, 그러고 나서야 fallback 칩이 꺼지며, 그 뒤로 한도가 기능 하나씩 풀립니다. 한꺼번에 되돌리는 것은 방금 올라온 의존 대상에 억눌려 있던 부하 전부를 겨누는 일이고, 그것을 다시 쓰러뜨리는 확실한 방법입니다. 내려간 방식대로, 단계를 나누어, 각 단계마다 지켜보면서 돌아오세요.

낮춰진 상태는 운영자만 볼 수 있어서는 안 됩니다. 사용자는 작아진 제품은 놀랄 만큼 잘 견디지만 알 수 없는 제품은 잘 견디지 못합니다. 그러니 무엇이든 말해 주세요. 추천을 지금 볼 수 없다는 조용한 한 줄이, 버그처럼 읽히는 빈 상자보다 낫습니다. 안에서는 그 모드를 오류율 옆 대시보드에 두어야 합니다. 일주일째 `core only`로 도는 서비스는 누군가 무언가를 껐고 다시 켜자는 일감은 아무도 적지 않은 서비스이기 때문입니다. 저하 모드에는 만료일을 붙이거나, 최소한 내일도 켜져 있으면 울리는 경보를 붙여 두는 것이 좋습니다.

마지막으로 덧붙일 것은, 이것이 나중에 더하는 성질이 아니라 처음부터 짜 넣는 성질이라는 점입니다. graceful degradation은 코드에서 경계로 드러납니다. 부가 정보를 가져오는 호출이 핵심 질의와 분리되어 있고, 자기 타임아웃과 자기 예산과 자기 플래그를 가지고 있고, 화면이 그것 없이도 그려집니다. 질의 하나와 템플릿 하나로 모든 것을 가져오는 페이지는 아예 저하할 수 없습니다. 접을 이음새가 없기 때문입니다. 부분적으로 살아 있는 법을 아는 시스템이 완전히 죽는 일은 드문데, 그 이유는 복원력 라이브러리가 아니라 누군가 모든 것이 잘 돌아갈 때 이음새를 그려 두었다는 데 있습니다.
