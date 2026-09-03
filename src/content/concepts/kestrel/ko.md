---
title: "Kestrel"
summary: "Kestrel은 ASP.NET Core에 내장된 크로스 플랫폼 웹 서버입니다. 모든 요청이 처음 닿는 프로세스 안의 관문이고, 설정하지 않아도 이미 돌고 있으며, 엔드포인트와 프로토콜과 한도는 설치할 인프라가 아니라 설정입니다."
category: ".NET 런타임과 호스팅"
related:
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: HTTP/2
    slug: http-2
  - label: Request Timeout
    slug: request-timeout
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: Kestrel web server in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel?view=aspnetcore-10.0
  - title: Configure options for the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/options?view=aspnetcore-10.0
---

## 언제 쓰나

- 우리는 이미 쓰고 있고, 그것이 가장 먼저 알아 둘 사실입니다. `WebApplication.CreateBuilder`가 Kestrel을 서버로 구성하므로, 기본 ASP.NET Core 애플리케이션의 모든 요청은 미들웨어 파이프라인이 `HttpContext`를 보기 전에 이미 Kestrel이 파싱하고 압축을 풀고 프레임을 나눈 것입니다. 이것을 조정하는 일은 새로운 것을 도입하는 일이 아니라 이미 경로 위에 있는 부품을 손보는 일입니다.
- 컨테이너 안에서, 그리고 로드 밸런서 뒤에서 직접 서빙합니다. 포트 하나를 열고 프로세스 하나를 돌리는 컨테이너에는 이미지 안에 또 다른 웹 서버가 필요하지 않고, 앞에 놓인 인그레스 컨트롤러나 클라우드 로드 밸런서가 보통 엣지가 해 주던 일을 대신 공급합니다.
- 클라이언트나 gRPC가 필요로 할 때 HTTP/2와 HTTP/3의 종단을 맡깁니다. 프로토콜 선택은 엔드포인트마다이고, 브라우저용 HTTP/2에는 ALPN을 쓰는 TLS가 필요하며, HTTP/3에는 플랫폼에 있는 QUIC 지원이 필요합니다. 그 프로토콜 결정이 실제로 내려지는 자리가 여기입니다.
- 가능하면 엔드포인트와 인증서를 코드가 아니라 설정으로 구성합니다. `appsettings.json`의 `Kestrel` 절이 URL과 프로토콜과 인증서와 한도를 바인딩해 주므로, 이미지 하나를 다시 빌드하지 않고 환경마다 다른 엔드포인트로 띄울 수 있습니다.

## 주의점

- 기본값은 의도해서 고른 값이지 어디에나 맞는 값은 아니라서, 서비스마다 한 번은 들여다볼 값입니다. 요청 본문의 최대 크기는 30,000,000바이트, 요청 헤더 전체 크기는 32KB에 헤더 개수는 최대 100개, 동시 연결 수는 지정하지 않으면 제한이 없습니다. 업로드 서비스와 내부 웹훅 수신기가 같은 숫자를 원할 리 없고, 둘 중 어느 쪽도 장애가 난 날에 그 숫자를 처음 알게 되기를 원하지 않습니다.
- Kestrel을 엣지에 직접 세울지 리버스 프록시 뒤에 둘지는 TLS와 정적 파일과 압축과 요청 버퍼링을 누가 맡을지의 결정입니다. TLS를 이미 종단하고 자산을 서빙하고 느린 클라이언트를 버퍼링해 주는 프록시가 있으면 그만큼 우리가 설정하지 않아도 되고, 직접 서빙하면 그 책임이 애플리케이션과 플랫폼이 주변에 제공하는 것들에게 돌아옵니다.
- 호스팅 모델의 차이는 늦게 드러나는 방식으로 다릅니다. IIS 뒤의 인프로세스 모델에서는 요청을 처리하는 서버 구현 자체가 달라지고, systemd 아래에서는 유닛 파일과 소켓 설정이 포트와 재시작 동작을 쥐며, 프록시를 한 번 거친 뒤에도 원래의 스킴과 클라이언트 IP가 남으려면 전달 헤더를 명시적으로 켜 두어야 합니다.
- 한도 초과는 로그에서 평범한 클라이언트 오류처럼 보입니다. 한도를 넘는 본문은 `413`으로, 한도를 넘는 헤더는 `431`로 돌아오고, 요청 도중에 전송을 멈춘 클라이언트는 요청 헤더 타임아웃이나 킵얼라이브 타임아웃에 끊깁니다. 호출한 쪽 잘못이라고 결론짓기 전에 서버 로그에서 이것부터 찾아보세요. 우리 코드가 돌기 전에 서버가 거절한 것이기 때문입니다.

## .NET에서는

- 엔드포인트와 한도를 선언하는 자리로는 `Kestrel` 설정 절이 보통이고, `Program.cs`에 코드를 한 줄도 쓰지 않아도 바인딩됩니다.

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://*:8443",
        "Protocols": "Http1AndHttp2",
        "Certificate": { "Path": "/certs/site.pfx", "Password": "<from a secret store>" }
      },
      "Http": {
        "Url": "http://*:8080",
        "Protocols": "Http1"
      }
    },
    "Limits": {
      "MaxRequestBodySize": 10485760,
      "MaxConcurrentConnections": 2000,
      "MaxRequestHeadersTotalSize": 16384,
      "KeepAliveTimeout": "00:02:10"
    }
  }
}
```

- 코드 구성과 이 설정 절은 같은 옵션을 가리킵니다. `builder.WebHost.ConfigureKestrel(...)`도 같은 `KestrelServerOptions`를 건드리고, 설정이 바인딩된 뒤에 부르면 파일이 말한 값을 덮어씁니다. 설정 항목마다 자리를 하나만 골라 그대로 두세요.
- 한도는 서버 전체가 아니라 엔드포인트 하나에만 풀어 줄 수 있습니다. 요청의 `IHttpMaxRequestBodySizeFeature`나 액션에 붙인 `[RequestSizeLimit]` 애트리뷰트가 업로드 라우트의 천장만 올려 주고, 전역 기본값은 나머지를 계속 지킵니다.
- 타임아웃은 미들웨어만의 것이 아니라 서버의 것이기도 합니다. Kestrel의 `RequestHeadersTimeout`과 `KeepAliveTimeout`은 요청이 완성되기 전에 멈춰 버린 연결을 다스리고, 요청 타임아웃 미들웨어는 일단 시작한 우리 핸들러가 얼마나 오래 돌 수 있는지를 제한합니다.
