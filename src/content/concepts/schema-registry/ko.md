---
title: "Schema Registry"
summary: "Schema registry는 이벤트 스키마를 모아 두는 중앙 저장소입니다. 생산자가 버전을 등록하고 id를 받고, 소비자는 그 id로 스키마를 되찾고, 해당 subject에 설정된 호환성 규칙을 어기는 버전은 레지스트리가 거절합니다."
category: "메시징과 이벤트 처리"
related:
  - label: Schema Evolution
    slug: schema-evolution
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Database Migration
    slug: database-migration
  - label: Event Stream
    slug: event-stream
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Message ID
    slug: message-id
  - label: Expand-Contract Migration
    slug: expand-contract-migration
references:
  - title: Azure Schema Registry in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/schema-registry-overview
  - title: Schema Registry Overview
    url: https://docs.confluent.io/platform/current/schema-registry/index.html
---

## 언제 쓰나

- 한 팀보다 많은 곳에서 그 이벤트를 소비하기 시작하면 그때 스키마를 등록합니다. 그 순간부터 페이로드는 생산자의 구현 세부가 아니라 공개된 인터페이스입니다. 레지스트리는 "다들 이 세 필드를 읽고 있을 것"이라는 짐작을, 양쪽이 같은 곳에서 되찾는 버전 번호 붙은 정의로 바꿔 줍니다.
- 호환성을 기대가 아니라 기계로 검사받고 싶을 때 씁니다. subject마다 모드가 붙고, 레지스트리는 그 모드를 어기는 등록을 거절합니다. `BACKWARD`는 새 스키마가 옛 데이터를 못 읽게 만드는 변경을 막고, `FORWARD`는 옛 독자가 새 데이터를 못 다루게 만드는 변경을 막고, `FULL`은 둘 다 요구합니다. 검사는 생산자가 등록할 때 일어나므로 잘못된 메시지가 생기기 전입니다.
- 스키마를 페이로드에서 빼내려고 씁니다. 메시지는 정의를 통째로 싣는 대신 작은 스키마 id를 싣습니다. 메시지마다 붙는 부담이 구조의 반복된 사본이 아니라 몇 바이트가 되는데, 애초에 스트림을 고르게 만든 그 물량에서는 이것이 차이를 냅니다.
- 데이터베이스에서 쓰던 확장 후 축소 사고방식을 이벤트 세계로 넓힐 때 꺼냅니다. 레지스트리는 같은 규율이 머물 자리를 줍니다. 선택 필드를 먼저 더하고, 먼저 움직여야 하는 쪽을 배포하고, 아직 옛 모양에 있는 독자가 빠질 때까지 기다리고, 그다음에야 무엇인가를 지웁니다.

## 주의점

- 레지스트리는 검사기이지 거버넌스가 아닙니다. 변경이 기계적으로 호환된다는 것은 알려 주지만, 새로 넣은 필드가 다른 네 팀이 생각하는 그 의미인지는 알려 주지 못하고, 누가 subject를 진화시켜도 되는지도 정해 주지 않습니다. 소유와 검토와 이름 규칙은 여전히 사람의 결정이고, 주인 없는 레지스트리는 아무도 지우기 무서워하는 subject의 무덤이 됩니다.
- 호환성 모드가 업그레이드 순서를 결정하므로 의식적으로 고릅니다. `BACKWARD`에서는 새 스키마가 옛 데이터를 읽을 수 있으므로 소비자를 먼저 올리고, 그 뒤로 소비자가 두 모양을 다 다루는 동안 생산자가 따라옵니다. `FORWARD`에서는 옛 소비자가 새 데이터를 읽을 수 있으므로 생산자가 먼저 가도 됩니다. 순서를 반대로 배포하면 그 모드가 지켜 주던 규칙을 스스로 깨는 것이고, 운영 문서에 적어 둘 것도 바로 이 모드입니다.
- 이제 레지스트리가 발행 경로 위에 있고, 레지스트리의 장애가 곧 우리 장애입니다. 생산자와 소비자가 id로 스키마를 되찾으므로 그 조회를 다른 원격 의존성과 똑같이 다룹니다. 스키마 id는 불변이니 해석한 스키마를 프로세스가 사는 동안 캐시해 두고, 시작 시점에 레지스트리가 닿지 않으면 즉시 실패할지 캐시 사본으로 돌지를 미리 정해 둡니다.
- 고른 형식이 앞으로 함께 살아갈 진화 규칙을 정합니다. Avro는 기본값과 별칭을 추적해서 해석 규칙이 가장 정밀하고, protobuf는 필드 번호를 정체성으로 삼고 재사용을 금지하며, JSON 스키마는 가장 읽기 좋고 가장 헐겁습니다. 실무에서 이것은 되돌리기 어려운 선택이니 팀의 익숙함만으로 고르지 말고 호환성 모드를 함께 보고 정하세요.

## .NET에서는

- Azure에서는 레지스트리가 Event Hubs 옆에 있고, 레지스트리와 이야기하는 쪽은 직렬화기입니다. `Azure.Data.SchemaRegistry`와 Avro 직렬화기가 스키마를 등록하거나 되찾아 주고 id를 메시지 속성에 넣어 주므로, 발행하는 코드는 계속 타입이 있는 객체를 보냅니다.

```csharp
var registry = new SchemaRegistryClient(
    fullyQualifiedNamespace, new DefaultAzureCredential());

var serializer = new SchemaRegistryAvroSerializer(
    registry,
    groupName: "orders",
    // Registering from the producer is convenient in development and usually
    // wrong in production: schema changes should be a reviewed deployment.
    new SchemaRegistryAvroSerializerOptions { AutoRegisterSchemas = false });

var message = (EventData)await serializer.SerializeAsync<EventData, OrderPlaced>(
    new OrderPlaced { Id = id, Total = total });
await producer.SendAsync(new[] { message });
```

- 개발 환경 밖에서는 자동 등록을 끕니다. `AutoRegisterSchemas`를 켜 두면 아무 생산자나 첫 전송에서 버전을 만들 수 있고, 계약 변경이 조용히 코드 리뷰를 벗어나 먼저 배포된 인스턴스의 손에 넘어갑니다.
- 소비자 쪽에서는 캐시하고 id가 일하게 둡니다. 스키마 id는 불변이므로 해석한 스키마는 프로세스가 사는 동안 들고 있어도 됩니다. Azure 클라이언트도 Confluent 클라이언트도 캐시를 하니, 확인할 것은 우리 소비자가 메시지마다 클라이언트를 새로 만들어 그 캐시를 무력화하고 있지 않은지입니다.
- Kafka라면 Confluent .NET 클라이언트가 같은 자리를 맡습니다. `Confluent.SchemaRegistry`에 Avro나 protobuf나 JSON 직렬화기를 붙여 `IProducer`와 `IConsumer`에 꽂고, subject 이름 전략이 호환성을 토픽 단위로 강제할지 레코드 타입 단위로 강제할지를 정하는 설정입니다.
