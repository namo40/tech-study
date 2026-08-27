---
title: "Load Shedding"
summary: "포화에 이르기 전에 일부러 일감의 일부를 버리는 방법입니다. 처리할 수 있는 양보다 많이 들어올 때, 몇몇에게 주는 빠른 거절이 모두에게 주는 느린 실패보다 쌉니다."
category: "복원력과 장애 대응"
scene: fallback
sceneStep: 3
related:
  - label: Fallback
    slug: fallback
  - label: Throttling
    slug: throttling
  - label: Rate Limiter
    slug: rate-limiter
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
---

장면의 3단계는 서비스가 모두를 받으려는 시도를 그만두는 순간입니다. 들어오는 속도가 처리할 수 있는 양을 넘어서고, `shed` 칩에 불이 들어오고, 남은 허용량이 없을 때 도착한 요청은 데이터베이스도 캐시도 중요한 스레드도 건드리기 전에 문 앞에서 `503`과 함께 되돌아갑니다. 구성 카드 옆의 숫자가 그 정책이 치른 값이며, 고장이 아니라 가격으로 읽으라고 놓아 둔 것입니다.

덜어 내는 근거는 체념이 아니라 산수입니다. 초당 C개를 처리할 수 있는 서비스에 그보다 많은 R개가 들어오면, 이미 모두를 받을 능력은 사라진 상태입니다. 남은 질문은 모자란 몫을 어떤 방식으로 전달하느냐뿐입니다. 아무것도 덜어 내지 않으면 초과분은 줄을 서고, 과부하가 이어지는 동안 그 줄은 어느 깊이에서 안정되지 않고 계속 자랍니다. 그러면 용량 문제가 지연 문제로 바뀌는데, 지연 문제는 초과분만이 아니라 모든 요청에 닿습니다. 모두가 기다리고, 모두가 결국 타임아웃하고, 서비스가 겨우 끝낸 일감은 이미 포기한 클라이언트에게 버려집니다. 덜어 내기는 같은 모자란 몫을 흩뿌리는 대신 한곳에 모읍니다. 소수는 빠르고 값싸고 정직한 거절을 받고, 다수는 한산한 오후에 받았을 속도로 응답을 받습니다.

거절은 정말로 값싸야 하는데, 여기서 어긋나기 쉽습니다. 인증을 마치고, 모델 바인딩을 마치고, 테넌트를 찾으려 데이터베이스를 한 번 다녀온 다음에 503을 만든다면, 덜어 내는 비용이 처리하는 비용과 거의 같아져서 서비스는 어차피 가라앉고 대시보드 숫자만 더 나빠집니다. 통제할 수 있는 가장 바깥쪽 가장자리에서, 값비싼 작업 앞에서 덜어 내고, 거절 경로가 할당을 최대한 적게 하도록 만들어야 합니다. ASP.NET Core라면 rate limiter 미들웨어를 파이프라인 앞쪽에 두고 `QueueLimit = 0`으로 두어 용량을 넘은 요청이 세워지는 대신 거절되게 한다는 뜻입니다.

*어떤* 요청을 버릴지 정하는 곳에 실제 설계가 있고, 도착 순서대로 버리는 것은 아무도 고르지 않은 기본값입니다. 토큰이 비었을 때 도착한 것을 그대로 거절하는 한도는 결제 확인과 썸네일 요청을 같은 무게로 다룹니다. 그러면 한 해에서 가장 바쁜 십 분 동안 서비스가 자기 값을 치러 주는 트래픽을 태연히 거절합니다. 한도를 나누세요. 엔드포인트 종류별로, 비용별로, 고객 등급별로 통을 따로 둡니다. 조회와 검색에는 일찍 걸리는 한도를, 결제와 결제 콜백에는 거의 걸리지 않는 한도를 주고, 상태 확인과 준비 확인 엔드포인트는 아예 대상에서 빼야 합니다. 자기 프로브를 덜어 내는 것이 바쁜 서비스가 차갑게 재시작되는 경로이기 때문입니다.

덜어 내기와 재시도는 미리 계획하지 않으면 나쁘게 맞물립니다. 거절당한 클라이언트는 다시 시도하고, 곧바로 다시 시도하는 클라이언트는 덜어 낸 요청 하나를 두 개로 만든 셈입니다. `Retry-After`를 보내고, 통제할 수 있는 클라이언트는 그것을 지키게 하고, 재시도가 다시 파도로 몰려오지 않도록 무작위 편차를 더합니다. 이것은 retry storm과 같은 이야기를 서버 쪽에서 본 것입니다. 세상에서 가장 값싼 거절도 들어오는 속도를 세 배로 만든다면 도움이 되지 않습니다.

마지막으로, 덜어 낸 비율은 숨겨야 할 오류가 아니라 일급 신호로 다루는 것이 좋습니다. 요청받은 양과 처리할 수 있는 양의 격차를 가장 직접적으로 재는 값이고, 지연보다 먼저 움직이기 때문에 아직 나빠지지 않은 p99보다 나은 오토스케일링 방아쇠이자 나은 호출 신호가 됩니다. 최대 시간대에 조회 트래픽의 2%를 덜어 내는 서비스는 설계대로 도는 중이고, 20%를 덜어 내거나 새벽 세 시에 조금이라도 덜어 내는 서비스는 아무도 짐작할 필요 없는 용량 이야기를 하고 있는 것입니다.
