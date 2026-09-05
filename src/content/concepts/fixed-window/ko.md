---
title: "Fixed Window"
summary: "Fixed Window는 시계에 맞춘 칸 안에서 요청을 세고 시계에 맞춰 초기화합니다. 그래서 가장 값싼 리미터가 되고, 경계를 걸쳐 배치된 버스트가 설정한 한도의 두 배로 통과하는 이유가 됩니다."
category: "복원력과 장애 대응"
scene: sliding-window
sceneStep: 1
related:
  - label: Sliding Window
    slug: sliding-window
  - label: Rate Limiter
    slug: rate-limiter
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Load Shedding
    slug: load-shedding
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
---

Fixed Window는 제대로 동작하는 가장 단순한 속도 제한입니다. 시간을 시계에 맞춘 같은 크기의 칸으로 나누고, 키마다 칸마다 카운터 하나를 두고, 카운터가 한도보다 작으면 요청을 받아들이고, 시계가 다음 칸으로 넘어가면 카운터를 0으로 되돌립니다. Redis에서는 현재 분이 이름에 들어간 키에 `INCR`과 `EXPIRE`를 거는 일이고, 메모리에서는 정수 하나와 시각 하나입니다. 여기에는 틀릴 만한 알고리즘이 없고, 매력의 대부분이 바로 그것입니다.

그 단순함의 대가는 전부 경계에 몰려 있습니다. 카운터가 트래픽이 아니라 시계에 맞춰 초기화되므로, 한 창의 마지막 순간과 다음 창의 첫 순간 사이에는 한도를 통째로 되돌려 주는 초기화가 놓여 있습니다. 경계 직전에 허용량을 다 쓰고 경계 직후에 다시 허용량을 다 쓰는 클라이언트는 창 하나보다 짧은 구간에 한도의 두 배를 보낸 것이며, 규칙은 하나도 어기지 않았습니다. 분당 100이라는 한도라면 약 2초 안에 200이고, Fixed Window의 실효 최대치는 언제나 설정한 한도의 두 배이며, 그 일이 일어나는 구간은 클라이언트가 원하는 만큼 짧아집니다.

이것은 미묘한 실패 방식이 아닙니다. 경계가 공개되어 있기 때문입니다. 벽시계 위의 둥근 숫자라서 호출자는 그것을 찾아낼 필요가 없고 시각만 보면 되며, 한도를 일부러 밀어붙이는 쪽은 즉시 그 자리를 찾아냅니다. 더 나쁜 것은 평범한 클라이언트들도 의도 없이 그 자리로 모인다는 점입니다. 정각에 잡힌 재시도, 매시 정각의 크론 작업, 공유 일정에 깨어나는 모바일 클라이언트. 두 배가 된 버스트가 키 공간에 얇게 퍼지는 대신 모두에게서 한꺼번에 도착하고, 그때가 바로 의존 대상이 가장 감당하기 어려운 순간입니다.

Fixed Window를 그 성질 그대로 두면서 쓸 만하게 만드는 완화책이 둘 있습니다. 첫째는 키를 해싱해 얻은 값으로 키마다 창의 기준점을 따로 주는 것입니다. 그러면 이음새가 시계 위에 겹치는 대신 창 전체에 흩어집니다. 키별로 보면 두 배 버스트는 여전히 있지만 인스턴스 전체에서 동기화되지는 않으며, 그것이 뾰족한 스파이크와 완만한 물결의 차이입니다. 둘째는 정직함입니다. 진짜 최대치는 설정값의 두 배라고 적어 두고, 리미터 뒤에 있는 것을 그 최대치에 맞춰 잡고, 설정한 숫자를 계약이나 요금제 등급에 절대 넣지 않습니다. 클라이언트에게 실제로 물을 수 있는 숫자가 아니기 때문입니다.

창의 길이도 이음새를 염두에 두고 정합니다. 짧은 창은 절대량으로 보면 두 배가 작아지고 대신 더 자주 일어납니다. 한도 10짜리 1초 창은 2초 안에 20으로 정점을 찍고, 한도 36,000짜리 1시간 창은 72,000으로 정점을 찍습니다. 대개는 짧은 창이 하류에 더 친절하며, 긴 창이라면 흡수했을 정당한 짧은 버스트를 거절하는 대가를 치릅니다.

한도가 방어선이 아니라 약속이 되는 순간 다른 것을 꺼냅니다. Sliding Window는 지금부터 뒤로 N초를 재므로 겨냥할 초기화가 없고 한도가 매 순간 지켜집니다. 정확한 형태는 도착마다 시각 하나를 기억하고, 흔한 근사는 키마다 카운터 둘을 두고 이전 것을 현재와 겹치는 만큼 가중합니다. 이 근사가 메모리 몇 분의 일로 공짜 초기화를 없애 줍니다. .NET에서는 클래스 이름 하나가 선택입니다. 이 방식은 `FixedWindowRateLimiter`, Sliding Window는 `SlidingWindowRateLimiter`이며, 설정 방식이 같고 둘 다 `PartitionedRateLimiter`로 키마다 나뉩니다. 두 번째 클래스는 방금 말한 가중 쌍과는 다른 근사입니다. `SegmentsPerWindow`개의 카운터를 두고 `Window`/`SegmentsPerWindow`마다 가장 오래된 세그먼트의 퍼밋을 가중 없이 통째로 되돌려 줍니다. 그리고 프로세스 안의 `FixedWindowRateLimiter`는 시계에 맞춰져 있지 않습니다. 창은 리미터가 만들어질 때 시작되고, `PartitionedRateLimiter`는 키마다 그 키의 첫 요청에 하나씩 만들므로, 해싱을 하지 않아도 이음새는 이미 흩어져 있습니다. 시계에 맞춰진 쪽은 Redis의 `INCR`과 `EXPIRE` 방식이고, 노드 사이의 시계 오차가 문제되는 곳도 거기입니다. 무엇을 쓰든 거절할 때는 429와 `Retry-After`를 돌려줍니다. 언제 돌아오라는 말 없이 거절하는 리미터는 모든 클라이언트에게 계속 두드리는 법을 가르칩니다.
