---
title: "HttpClient Connection Pool"
summary: "HttpClient가 재사용하는 연결은 클라이언트가 아니라 핸들러 안에 있습니다. SocketsHttpHandler가 엔드포인트마다 풀을 두고 연결을 빌려줍니다. 이 풀을 제대로 쓰는 일은 대체로 두 가지 결정, 즉 풀에 든 연결이 얼마나 오래 살 수 있고 몇 개까지 있을 수 있는지의 문제이며, 여기에 공유해야 할 대상은 핸들러라는 규칙이 붙습니다."
category: "엣지, 라우팅과 서비스 네트워크"
scene: multiplexing
sceneStep: 1
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Keep-Alive
    slug: keep-alive
  - label: HTTP/2
    slug: http-2
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Idle Timeout
    slug: idle-timeout
references:
  - title: "HttpClient guidelines for .NET"
    url: https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines
---

장면의 1단계는 요청 사이에도 살아남는 연결입니다. .NET에서 그 살아남는 연결들을 소유하는 것은 `HttpClient`가 아니라 그 아래의 핸들러이고, .NET Core 2.1부터 그 핸들러는 `SocketsHttpHandler`입니다. 이 핸들러는 이미 맺어 둔 연결의 풀을 유지하며 요청마다 하나씩 빌려주고, 남는 것이 없을 때만 새로 엽니다. 풀은 엔드포인트 단위로 나뉘는데, 여기서 엔드포인트란 스킴과 호스트와 포트를 묶은 것에 더해 사용 중인 프록시와 자격 증명과 클라이언트 인증서까지를 말합니다. 그래서 `https://a.example`과 `https://b.example`은 연결을 나눠 쓰지 않고, 서로 다른 인증서로 설정된 두 클라이언트도 마찬가지입니다. 그러니 이 위에 얹는 어떤 설정보다 객체 구성이 더 중요합니다. `HttpClient`는 핸들러를 얇게 감싼 것이라 호출마다 만들고 버리면 매번 풀을 통째로 버리는 셈이고, 소켓이 `TIME_WAIT`에 쌓이는 동안 다음 호출은 처음부터 핸드셰이크를 합니다. 프로세스 수명 내내 사는 클라이언트 하나, 또는 그 살림을 대신해 주는 `IHttpClientFactory`가 풀이 존재하게 만드는 조건입니다.

```csharp
var handler = new SocketsHttpHandler
{
    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
    PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
    MaxConnectionsPerServer = 50,
};
var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.example") };
```

`PooledConnectionLifetime`은 이해해 둘 만한 설정인데, 그 목적이 건강 확인도 리소스 절약도 아니기 때문입니다. 연결은 열릴 때 정해진 IP 주소 하나로 향하는 TCP 세션이고, 존재하는 내내 그 주소와 이야기합니다. 그 뒤로 DNS가 무엇을 말하든 상관없습니다. 서비스를 새 주소로 옮기거나 확장하거나 페일오버하면, 오래 살아남은 풀 속 연결은 어제의 지형을 계속 부릅니다. 클라이언트가 DNS를 무시하는 것이 아니라, 조회하지 않는 이름을 다시 해석할 이유가 없을 뿐입니다. 연결을 주기적으로 은퇴시키는 것이 그 조회를 다시 일으키는 장치이고, 자리를 메우는 새 연결은 오늘의 라우팅이 보내는 곳으로 갑니다. 이것은 데이터베이스 풀의 connection lifetime이 서버 노드에 대해 펴는 논증과 정확히 같고, 한 계층 아래에서 같은 결론에 이릅니다. 이 값은 타임아웃이 아니라 리밸런싱 주기라는 결론입니다. 기본값은 무한이라 맨 핸들러에서는 직접 켜야 하고, `IHttpClientFactory`는 핸들러 자체를 2분 주기로 교체하는 방식으로 같은 문제를 반대편에서 다룹니다. 두 장치가 겹치므로 권고는 하나를 고르라는 것입니다. `PooledConnectionLifetime`을 둔 오래 사는 클라이언트든, 핸들러 교체에 기대는 팩토리제 단명 클라이언트든 하나입니다. 팩토리 클라이언트가 어쨌든 오래 살아야 한다면(싱글턴에 붙잡힌 타입 클라이언트가 흔한 경우입니다) 그 기본 핸들러에 `PooledConnectionLifetime`을 설정하고 `SetHandlerLifetime(Timeout.InfiniteTimeSpan)`으로 교체를 끕니다.

`PooledConnectionIdleTimeout`은 나머지 절반으로, 쓰이지 않는 연결이 풀에 얼마나 머물다 닫히는지를 정합니다. 데이터베이스 풀이 자기 연결에 적용하는, 쓰이지 않은 시간 기준의 회수와 같은 것입니다. keep-alive의 경합에 가장 가까이 서 있는 설정이기도 합니다. 이 값이 네트워크 경로 위의 유휴 종료 기준들보다 짧을수록, 연결을 은퇴시키는 쪽이 클라이언트가 되는 일이 늘고 남이 이미 은퇴시킨 연결을 뒤늦게 발견하는 일이 줄기 때문입니다. `MaxConnectionsPerServer`는 목표치가 아니라 천장이고 기본값은 무제한이며, 제한 없는 팬아웃을 헤아릴 수 있는 대기열로 바꾸는 손잡이입니다.

팩토리가 이 모두를 어떻게 배치하는지가 사람들이 가장 자주 놀라는 대목입니다. 명명된 클라이언트나 타입 클라이언트는 자기 핸들러를 소유하지 않습니다. 팩토리가 이름마다 핸들러 사슬 하나를 두고 그 이름으로 만들어지는 모든 클라이언트에 넘겨줍니다. 그래서 타입 클라이언트를 transient로 등록해도 해가 없고, 그 뒤의 연결은 여전히 공유되고 풀에 들어 있습니다. 동시에 핸들러 설정은 이름 단위라는 뜻이기도 해서, 같은 호스트를 가리키는 타입 클라이언트라도 이름이 다르면 핸들러가 다르고 따라서 풀도 다릅니다. HTTP/2는 그 풀이 세는 대상 자체를 바꿉니다. 연결 하나가 동시 스트림을 여럿 나르므로 서버당 연결 수는 HTTP/1.1에서와 달리 동시성 한계가 아니게 됩니다. 그런 연결을 둘 이상 허용하는 핸들러 설정은 HTTP/2 페이지에서 다룹니다. 애초에 연결이 왜 지속되는지, 반대쪽이 먼저 닫으면 무슨 일이 생기는지에 대한 프로토콜 차원의 이야기는 keep-alive의 몫입니다.
