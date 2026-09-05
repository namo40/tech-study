---
title: "Token Bucket"
summary: "Token Bucket은 용량만큼의 버스트를 허용하고, 지속 속도는 리필 속도까지만 허용합니다. Rate Limiter를 구현할 때 가장 널리 쓰이는 알고리즘입니다."
category: "복원력과 장애 대응"
scene: rate-limiter
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Fixed Window
    slug: fixed-window
  - label: Sliding Window
    slug: sliding-window
references:
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
---

Token Bucket은 정해진 개수까지 토큰을 담아 두고 일정한 속도로 채웁니다. 요청은 토큰 하나를 가져가고, 비어 있는 버킷에 도착한 요청은 거부됩니다. 이 알고리즘은 용량과 리필 속도, 두 숫자로 전부 설명됩니다.

용량은 허용하는 버스트의 크기입니다. 용량이 20이면 한동안 조용했던 클라이언트가 요청 20개를 연달아 보낼 수 있습니다. 쉬는 동안 토큰이 쌓였기 때문입니다. 리필 속도는 지속 속도입니다. 구간을 충분히 길게 잡으면 클라이언트는 결코 그 속도를 넘길 수 없습니다.

Fixed Window 방식에는 버킷에 없는 경계 문제가 있습니다. 분당 100건 제한이라면 클라이언트는 분이 끝나기 직전에 100건, 분이 바뀐 직후에 다시 100건을 보낼 수 있습니다. 2초 남짓 사이에 200건이지만 규칙은 어기지 않았습니다. 토큰은 쓰고 채우는 일이 끊임없이 이어지므로 맞춰서 노릴 경계가 없습니다.

리필 속도는 의존 대상이 감당할 수 있는 양에서 정하고, 용량은 정상적인 버스트가 얼마나 큰지에서 정합니다. 리필 몇 초 분량을 용량으로 잡는 것이 흔한 출발점입니다. 그보다 훨씬 크게 잡으면 버스트가 이어지는 동안 제한이 아무것도 지켜 주지 못합니다.
