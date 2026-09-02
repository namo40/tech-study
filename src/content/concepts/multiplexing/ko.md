---
title: "Multiplexing"
summary: "다중화는 하나의 연결을 여러 스트림이 동시에 나눠 쓰게 합니다. 요청은 더 이상 서로의 뒤에 줄 서지 않고, 느린 응답은 자기 자신만 막으며, 답이 도착하는 순서는 질문한 순서와 별개가 됩니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: multiplexing
steps:
  - title: "연결은 하나, 질문도 한 번에 하나입니다"
    text: "keep-alive 덕에 연결은 요청 사이에도 살아남지만, 그 위에서 요청은 여전히 차례를 지킵니다. A가 끝나야 B가 묻고, 그다음이 C입니다. 셋 다 빠른 답인데도 전체는 줄의 합입니다."
  - title: "줄의 맨 앞이 막히면 줄 전체가 멈춥니다"
    text: "A가 하필 느립니다. 준비도 됐고 값도 싼 B와 C가 그래도 기다립니다. 차선은 맨 앞에 선 자의 것이기 때문입니다. 느린 답 하나가 모두의 지연이 됩니다. 이것이 head-of-line blocking입니다."
  - title: "파이프라이닝은 질문만 해방했지 답은 해방하지 못했습니다"
    text: "요청은 이제 연달아 나갈 수 있지만 응답은 순서대로 돌아와야 합니다. B와 C는 다 끝났는데 느린 A의 답 뒤에 앉아 기다립니다. 막힘은 사라진 것이 아니라 선의 반대편으로 옮겨 갔습니다."
  - title: "스트림은 도착을 질문에서 풀어냅니다"
    text: "HTTP/2에서는 세 요청이 각자의 스트림으로 연결을 동시에 나눠 씁니다. 느린 A는 이제 A만 막습니다. B가 먼저 도착하고 C가 뒤따르고 A는 올 때 옵니다. 같은 선, 같은 서버인데 사라진 것은 줄 그 자체입니다."
related:
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Pipelining
    slug: pipelining
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

## 언제 쓰나

다중화는 켜고 끄는 기능이라기보다 이미 쓰고 있는 프로토콜의 성질에 가깝습니다. 그래서 던질 만한 질문은 두 가지입니다. 지금 만드는 호출이 다중화가 도와줄 만한 모양인가, 그리고 스택 어딘가에서 그 성질을 조용히 빼앗아 가고 있지는 않은가.

- p95는 치솟는데 p50은 그대로일 때 이 글을 읽을 만합니다. 중앙값은 멀쩡한데 꼬리만 나빠지는 모양은 공유 자원 앞의 줄이 만들어 내는 전형적인 그림입니다. 클라이언트가 HTTP/1.1이고 한 페이지나 한 핸들러가 같은 호스트로 작은 호출 여덟 개를 보낸다면, 여덟 번째는 서버가 바쁘든 한가하든 앞의 일곱 개를 기다립니다.
- 화면 하나가 작은 조각을 여럿 필요로 할 때 들여다봅니다. 위젯 열두 개를 모으는 대시보드, 연관 엔티티를 함께 끌어오는 상세 페이지, 상류 네 곳에서 답을 조립하는 서비스는 모두 요청 셋에 연결 하나인 같은 그림을 숫자만 키운 것입니다. 다중화는 그 합을 최댓값으로 바꿉니다.
- 서비스 사이 호출에서는 특히 중요합니다. 브라우저가 받은 임시방편을 여기서는 받지 못하기 때문입니다. 브라우저는 오리진당 연결 여섯 개를 열어 HTTP/1.1의 문제를 오랫동안 가려 왔는데, 그것은 하나 안에서 얻어 낸 병렬성이 아니라 연결로 사들인 병렬성입니다. `HttpClient`는 기본값으로 그렇게 하지 않고, 가지고 있는 풀도 동시성보다는 재사용을 겨냥한 크기입니다.
- 오래 사는 응답 하나가 선을 통째로 차지할 상황이면 필요합니다. 스트리밍 엔드포인트, 서버 전송 이벤트 피드, 롱 폴링은 HTTP/1.1에서 각자 살아 있는 내내 연결 하나를 소유합니다. 다른 모두가 필요로 하는 바로 그것을 소비하는 셈입니다. HTTP/2에서는 여럿 중 스트림 하나일 뿐입니다.
- gRPC를 검토하고 있다면 다중화는 전제입니다. gRPC는 정의상 HTTP/2이고, 채널 하나 위의 동시 호출 여럿과 열린 채 유지되는 양방향 스트림이라는 호출 모델 전체가 전송 계층이 다중화한다는 가정 위에 서 있습니다. 서비스 하나가 `GrpcChannel` 하나를 공유하는 모양은 편법이 아니라 의도된 사용법입니다.
- 느린 서버를 고치려고 꺼내지는 마세요. 다중화가 없애는 것은 요청이 다른 요청을 기다리는 시간입니다. 요청이 답을 만드는 데 쓰는 시간에는 아무 영향도 주지 않습니다. 장면 속 느린 호출이 1초 걸린 이유가 뒤의 질의가 1초 걸리기 때문이라면, 장면의 어느 단계도 그 1초보다 일찍 끝나지 않습니다.

## 주의점

- HTTP 계층의 head-of-line blocking은 사라지지만 TCP 계층의 것은 남습니다. 그 스트림들은 모두 TCP 연결 하나를 타고, TCP는 바이트를 순서대로 전달합니다. 패킷 하나를 잃으면 재전송이 끝날 때까지 모든 스트림이 멈춥니다. 그 뒤의 바이트를 위로 올려 줄 수 없기 때문입니다. 깨끗한 망에서는 보이지 않지만 손실이 잦은 모바일 회선에서는 HTTP/1.1 연결 여러 개보다 HTTP/2가 느려질 수도 있습니다. HTTP/3가 TCP 대신 QUIC 위에서 도는 이유가 바로 이 사실 하나입니다.
- 연결이 하나라는 말은 혼잡 윈도가 하나라는 말입니다. 모든 스트림이 같은 대역폭 배분을 두고 경쟁하므로 아주 큰 응답 몇 개가 같은 선을 나눠 쓰는 작은 응답들을 굶길 수 있고, 막 열린 연결은 그 위의 모든 스트림을 한꺼번에 느리게 만듭니다. 프로토콜에 우선순위 지정이 있기는 하지만 실제 구현들의 지원이 고르지 않아서 계획의 근거로 삼기는 어렵습니다.
- 연결 위의 동시성에는 상한이 있고 그 값을 정하는 쪽은 서버입니다. `SETTINGS_MAX_CONCURRENT_STREAMS`는 상대가 광고하는 숫자이고, 그 수에 닿으면 이후 요청은 HTTP/1.1에서와 똑같이 클라이언트 쪽에 줄을 섭니다. Kestrel의 기본값은 100입니다. 페이지 하나에는 넉넉하고 세게 팬아웃하는 서비스에는 작은 값이니, 무제한이라고 가정하기보다 실제 값을 알아 두는 편이 좋습니다.
- 파이프라이닝은 켜 볼 만한 선택지가 아닙니다. 장면에 등장하는 이유는 그것이 교훈적인 실패이기 때문입니다. 요청은 해방했지만 응답의 순서를 남겨 두었고, 그래서 막힘을 없앤 것이 아니라 옮겼습니다. 게다가 중간 장비가 끼어들면 워낙 심하게 깨져서 클라이언트들이 껐고 다시 켜지 않았습니다. 켤지 말지 고민하고 있다면 답은 아니오이고, 실제로 원하는 것은 HTTP/2입니다.
- 나와 서버 사이에 무엇이 있는지 확인합니다. 로드 밸런서나 리버스 프록시, 서비스 메시 사이드카가 HTTP/2를 종료하고 그다음 구간을 HTTP/1.1로 말한다면, 다중화는 가장자리까지고 그 뒤에는 줄이 있습니다. 그것이 반드시 틀렸다는 뜻은 아닙니다. 가장자리 뒤의 구간은 대개 짧고 거기 연결 풀은 큽니다. 다만 그 성질이 원본까지 닿는다고 가정하는 대신 어디서 끝나는지 알아 두는 편이 좋습니다.
- 연결이 줄어들면 장애 양상과 부하 분산도 달라집니다. 하나가 전부를 실어 나른다는 말은 그 하나를 잃으면 전부를 함께 잃는다는 말이고, 4계층 로드 밸런서는 요청이 아니라 연결을 나누므로 오래 사는 다중화 연결은 자기 트래픽 전부를 처음 붙은 백엔드에 고정합니다. 둘 다 대개 받아들일 만하지만, 아무도 소리 내어 말하지 않으면 둘 다 놀라움이 됩니다.

## .NET에서는

- 클라이언트 쪽 동작은 `SocketsHttpHandler`에 있습니다. 버전과 정책을 요청이나 클라이언트에 지정하되, `HttpVersion.Version20`만으로는 협상에 실패하면 조용히 내려가는 선호값에 그친다는 점을 기억합니다. 협상 실패를 줄 서기가 아니라 오류로 만드는 것은 `RequestVersionExact`입니다.

```csharp
var handler = new SocketsHttpHandler
{
    EnableMultipleHttp2Connections = true,
    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
};

var client = new HttpClient(handler)
{
    DefaultRequestVersion = HttpVersion.Version20,
    DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrHigher,
};
```

- 알아 둘 설정은 `EnableMultipleHttp2Connections`입니다. 이 값이 없으면 `HttpClient` 하나는 엔드포인트당 HTTP/2 연결을 정확히 하나만 쓰고, 그 연결이 상대의 스트림 상한에 닿으면 요청은 기다립니다. 켜 두면 핸들러가 줄을 세우는 대신 연결을 하나 더 엽니다. 팬아웃하는 클라이언트라면 켭니다.
- `HttpClient`는 공유하고 핸들러는 `IHttpClientFactory`가 소유하게 합니다. 다중화는 핸들러 안 연결의 성질이므로 호출마다 새로 만든 클라이언트는 그 성질을 하나도 얻지 못합니다. 팩토리를 권장하게 만든 소켓 고갈 이야기와 같은 이야기를 반대편에서 본 것입니다.
- 서버에서는 Kestrel이 무엇을 받아들일지 정합니다. HTTP/1.1 클라이언트가 계속 동작하도록 기본값은 `Http1AndHttp2`이고, 스트림 상한은 연결당이며 모든 클라이언트에 똑같이 적용됩니다.

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureEndpointDefaults(endpoint =>
    {
        endpoint.Protocols = HttpProtocols.Http1AndHttp2;
    });
    options.Limits.Http2.MaxStreamsPerConnection = 200;
});
```

- 평문 구간에서는 대신 협상해 줄 핸드셰이크가 없습니다. HTTP/2는 보통 TLS 핸드셰이크 중 ALPN으로 합의되므로, 평범한 `http://` 엔드포인트에는 무슨 프로토콜을 쓰는지 직접 알려 줘야 합니다. 서버 쪽 해당 엔드포인트에 `HttpProtocols.Http2`를, 클라이언트 쪽에 `HttpVersionPolicy.RequestVersionExact`를 지정합니다. 클러스터 안의 gRPC 서비스가 대개 이 상황입니다.
- gRPC에서는 주소마다 `GrpcChannel`을 하나 만들어 계속 씁니다. 채널이 연결을 쥐고 있고 그 위의 모든 호출은 스트림이며, 중요한 동시성 한도는 호출하는 코드가 아니라 서버의 `MaxStreamsPerConnection`입니다. 부하 시험이 의심스럽게 동그란 동시 호출 수에서 평평해진다면 그 설정부터 봅니다.
