---
title: "HTTP/2"
summary: "HTTP/2는 HTTP의 의미론은 그대로 두고 전송 형식만 바꿉니다. 텍스트 줄이 이진 프레임이 되고, 헤더는 압축된 표가 되고, 연결 하나가 요청 하나씩이 아니라 서로 독립된 스트림 여럿을 동시에 실어 나릅니다."
category: "엣지, 라우팅과 서비스 네트워크"
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: Streaming
    slug: streaming
  - label: gRPC
    slug: grpc
  - label: Reverse Proxy
    slug: reverse-proxy
references:
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: Use HTTP/2 with the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

## 언제 쓰나

- 클라이언트가 같은 오리진으로 동시 호출을 많이 보내는 자리에 씁니다. 호출마다 식별자가 붙은 스트림이 되고 서로 다른 스트림의 프레임이 같은 연결 위에서 뒤섞여 오갑니다. 그래서 브라우저가 두던 오리진당 연결 6개 제한도, 그 뒤에 쌓이던 클라이언트 쪽 대기열도 함께 사라집니다. 그 성질을 설명하는 쪽은 multiplexing 페이지이고, 이 페이지는 그것을 제공하는 프로토콜입니다.
- 설계 어딘가에 gRPC가 있다면 HTTP/2는 전제입니다. gRPC는 어쩌다 HTTP/2를 쓰는 것이 아니라 HTTP/2 위에 정의되어 있습니다. 네 가지 호출 형태가 곧 스트림이고, 메타데이터는 HTTP/2 헤더이고, 트레일러는 프레임 배치에 기대고 있습니다. 중간에 HTTP/1.1로 내려가는 구간이 하나 있으면 gRPC는 느려지는 것이 아니라 아예 깨집니다.
- 작은 요청이 많고 헤더가 큰 트래픽에 꺼냅니다. HPACK은 흔한 이름을 모아 둔 정적 표와 양쪽이 함께 유지하는 동적 표에 헤더 필드를 맞춰 압축합니다. 그래서 같은 bearer 토큰과 같은 `user-agent`와 같은 사용자 정의 헤더 열 개를 다시 싣는 열 번째 요청은 킬로바이트 대신 인덱스를 보냅니다. 헤더가 본문보다 큰 API라면 그것이 바이트의 대부분입니다.
- 리버스 프록시 뒤의 연결 수를 줄이는 데 씁니다. 클라이언트 연결 1000개를 끊어 받는 프록시는 그 요청들을 백엔드마다 HTTP/2 연결 몇 개로 실어 보낼 수 있습니다. 백엔드 입장에서 accept 경로와 소켓 표와 TLS 핸드셰이크 예산이 앞단의 유입 규모보다 훨씬 작은 숫자가 됩니다.

## 주의점

- 막힘은 사라진 것이 아니라 한 층 아래로 내려갔습니다. 모든 스트림은 TCP 연결 하나를 타고, TCP는 바이트를 순서대로 올려 주며, 세그먼트 하나가 유실되면 재전송될 때까지 모든 스트림이 멈춥니다. 깨끗한 데이터센터 회선에서는 보이지 않지만, 손실이 잦은 모바일 회선에서는 HTTP/1.1 연결 여러 개보다 느려질 수도 있습니다. HTTP/3이 존재하고 QUIC 위에서 도는 이유가 정확히 이것이고, head-of-line-blocking 페이지가 그 과정을 짚어 줍니다.
- 협상이 핸드셰이크 안에서 일어나기 때문에 실무에서 HTTP/2는 곧 TLS입니다. ALPN이 TLS `ClientHello` 단계에서 `h2`를 알리고 서버가 그것을 고르므로 왕복이 더 들지 않습니다. 평문 `h2c`는 명세에 있지만 주요 브라우저 중 구현한 곳이 없고 RFC 9113은 `Upgrade`를 통한 경로를 폐기했습니다. 그래서 평범한 `http://` 엔드포인트는 협상 없이 HTTP/2를 쓰도록 양쪽 모두에 설정을 넣어야 합니다.
- 서버 푸시는 죽은 기능이니 그 위에 무엇을 얹지 마세요. 초기 명세에 있었지만 매번 캐시와 부딪쳤고 캐시를 이길 만큼 안정적으로 이득을 내지 못했습니다. 브라우저는 지원을 걷어냈고 Kestrel은 애초에 구현하지 않았습니다. 푸시가 겨누던 문제에 남은 답은 `103` 응답에 실리는 early hints입니다.
- 흐름 제어 창은 하나가 아니라 둘이고 둘 다 기본값이 낮습니다. 스트림마다 창이 있고 연결에도 따로 창이 있으며 명세상 각각 64 KiB에서 시작합니다. 둘 중 하나라도 바닥나면 보내는 쪽은 상대가 `WINDOW_UPDATE`를 보낼 때까지 멈춥니다. 이것을 체감하는 트래픽은 큰 업로드와 오래 열려 있는 서버 스트림입니다. 부하 중에 천장을 발견하지 말고 창을 의식적으로 올려 두는 것이 답입니다.

## .NET에서는

- Kestrel의 엔드포인트 기본 프로토콜은 `Http1AndHttp2`입니다. TLS 엔드포인트라면 ALPN으로 요청하는 클라이언트와는 이미 HTTP/2로 협상하고, 그러지 않는 클라이언트에는 계속 HTTP/1.1을 내줍니다. 손볼 곳은 프로토콜을 켜는 일이 아니라 평문 구간과 한도 값입니다.
- 클라이언트 쪽에서 버전은 요구 사항으로 바꾸기 전까지는 선호일 뿐입니다.

```csharp
var handler = new SocketsHttpHandler
{
    // Without this, one client holds one HTTP/2 connection per endpoint and
    // queues once the peer's stream limit is reached.
    EnableMultipleHttp2Connections = true,
};

var client = new HttpClient(handler)
{
    DefaultRequestVersion = HttpVersion.Version20,
    // RequestVersionOrHigher silently falls back to HTTP/1.1; RequestVersionExact
    // turns a failed negotiation into an exception instead of a quiet downgrade.
    DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
};
```

- 알아 둘 한도 값은 `options.Limits.Http2`에 있습니다. `MaxStreamsPerConnection`은 기본값이 100이고 넓게 뻗는 클라이언트가 가장 먼저 부딪치는 숫자입니다. `InitialConnectionWindowSize`와 `InitialStreamWindowSize`는 기본값이 각각 128 KiB와 96 KiB이고, `HeaderTableSize`는 서버가 연결마다 유지하는 HPACK 동적 표의 크기를 제한합니다.
- TLS를 엣지에서 끊고 클러스터 안에서 도는 gRPC 서비스라면 평문 엔드포인트에 `HttpProtocols.Http2`를 명시합니다. 거기에는 프로토콜을 합의해 줄 ALPN이 없으므로 엔드포인트에 직접 알려 줘야 하고, 그쪽으로 부르는 클라이언트에 `RequestVersionExact`가 필요한 이유도 같습니다.
