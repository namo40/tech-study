---
title: "Retryable Step"
summary: "엔진이 다시 돌려도 되는 단계입니다. 두 번 돌린 결과가 한 번 돌린 결과와 같은 상태로 세상을 남기고, 그래서 실패 뒤의 재시도와 크래시 뒤의 재개가 둘 다 안전해집니다."
category: "예약 작업과 워크플로"
scene: workflow-engine
sceneStep: 3
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Idempotency-Key
    slug: idempotency-key
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Durable Workflow
    slug: durable-workflow
  - label: Saga
    slug: saga
  - label: Scheduled Job
    slug: scheduled-job
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: "Error handling in Durable Functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-error-handling
  - title: "Implement retries with exponential backoff"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-retries-exponential-backoff
---

장면의 세 번째 단계에서 3단계가 실패하고, 엔진이 잠시 물러났다가, 다시 돌립니다. `attempt 2`가 나타나고 두 번째 시도가 성공하고 history에 줄 하나가 늘어납니다. 실행은 두 번이었는데 줄은 하나입니다. 정의가 그게 전부입니다. 다시 실행해도 안전한 단계란, 두 번째 실행이 아무것도 더 남기지 않아서 기록이 "이 단계는 한 번 일어났다"고 정직하게 말할 수 있는 단계입니다.

이것이 보이는 것보다 중요한 이유는 워크플로 엔진이 서로 다른 두 자리에서 이것을 전제하는데 그중 하나만 눈에 띄기 때문입니다. 눈에 띄는 쪽은 재시도입니다. 단계가 실패했고 엔진이 다시 시도합니다. 다른 쪽은 재개입니다. 작업을 끝내고 줄을 적기 전에 엔진이 죽으면 기록은 그 단계가 끝나지 않았다고 말하고, 재시작한 엔진은 그것을 다시 돌립니다. 실제로는 완료됐을지도 모르는데 말입니다. 이 틈은 닫을 수 없습니다. 작업과 기록이 서로 다른 시스템에 살면 둘을 함께 커밋할 수 없기 때문입니다. 엔진은 "적어도 한 번"을 "누가 봐도 한 번"으로 바꾸는 기계이고, 단계가 협조할 때만 그 일을 해낼 수 있습니다.

그래서 단계를 쓸 때마다 던져야 할 실무적인 질문은 이것입니다. 이게 두 번 돌면 무엇이 중복되나. 답이 "아무것도"일 때도 있고, 그런 단계는 이미 안전합니다. 필드에 값을 넣는 일, 아이디로 지우는 일, 내용에서 이름을 뽑은 파일을 쓰는 일, 읽기만 하는 API를 호출하는 일. 전부 다시 해도 그만입니다. 이미 이 부류에 속하는 단계가 얼마나 많은지 알아 두면 좋습니다. 그렇지 않은 소수에만 힘을 쓰면 된다는 뜻이니까요.

답이 "아무것도"가 아닐 때, 해법은 거의 언제나 키입니다. 그 작업에 상대편이 알아볼 수 있는 이름을 주고, 그 이름은 워크플로 인스턴스와 단계에서 뽑되 시도할 때마다 새로 만들지 않게 하고, 두 번째로 도착한 것은 상대편이 거절하게 둡니다. 바깥으로 나가는 호출에 `Idempotency-Key` 헤더가 있는 이유, 삽입에 유일 제약이 있는 이유, 갱신에 `where status = 'pending'`을 붙이는 이유가 다 그것입니다. 키는 시도들 사이에서 안정적이어야 합니다. 엔진이 단계에 결정적인 인스턴스 아이디를 건네주고 `Guid.NewGuid()`를 부르지 못하게 하는 이유가 그것입니다.

이 처방이 잘 듣지 않는 것이 둘 있고, 이름을 붙여 둘 만합니다. 하나는 메일 발송처럼 상대편에 중복이라는 개념도 없고 되돌릴 방법도 없는 경우입니다. 흔한 답은 의도를 먼저 자기 저장소에 기록하고 그 기록에 키를 걸고, 별도의 발송 단계가 거기서 읽어 가게 하는 것입니다. 다른 하나는 설정이 아니라 누적입니다. `balance = balance + 10`은 두 번째에 틀리는 전형적인 단계이고, `balance = 60`이었다면 괜찮았을 것입니다. 상대적인 변경을 절대적인 값으로 다시 쓰는 것이 가장 값싼 해법인 경우가 많습니다.

마지막으로, 재시도는 공짜도 아니고 언제나 옳은 것도 아닙니다. 입력이 잘못돼서 실패한 단계는 다섯 번째 시도에서도 똑같이 실패하므로, 다시 해 볼 가치가 있는 오류와 그 자체가 답인 오류를 구분하세요. 타임아웃과 503과 교착은 다시 시도하고, 400이나 검증 실패는 다시 시도하지 마세요. 시도 횟수에 한계를 두고, 재시도가 상대편을 계속 쓰러뜨리는 원인이 되지 않도록 사이에 물러나는 시간을 두고, 시도가 다 떨어졌을 때 인스턴스가 어디로 가는지 정해 두세요. 하류에 있는 사람들에게 "영원히 재시도 중"과 "조용히 실패"는 같은 결과입니다.
