---
title: "REST"
summary: "REST는 HTTP 자체를 계약으로 쓰기 위한 제약 집합입니다. 자원마다 주소가 있고, 그 자원에 무엇을 하는지는 표준 메서드가 나타내며, 상태 코드와 캐시 헤더와 콘텐츠 협상이 아래에 깔린 배관이 아니라 API의 일부입니다."
category: "API와 실시간 통신"
related:
  - label: gRPC
    slug: grpc
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Pagination
    slug: pagination
  - label: CORS
    slug: cors
  - label: API Gateway
    slug: api-gateway
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: "RFC 9110: HTTP Semantics"
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

## 언제 쓰나

- 팀이나 조직 경계를 넘는 API의 기본값으로 둡니다. 소비자는 이미 HTTP 클라이언트를 가지고 있고, 프록시와 게이트웨이와 브라우저는 이미 메서드와 상태 코드를 이해하며, 캐시와 조건부 요청 장치는 우리가 쓰든 말든 거기 있습니다. 다른 것을 고르는 쪽에는 이유가 필요하고 REST를 고르는 쪽에는 필요 없습니다.
- 도메인이 실제로 이름 붙일 수 있는 것들의 모음일 때 씁니다. 주문, 청구서, 사용자와 그 하위 컬렉션에는 자연스러운 주소가 있습니다. `/orders/4417`이 URL이 되는 순간 "가져와라", "바꿔 놔라", "지워라", "비슷한 것들을 나열해라"는 우리 문서가 아니라 프로토콜이 이미 규정해 둔 것이 됩니다.
- 브라우저와 서드파티가 직접 부를 예정이라면 씁니다. REST 엔드포인트는 생성할 것도 설치할 것도 없이 `fetch`에서, `curl`에서, 스프레드시트에서, 파트너의 연동 플랫폼에서 닿습니다. 개발할 때만 편한 성질이 아니라 인터페이스가 실제로 가진 성질입니다.
- 읽기가 대부분이라면 중간자들에게 기댑니다. `ETag`와 `Cache-Control`이 붙은 캐시 가능한 `GET`은 CDN과 리버스 프록시와 클라이언트 자신의 캐시가 우리 대신 답하게 해 주고, `304 Not Modified`는 렌더링된 응답이 아니라 헤더 교환 한 번의 비용입니다. 다만 이 지렛대는 API가 의미론을 실제로 쓸 때만 생깁니다.

## 주의점

- 메서드 의미론이 곧 계약이고, 이것을 틀리면 우리와 호출자 사이의 모든 층을 속이게 됩니다. `GET`은 안전해야 합니다. 브라우저와 크롤러와 프리페처가 알아서 부르기 때문에 아무것도 바꾸면 안 됩니다. `PUT`과 `DELETE`는 같은 요청을 다시 보내도 한 번 보냈을 때와 자원의 상태가 달라지지 않게 써야 하고, 그래야 타임아웃 뒤의 클라이언트 재시도가 해를 끼치지 않습니다. `POST`에는 그런 약속이 둘 다 없고, 그래서 `POST`의 재시도 이야기에 Idempotency-Key가 필요합니다.
- REST는 "HTTP 위의 JSON"이 아니고, `POST`로 JSON 본문만 주고받는 API는 이득을 하나도 얻지 못합니다. 값어치는 팀이 흔히 건너뛰는 쪽에 있습니다. 클라이언트가 검증 실패와 장애를 구분할 수 있게 하는 의미 있는 상태 코드, 동시에 쓰는 쪽이 서로를 덮어쓰지 않게 하는 조건부 요청, 중간자가 거들 수 있게 하는 캐시 헤더, 표현 하나를 더 주기 위해 엔드포인트를 하나 더 만들지 않아도 되게 하는 콘텐츠 협상입니다.
- 버저닝 전략은 첫 외부 소비자가 생기기 전에 정합니다. URL 구간이든 미디어 타입 매개변수든 헤더든 모두 변론 가능한 선택이고, 값비싼 실수는 필드의 모양을 바꿔야 할 때 답이 없는 것입니다. 무엇이 덧붙이는 변경이라 안전한지에 관한 규칙도 함께 두세요. 스키마 변경에서 쓰는 확장 후 축소 순서는 API 표면에도 그대로 적용됩니다.
- 양식을 순수하게 지키자고 동작을 억지로 자원으로 바꾸지 마세요. 어떤 연산은 진짜로 동사입니다. 재계산, 대사, 발송, 재시도가 그렇습니다. 그런 것을 명사 꾸러미로 모델링하면 아무도 이름 붙일 수 없는 엔드포인트와 아무도 짐작할 수 없는 계약이 나옵니다. 동작 모양의 경로에 `POST`를 두는 것은 괜찮은 답이고, 표면 전체가 그렇게 생겼다면 정직한 결론은 이 인터페이스가 원하던 것이 gRPC나 메시지였다는 것입니다.

## .NET에서는

- Minimal API는 자원 라우팅을 짧게 표현하고, 결과 헬퍼는 상태 코드를 곁다리가 아니라 명시적인 선택으로 남깁니다.

```csharp
var orders = app.MapGroup("/orders");

// The route is the resource, the method is the verb, and the return type is
// the full set of answers this endpoint can give.
orders.MapGet("/{id:guid}", async (Guid id, IOrderStore store) =>
    await store.FindAsync(id) is { } order
        ? Results.Ok(order)
        : Results.NotFound());

// PUT replaces at a client-chosen address: sending it twice leaves the same
// resource behind, so a client that timed out can simply send it again.
orders.MapPut("/{id:guid}", async (Guid id, OrderInput input, IOrderStore store) =>
{
    if (input.Total < 0)
    {
        // A machine-readable failure, not a string. Content type is
        // application/problem+json, which clients can branch on.
        return Results.Problem(
            title: "Total must not be negative",
            statusCode: StatusCodes.Status400BadRequest);
    }

    var created = await store.UpsertAsync(id, input);
    return created ? Results.Created($"/orders/{id}", input) : Results.NoContent();
});
```

- `AddProblemDetails`를 넣으면 오류 모양이 공짜로 통일됩니다. 한 번 등록해 두면 처리되지 않은 예외도, 상태 코드만 있는 응답도 같은 필드를 가진 `application/problem+json`으로 돌아옵니다. 따로따로 자라난 실패 형식 세 가지 대신 클라이언트가 볼 형식이 하나가 됩니다.
- OpenAPI 문서 생성은 첫 엔드포인트부터 프로젝트에 들어 있어야 합니다. `AddOpenApi`와 `MapOpenApi`는 우리가 이미 선언해 둔 경로와 타입에서 문서를 만들어 줍니다. 계약이 어긋나기 시작하는 위키 문서가 아니라 소비자가 클라이언트를 생성해 낼 수 있는 것이 됩니다.
- 공개 REST 표면의 모양은 프레임워크보다 이웃 둘이 더 크게 좌우합니다. 앞에 선 게이트웨이가 인증과 요청 제한과 버전별 라우팅을 맡고, CORS가 어떤 브라우저 오리진이 애초에 부를 수 있는지를 정합니다. 브라우저에서 닿지 않는 REST API는 대개 엔드포인트가 없는 것이 아니라 정책이 빠진 것입니다.
