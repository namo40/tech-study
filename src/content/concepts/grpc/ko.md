---
title: "gRPC"
summary: "gRPC는 protobuf 파일이 곧 계약인 RPC 프레임워크입니다. 같은 정의에서 클라이언트와 서버 코드를 함께 생성하고, 작은 이진 형식으로 직렬화하고, HTTP/2 위에서 돌기 때문에 단항 호출과 스트림이 연결 하나를 나눠 씁니다."
category: "API와 실시간 통신"
related:
  - label: REST
    slug: rest
  - label: HTTP/2
    slug: http-2
  - label: Multiplexing
    slug: multiplexing
  - label: Streaming
    slug: streaming
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: gRPC Documentation
    url: https://grpc.io/docs/
  - title: Overview for gRPC on .NET
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/
---

## 언제 쓰나

- 양쪽 모두 우리 것인 서비스 간 내부 호출에 꺼냅니다. `.proto` 파일 하나가 양쪽이 함께 빌드하는 유일한 산출물이라서, 손으로 쓴 HTTP 클라이언트가 그것이 부르는 처리기와 어긋나는 방식으로는 클라이언트 스텁과 서버 기반 클래스가 어긋나지 않습니다. 이름이 바뀐 필드를 새벽 3시가 아니라 빌드 시점에 컴파일러가 잡아 줍니다.
- 호출 형태가 요청 하나에 응답 하나가 아닐 때 씁니다. gRPC에는 네 가지가 있습니다. 단항, 서버 스트리밍, 클라이언트 스트리밍, 양방향 스트리밍입니다. 넷 다 한쪽에 `IAsyncEnumerable`이나 스트림 리더가 붙은 평범한 메서드입니다. 진행 상황 피드도, 긴 업로드도, 대화 모양의 주고받음도 여기서는 첫 번째 프로토콜 옆에 덧댄 두 번째 프로토콜이 아니라 메서드 시그니처입니다.
- 여러 언어가 계약 하나에 합의해야 할 때 씁니다. protobuf 정의 하나에서 C#, Go, Java, Python을 비롯한 언어마다 그 언어다운 코드가 생성됩니다. 계약이 팀마다 조금씩 다르게 다시 구현하는 문서가 아니라 저장소에 공유된 산출물이 됩니다.
- HTTP/1.1 위의 JSON이 필요 이상으로 비싼 내부 핫패스에 낫습니다. 이진 인코딩은 같은 내용의 JSON보다 작고 파싱도 빠르며, HTTP/2가 호출마다 붙던 연결 준비를 없애고, 오래 사는 채널이 TLS 비용을 나눠 갚습니다. 하루 수백만 호출로 재는 수다스러운 경로라면 그 차이는 미세 최적화가 아니라 용량에 관한 결정입니다.

## 주의점

- 브라우저는 gRPC 서비스를 직접 부르지 못합니다. 브라우저 자바스크립트에는 gRPC가 필요로 하는 프레임 수준 제어를 주는 API가 없습니다. 그래서 공개 엣지에는 번역 프록시를 둔 gRPC-Web이나, 같은 서비스를 REST 모양의 HTTP API로 드러내는 JSON transcoding이 필요합니다. 첫 외부 클라이언트가 붙기 전에 둘 중 무엇을 쓸지 정하세요. 엣지를 나중에 끼워 넣는 편이 처음부터 고르는 것보다 일이 큽니다.
- 호환성의 계약은 필드 이름이 아니라 필드 번호입니다. 전송 형식이 싣고 가는 것은 번호이므로 필드 이름을 바꾸는 일은 안전하고, 은퇴한 번호를 재사용하는 일은 조용한 데이터 오염입니다. 옛 피어가 새 바이트를 옛 의미로 해석하기 때문입니다. 없앤 번호는 `reserved`로 표시하고 절대 돌려쓰지 말고, `.proto` 파일을 데이터베이스 마이그레이션과 같은 무게로 다룹니다.
- 로드 밸런싱은 연결 단위가 아니라 호출 단위여야 합니다. gRPC는 오래 사는 HTTP/2 연결 하나를 붙들고 모든 호출을 그 위로 보냅니다. 그래서 연결을 나누는 L4 밸런서를 두면 한 클라이언트의 트래픽 전부가 처음 붙은 백엔드 한 대에 고정되고, 방금 늘어난 복제본에는 아무것도 가지 않습니다. 해법은 호출을 이해하는 밸런싱입니다. L7 프록시, 서비스 메시 사이드카, 또는 백엔드 집합을 아는 리졸버를 둔 클라이언트 쪽 로드 밸런싱입니다.
- 오류 모델은 gRPC 고유의 것이고 HTTP 상태 코드와 깔끔하게 대응되지 않습니다. 호출은 gRPC 자체 열거형의 `StatusCode`로 실패하고, 중요한 구분은 전송 계층이 아니라 그쪽에 있습니다. `DEADLINE_EXCEEDED`와 `UNAVAILABLE`은 재시도해 볼 만한 짝이고, `FAILED_PRECONDITION`과 `ABORTED`는 재시도가 도움이 되는지 여부에서 갈립니다. HTTP 코드로 분기하는 클라이언트 코드는 엉뚱한 층을 읽고 있는 것입니다.

## .NET에서는

- 서비스는 ASP.NET Core 엔드포인트이고 클라이언트는 팩토리에서 나옵니다. `Grpc.AspNetCore`가 `.proto` 파일에서 기반 클래스를 생성하고, `AddGrpcClient`는 `IHttpClientFactory`가 `HttpClient`에 해 주던 수명 관리를 채널에 해 줍니다.

```csharp
// Server: the generated base class is the contract, the override is the code.
public class OrdersService : Orders.OrdersBase
{
    public override async Task<OrderReply> Get(OrderRequest request, ServerCallContext context)
    {
        // The caller's deadline arrives as the cancellation token. Passing it on
        // is what makes an abandoned call stop costing work downstream.
        var order = await repository.GetAsync(request.Id, context.CancellationToken);
        return new OrderReply { Id = order.Id, Status = order.Status };
    }
}

// Client: one channel per address, reused, with a deadline on every call.
builder.Services.AddGrpcClient<Orders.OrdersClient>(o =>
    o.Address = new Uri("https://orders.internal"));

var reply = await client.GetAsync(
    new OrderRequest { Id = id },
    deadline: DateTime.UtcNow.AddSeconds(2));
```

- 모든 호출에 deadline을 걸고, 받은 deadline은 그대로 넘깁니다. gRPC의 deadline은 호출과 함께 이동하는 절대 시각입니다. `context.CancellationToken`을 자기 하위 호출에 넣어 주는 서비스는 호출자의 타임아웃 하나로 사슬 전체를 취소시킬 수 있고, 아무도 기다리지 않는 답 뒤에서 고아 작업이 계속 도는 일을 막습니다.
- `GrpcChannel`은 만드는 비용이 크고 공유하도록 만들어졌습니다. 채널이 HTTP/2 연결을 쥐고 있고 그 위의 모든 호출이 스트림입니다. 호출마다 새로 만들면 이 설계가 전송 계층에서 노리던 연결 재사용을 통째로 버리는 셈입니다.
- 서버는 HTTP/2 위의 Kestrel에서 돌고, 이것은 소리 내어 말해 둘 만한 배포 제약입니다. ALPN이 붙은 TLS라면 기본값으로 해결되지만, 평문 엔드포인트에는 `HttpProtocols.Http2`를 명시해야 하고, 경로에 있는 모든 프록시가 한 구간이라도 내려가지 않고 끝까지 HTTP/2로 말해야 합니다.
