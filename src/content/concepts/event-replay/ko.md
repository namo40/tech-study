---
title: "Event Replay"
summary: "저장된 이벤트를 순서대로 접기 함수에 흘려보내 상태에 도달하는 일입니다. 재시작한 aggregate가 스스로를 다시 세우는 방법이고, read model을 처음부터 다시 만드는 방법이며, 예전 모습을 들여다보는 방법입니다."
category: "애플리케이션 아키텍처"
scene: event-sourcing
sceneStep: 2
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Snapshot
    slug: snapshot
  - label: Aggregate
    slug: aggregate
  - label: Projection
    slug: projection
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Change Data Capture
    slug: change-data-capture
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
  - title: "CQRS pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
---

장면의 2단계는 일부러 aggregate를 지웁니다. `items`가 0으로 떨어지고 `paid` 배지가 꺼지고, 잠시 Order는 아무것도 모릅니다. 그러고 나서 읽기가 로그 쪽에서 하나씩 건너오고, 같은 상태가 처음 자랐던 그 순서대로 다시 자랍니다. 복구된 것은 없습니다. 잃은 것이 없었기 때문입니다. 상태는 애초에 기록이 아니었으므로 그것을 지운다고 사라지는 정보는 없습니다.

핵심은 이것이 전부이고, 들리는 것보다 작습니다. 재생은 `events.Aggregate(seed, Apply)`, 즉 순서 있는 목록 위의 접기입니다. 흥미로운 공학은 반복문이 아니라 그 반복문이 필요로 하는 두 가지 성질에 있습니다. 이벤트는 스트림 안에서 전순서를 가져야 하고, 순번은 그것을 위해 있습니다. 그리고 `Apply`는 상태와 이벤트만의 순수 함수여야 하고, 그것이 접기를 되풀이 가능하게 만듭니다. 같은 이벤트를 같은 순서로 넣으면 지금이 몇 시든, 곁에서 무엇이 돌든, 몇 번째로 하는 일이든 언제나 같은 답이 나와야 합니다.

두 번째 성질이 깨지는 쪽이고, 깨지는 방식은 늘 같습니다. 누군가 `Apply` 안에 부수 효과를 넣습니다. 메일, 웹훅, 결제 대행사 호출, 저장까지 되어 버리는 `DateTime.UtcNow` 같은 것입니다. 그리고 운영 환경에서의 첫 전체 재구성이 작년에 들어온 주문 4천 건에 대해 확인 메일을 보냅니다. 규칙은 절대적이고 벽에 붙여 둘 만합니다. 이벤트를 적용하는 일은 메모리를 바꾸고 그 외에는 아무것도 바꾸지 않습니다. 메일이 있어야 할 자리인 이벤트에 반응하는 일은, 새 이벤트만 보고 스트림 안 자기 위치를 아는 구독자에서 일어납니다. 재생은 앞의 것만 훑고 뒤의 것은 건드리지 않습니다.

접기를 일찍 멈추면 시간 여행이 됩니다. 장면은 `seq 2`까지만 재생하고 거기서 닿은 상태를 붙들어 보여 줍니다. 이것은 누가 따로 만든 기능이 아니라 로그에 이미 들어 있던 것입니다. "결제 전에 이 주문은 어떤 모습이었나"는 앞부분에 대한 접기이고, "누가 언제 바꿨나"는 그 사이 이벤트에 붙은 메타데이터입니다. 현재 상태만 저장하는 시스템은 이런 질문에 아무도 믿지 않는 트리거 이력 테이블을 잔뜩 동원해 답합니다. 로그는 평소보다 적은 일을 해서 답합니다.

재생은 read model을 고치는 방법이기도 합니다. Projection도 접기이므로, 거기에 있는 버그는 테이블을 지우고 저장된 위치를 0으로 되돌린 뒤 로그를 다시 흘려보내면 고쳐집니다. 이관도, 백필 스크립트도, 어느 행이 틀렸는지에 대한 추론도 없습니다. 뷰가 여러 개인 시스템에서 Event Sourcing이 제값을 하게 만드는 성질이 이것입니다. 파생 데이터가 버려도 되는 것이 되고, 버려도 되는 데이터는 썩지 않습니다. 그리고 이것이 projection의 위치를 그 projection이 쓰는 행들과 같은 트랜잭션에 담아 두어야 하는 이유이기도 합니다. 배치 도중에 죽은 구독자가 건너뛰지도 두 번 적용하지도 않고 이어가게 해 줍니다.

대가는 시간이고, 시간은 로그와 함께 자랍니다. 이벤트 50개짜리 스트림은 곧바로 재생되지만 20만 개짜리는 그렇지 않습니다. 커맨드마다 다시 세워야 하는 aggregate라면 그것을 체감합니다. 스냅샷이 덜어 주려고 존재하는 압력이 이것이고, 스냅샷이 무엇을 바꾸는지는 분명히 해 둘 만합니다. 스냅샷은 재생을 짧게 만들 뿐 재생을 없애지 않습니다. 상태의 정의는 여전히 접기이고, 스냅샷에서 출발하는 재구성은 시작값(seed)만 다른 같은 반복문입니다.
