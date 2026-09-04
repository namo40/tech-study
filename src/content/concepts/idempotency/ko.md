---
title: "Idempotency"
summary: "어떤 연산을 다시 수행해도 한 번 수행한 뒤와 같은 상태가 유지되면 그 연산은 반복해도 결과가 같다고 말합니다. 재시도를 안전하게 보낼 수 있는 근거가 바로 이 성질입니다."
category: "API와 실시간 통신"
scene: idempotency-key
related:
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Unique Constraint
    slug: unique-constraint
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Message ID
    slug: message-id
  - label: Retry
    slug: retry
  - label: REST
    slug: rest
references:
  - title: HTTP Semantics, idempotent methods (RFC 9110)
    url: https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
  - title: Idempotent (MDN glossary)
    url: https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

두 번 해도 한 번 한 것과 같은 상태가 남는 연산을 두고 반복해도 결과가 같은 성질(idempotency)을 갖는다고 말합니다. 이것은 응답이 아니라 효과에 대한 이야기입니다. `DELETE /orders/7`은 두 번째 호출이 204가 아니라 404를 돌려주더라도 반복해도 결과가 같은 호출이고, 매번 다른 숫자를 돌려주는 조회 역시 아무것도 바꾸지 않으므로 마찬가지입니다. HTTP는 `GET`, `PUT`, `DELETE`를 이 성질을 갖는 메서드로 정의하고 `POST`는 그렇지 않다고 봅니다. 도움이 필요한 메서드가 `POST`인 이유가 여기에 있습니다. 이 이야기가 중요한 까닭은 하나뿐입니다. 네트워크는 타임아웃된 요청이 전달됐는지 아닌지를 호출자에게 알려 주지 않습니다. 그러면 선택지는 둘뿐입니다. 이미 처리됐을지도 모를 일을 포기하거나, 다시 보내되 두 번째 전송이 아무 해도 끼치지 않게 만들거나.

이 성질을 얻는 흔한 방법은 다섯 가지이고, 마지막 것부터 집어 드는 것이 자주 나오는 실수입니다. 첫째, 이미 그 성질을 가진 메서드를 고릅니다. 클라이언트가 만든 id로 보내는 `PUT /carts/{id}`는 세상이 어떤 모습이어야 하는지를 말하지만, `POST /carts`는 호출될 때마다 새것을 하나씩 찍어 냅니다. 둘째, 업무 규칙이 이미 함축하고 있는 고유 제약에 기댑니다. 주문 하나에 결제 하나 같은 것이며, 두 번째 시도는 데이터베이스가 거절하게 둡니다. 셋째, 호출자가 마지막으로 본 상태를 조건으로 걸어 씁니다. `ETag`와 `If-Match`나 버전 칼럼을 쓰면, 다시 온 요청은 낡은 전제 조건을 들고 오므로 거부됩니다. 넷째, 호출자에게 `Idempotency-Key`를 받아 그 키 아래에 결과를 저장합니다. 다른 방법으로는 안전해지지 않는 작업에 대한 일반적인 답입니다. 다섯째, 큐를 받는 쪽이라면 이미 처리한 메시지 id를 기록해 두고 본 적 있는 것은 버립니다.

두 가지는 정확히 구분해 둘 만합니다. 반복해도 결과가 같다는 것과 안전하다는 것은 다릅니다. 안전한 메서드는 아무것도 바꾸지 않지만, 반복해도 결과가 같은 메서드는 처음에 아주 많은 것을 바꿔 놓고 그다음부터 아무것도 바꾸지 않을 수 있습니다. 그리고 최소 한 번 전달을 사람이 다룰 수 있는 것으로 바꿔 주는 것이 바로 이 성질입니다. 중복을 무시하는 소비자는 정확히 한 번 전달에 필요한 분산 처리 장치를 하나도 들이지 않고도 정확히 한 번 처리한 효과를 냅니다. 다만 검사와 쓰기가 한 연산이 아니면 이 모든 것이 무너집니다. "내가 이걸 했던가?"를 읽고 나서 실행하는 사이에는 두 호출자가 나란히 아니오를 읽고 둘 다 진행하는 틈이 생기므로, 선점과 효과는 한 번의 원자적 쓰기로 함께 놓여야 합니다.
