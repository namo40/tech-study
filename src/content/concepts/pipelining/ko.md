---
title: "Pipelining"
summary: "파이프라이닝은 앞선 응답을 기다리지 않고 다음 요청을 이어 보냅니다. 질문은 차례를 지키지 않아도 되지만 응답은 여전히 물어본 순서대로 돌아와야 해서, 막힘을 없앤 것이 아니라 옮겼습니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: multiplexing
sceneStep: 3
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Keep-Alive
    slug: keep-alive
  - label: HTTP/2
    slug: http-2
  - label: gRPC
    slug: grpc
  - label: Streaming
    slug: streaming
  - label: Tail Latency
    slug: tail-latency
  - label: Request Timeout
    slug: request-timeout
  - label: Connection Timeout
    slug: connection-timeout
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: I/O Completion Port
    slug: io-completion-port
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
---

파이프라이닝은 keep-alive 다음에 떠오르는 당연한 발상이고, 알아 둘 가치가 있는 이유는 옳은 직관을 문제의 잘못된 절반에 적용했기 때문입니다. keep-alive는 요청 사이에 연결이 헐리는 일을 멈췄고, 파이프라이닝은 다음 질문을 던지기 전에 답을 기다리는 일을 멈춥니다. 요청 셋이 연달아 나가고, 예전에는 세 번 치르던 왕복 시간을 한 번만 치릅니다. 왕복이 긴 회선이라면 정확히 원하던 절약입니다.

해방하지 못한 절반은 답입니다. HTTP/1.1에는 선 위에 요청 식별자가 없습니다. 응답은 위치로 요청과 짝지어지므로 두 번째 응답은 정의상 두 번째 요청의 답입니다. 그래서 응답은 요청을 보낸 순서대로 돌아와야 하고, 요청 셋을 파이프라이닝한 클라이언트는 그 순서대로 읽겠다고 약속한 셈이 됩니다. 첫 번째가 느리면 두 번째와 세 번째는 이미 끝나 서버의 버퍼에 앉아 있으면서도 나가지 못합니다. 막힘은 아무 데도 가지 않았습니다. 선의 요청 쪽에서 응답 쪽으로 옮겨 갔을 뿐이고, 장면이 그리는 그림이 바로 그것입니다.

그래도 많은 경우 실질적인 개선이기는 했으니, 파이프라이닝이 죽은 이유는 이것이 아닙니다. 죽은 곳은 네트워크였습니다. 요청 하나에 응답 하나라는 가정 위에서 작성된 중간 장비들, 그러니까 프록시와 투명 캐시와 로드 밸런서가 파이프라인된 스트림을 만나면 요청을 버리거나 순서를 바꾸거나 응답의 경계를 조용히 망가뜨렸습니다. 서버까지의 경로가 안전한지 클라이언트가 미리 알아낼 방법이 없었고, 실패는 오류가 아니라 쓰레기 데이터를 만들어 냈습니다. 브라우저들은 기본값을 끈 채로 내보냈다가 결국 제거했고, 오늘날의 일반적인 조언은 파이프라이닝은 켜 볼 대상이 아니라는 것입니다. 발상 자체는 자기 채널을 가진 프로토콜, 경로 전체가 한 주인 아래 있는 환경에서 살아남아 있습니다.

여기서 배울 것은 동시성에는 신원이 필요하다는 점입니다. 응답을 세는 대신 이름표를 붙일 수 있게 되면 응답은 어떤 순서로도 돌아올 수 있고, 파이프라이닝이 없애지 못한 순서 제약은 그냥 존재하기를 그칩니다. HTTP/2의 프레임이 하는 일이 정확히 그것입니다. 모든 프레임이 스트림 식별자를 지니고 다니므로 요청 셋이 연결 하나 위에 떠 있을 수 있고 답은 준비되는 대로 도착할 수 있습니다. 파이프라이닝은 이름표 없는 같은 발상이고, 그 차이 하나가 한쪽은 각주로 남고 다른 한쪽은 웹이 돌아가는 방식이 된 이유 전부입니다.
