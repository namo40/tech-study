---
title: "Head-of-Line Blocking"
summary: "head-of-line blocking은 줄이 뒤로 넘기는 지연입니다. 맨 앞의 일이 끝나지 못하면 뒤의 모든 일은 아무리 값싸고 아무리 준비돼 있어도 함께 기다립니다. 부하의 성질이 아니라 순서의 성질입니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: multiplexing
sceneStep: 2
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: HTTP/2
    slug: http-2
  - label: Streaming
    slug: streaming
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

head-of-line blocking은 줄이 맨 앞이 아닌 것들에게 하는 일입니다. 지금 처리되는 하나가 끝나지 못하니 다른 무엇도 시작될 수 없고, 그 하나의 비용은 뒤에 선 모두에게 청구됩니다. 이름은 네트워크 스위칭에서 왔습니다. 입력 큐 맨 앞의 패킷이 전달되지 못하면 전달할 수 있는 뒤의 패킷들까지 멈춰 서는 상황이었습니다. 하지만 이 모양은 네트워크보다 훨씬 오래됐고 훨씬 일반적입니다. 이것은 순서의 성질입니다. 일이 정해진 차례대로 처리되고 그중 한 단위가 필요한 만큼 시간을 쓰도록 허용되는 곳이면 어디에나 나타납니다.

따로 이름을 붙일 만한 이유는 정작 중요한 계측에서 이 줄이 보이지 않기 때문입니다. 서버를 보면 하나를 빼고 모든 요청이 빨리 답해졌습니다. 클라이언트를 보면 요청 셋이 저마다 가장 느린 것만큼 걸렸습니다. 기다림은 일이 시작되기 전에, 양쪽 어디에도 계측이 걸려 있지 않은 자리에서 일어났습니다. 그래서 증상은 오류가 아니라 꼬리가 두꺼운 지연 분포로 도착합니다. 중앙값은 정직하게 남습니다. 중앙의 요청은 대개 느린 것 뒤에 서 있지 않기 때문입니다. p95와 p99가 무너집니다. 그것들이 바로 뒤에 서 있던 요청들이기 때문입니다.

HTTP/1.1에서 그 줄은 연결입니다. keep-alive 덕에 연결은 다시 열리지 않고도 요청을 잇달아 실어 나릅니다. 대단히 값진 일이지만 한 번에 하나씩입니다. 클라이언트는 앞선 응답을 다 읽기 전에는 다음 요청을 보낼 수 없습니다. 그래서 느린 답 하나가 자기 시간 내내 선을 차지하고, 뒤에 선 작고 준비되고 값싼 요청들이 그 값을 온전히 치릅니다. 브라우저는 오리진마다 연결을 여러 개 열어 이 문제를 십 년쯤 가려 왔는데, 그것은 문제를 없앤 것이 아니라 연결을 두고 벌이는 경합으로 바꾼 것입니다. 서비스 사이 호출도 연결 풀에서 같은 임시방편을 얻는데, 동시 요청마다 소켓 하나를 치르는 값이 붙고, 그 풀에 상한을 두거나 경로가 연결 하나에 묶이는 순간 줄이 다시 나타납니다.

일반적인 해법은 일 자체가 요구하지도 않는 순서를 강요하기를 그만두는 것입니다. HTTP/2는 요청마다 하나의 연결 위에 자기 스트림을 주므로 느린 스트림은 자기만 막습니다. 같은 수는 이 패턴이 나타나는 곳마다 등장합니다. 독 메시지 하나가 토픽을 멈춰 세우지 않도록 큐를 나누는 것, 엄격한 순차 대신 한도를 건 병렬 파이프라인을 두는 것, 느려도 되는 호출에 별도 풀을 주는 것 모두 같은 수입니다. 반대로 용량을 늘리는 것은 해법이 아닙니다. 줄은 가득 찬 것이 아니라 순서가 매겨진 것이기 때문입니다. 게다가 순서는 계층을 바꿔 살아남기도 합니다. HTTP/2는 HTTP 계층의 막힘을 없애지만 TCP 계층에는 남겨 두고, 거기서는 잃어버린 패킷 하나가 그 연결을 나눠 쓰는 모든 스트림을 여전히 멈춰 세웁니다. HTTP/3가 QUIC으로 옮겨 간 이유가 그 잔재이고, 물어야 할 질문은 언제나 어느 계층이 순서를 고집하고 있는가라는 점을 잘 일깨워 주기도 합니다.
