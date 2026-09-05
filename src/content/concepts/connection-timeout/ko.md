---
title: "Connection Timeout"
summary: "connection timeout은 의존 대상에서 답을 받아 내는 시간이 아니라 의존 대상까지 닿는 시간에 두는 상한이며, 그래서 호출 자체를 덮는 설정과는 별개입니다."
category: "복원력과 장애 대응"
scene: request-timeout
sceneStep: 2
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Idle Timeout
    slug: idle-timeout
  - label: Retry
    slug: retry
references:
  - title: SocketsHttpHandler.ConnectTimeout
    url: https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler.connecttimeout
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: SqlConnection connection string keywords
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-string-syntax
---

연결을 여는 일과 연결을 쓰는 일은 실패하는 방식이 다르므로 상한도 따로 둡니다. 연결 시도는 DNS 조회와 TCP 핸드셰이크, 그리고 대개 TLS 핸드셰이크로 이루어지며, 그 어느 것에도 의존 대상의 애플리케이션 코드는 관여하지 않습니다. 호스트가 사라졌거나 경로가 블랙홀이 되었거나 방화벽이 패킷을 거절하는 대신 버리고 있으면, 연결은 실패하지 않고 멈춰 있습니다. 운영체제 자체의 재시도 일정이 끝날 때까지인데, 어떤 플랫폼에서는 그것이 1분을 훌쩍 넘깁니다. connection timeout은 바로 이 경우를 위해 있고, 호출별로 넉넉하게 잡은 타임아웃이 이 구간을 덮어 주지 못하는 이유이기도 합니다. `HttpClient`에서는 `SocketsHttpHandler.ConnectTimeout`이 그 자리를 맡는데, 기본값이 `Timeout.InfiniteTimeSpan`이라 직접 정하기 전에는 상한이 없고 그때까지는 운영체제의 일정이 유일한 한계입니다. SQL Server에서는 연결 문자열의 `Connect Timeout`이 맡고, 이쪽에는 기본값이 있습니다. 15초입니다.

호출 전체가 아니라 한 단계만 덮기 때문에 connection timeout은 짧아야 합니다. 같은 네트워크 안의 정상 호스트에 닿는 데는 한 자릿수 밀리초가 걸리고, 리전을 건너도 수십 밀리초입니다. 1~2초 안에 끝나지 않은 연결은 느린 것이 아니라 고장 난 것이며, 쓸 만한 대응은 곧바로 실패시켜 호출자가 다른 엔드포인트를 시도하거나 요청을 덜어 내게 하는 것입니다. 재시도가 대체로 안전한 상한도 여기 하나뿐입니다. 아직 아무것도 보내지 않았으니 절반만 적용된 상태가 있을 수 없기 때문입니다.

혼동이 생기는 지점은 풀을 쓰는 클라이언트입니다. 밖에서 보면 아주 다른 두 기다림이 똑같이 보이기 때문입니다. 연결이 맺어지기를 기다리는 것은 connection timeout입니다. 풀이 최대 크기에 닿아 모든 연결이 사용 중이라 빈 연결이 나기를 기다리는 것은 풀 대기 시간이고, 이는 다른 설정이자 다른 해결책입니다. 데이터베이스가 한가하고 멀쩡한데도 연결 오류처럼 보이는 실패가 나기 시작한다면 살펴볼 곳은 네트워크가 아니라 풀입니다. connection timeout을 올려 봐야 줄만 더 길어집니다.
