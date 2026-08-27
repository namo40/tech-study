---
title: "Event Sourcing"
summary: "이벤트 소싱은 지금 모습이 아니라 일어난 일을 저장합니다. 모든 변경은 덧붙여지는 이벤트이고, 현재 상태는 로그를 재생한 결과이며, 갱신도 삭제도 없는 그 로그 자체가 나머지 전부를 이끌어 내는 하나의 기록이 됩니다."
category: "애플리케이션 아키텍처"
scene: event-sourcing
steps:
  - title: "지금 모습이 아니라 일어난 일을 적습니다"
    text: "명령이 애그리게이트에 닿고, 애그리게이트가 결정하고, 저장되는 것은 이벤트입니다. 로그에 덧붙일 뿐 무엇도 덮어쓰지 않습니다. 왼쪽의 상태 카드는 오른쪽 로그의 누계일 뿐입니다."
  - title: "상태는 재생의 결과입니다"
    text: "애그리게이트를 지워도 잃는 것은 없습니다. 로그를 처음부터 틀면 같은 상태가 이벤트 하나씩 다시 자랍니다. 재생을 일찍 멈추면 보이는 것은 과거입니다. 로그는 진실의 모든 버전을 기억합니다."
  - title: "재생이 길어지면 사진을 찍어 둡니다"
    text: "스냅숏은 어느 순번 시점의 상태를 저장합니다. 다음 재구성은 거기서 출발해 그 뒤의 것만 재생합니다. 이것은 최적화일 뿐입니다. 진실은 여전히 로그이고, 스냅숏은 언제든 버리고 다시 만들 수 있습니다."
  - title: "하나의 로그에서 여러 진실이 나옵니다"
    text: "같은 이벤트가 이쪽에서는 조회 모델을, 저쪽에서는 감사 기록을 공짜로 만들어 냅니다. 그것들도 그저 또 하나의 재생이기 때문입니다. 그리고 정정은 UPDATE가 아닙니다. 이벤트 하나를 더 덧붙이면 파생된 모든 뷰가 따라잡습니다. 역사는 자라기만 하기 때문에 정직하게 남습니다."
related:
  - label: Aggregate
    slug: aggregate
  - label: Event Replay
    slug: event-replay
  - label: Snapshot
    slug: snapshot
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Projection
    slug: projection
  - label: Materialized View
    slug: materialized-view
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Saga
    slug: saga
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Unit of Work
    slug: unit-of-work
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

## 언제 쓰나

- 역사 자체가 제품일 때입니다. 원장, 주문, 재고 이동, 약관 변경처럼 감사가 따라붙는 영역에서 사건의 순서는 디버깅 보조물이 아니라 업무가 실제로 소유한 자산입니다. `balance = 412.30`이라고 적힌 한 행은, 사람들이 물어볼 유일한 기록을 이미 버린 상태입니다.
- "어쩌다 이 상태가 되었나"에 답할 수 있어야 할 때입니다. 현재 상태 테이블은 지금 무엇이 참인지는 말해 줍니다. 그러나 다섯 번의 변경 중 어느 것이 어떤 순서로, 누구의 권한으로 그렇게 만들었는지는 말하지 못합니다. 그 질문이 고객 문의로, 감독 기관의 공문으로, 재현되지 않는 버그 보고로 도착한 적이 있다면 필요한 것은 이벤트였습니다.
- 하나의 쓰기 모델에서 여러 조회 뷰가 파생될 때입니다. 이벤트 소싱은 CQRS와 자연스럽게 짝을 이룹니다. 로그가 기록이 되고 나면 조회 모델은 그 위의 또 다른 접기일 뿐이고, 두 번째 뷰의 비용은 스키마 변경이 아니라 구독자 하나입니다. 잘못 만든 뷰는 지우고 로그에서 다시 만들면 됩니다. 2년 동안 변경해 온 테이블에는 없는 선택지입니다.
- 정정을 설명할 수 있어야 할 때입니다. `UPDATE` 한 번이 증거를 조용히 지워 버리는 영역이라면, 보정 이벤트는 무엇이 잘못이었고 언제 발견했고 어떻게 처리했는지를 말해 줍니다. 바뀐 한 행과 잘 동작하기를 바라는 감사 트리거보다 훨씬 나은 산출물입니다.
- 시점 조회가 업무의 일부일 때입니다. "3월 3일에 이 주문은 어떤 모습이었나"는 일찍 멈춘 재생입니다. 로그가 있으면 거의 공짜이고, 없으면 거의 불가능합니다.

## 주의점

- 이벤트는 계약이고, 그 버전을 관리하는 일이 진짜 장기 비용입니다. 테이블의 행은 이관할 수 있지만, 10년치 저장된 이벤트는 저장할 가치를 만들어 준 성질을 파괴하지 않고서는 다시 쓸 수 없습니다. 첫 배포 전에 계획이 필요합니다. 모든 이벤트에 타입 이름과 버전을 붙이고, 읽어 들일 때 옛 모양을 새 모양으로 바꾸는 업캐스터를 두고, 이미 존재하는 이벤트의 의미는 절대 바꾸지 않는 규율이 있어야 합니다. 새 이벤트 타입을 추가하는 것은 쌉니다. 옛것을 바꾸는 것은 비쌉니다.
- 로그는 영원히 자라고, 영원은 디스크보다 깁니다. 스냅숏은 재구성 시간을 묶어 주지만 용량에 대해서는 아무것도 하지 않습니다. 오래된 이벤트를 어디로 보낼지, 종료된 애그리게이트를 통째로 보관 이관할 수 있는지, 삭제 요청이 삭제하지 않도록 설계된 저장소에서 무엇을 뜻하는지를 일찍 정해 두어야 합니다. "불변"과 "이 사람의 데이터를 지워 달라"는 장애 대응이 아니라 설계에서 화해시켜야 합니다.
- 로그에서 파생된 것은 모두 결과적으로만 일관됩니다. 쓰기 쪽은 이벤트를 커밋하고 돌아오고, 조회 모델은 잠시 뒤에 따라옵니다. 폼을 제출한 사용자에게 곧바로 투영으로 만든 목록을 보여 주면 낡은 데이터를 보게 됩니다. 대개의 해법은 쓰기 직후의 화면만 애그리게이트에서 읽고 나머지는 투영에서 읽는 것입니다.
- 전부를 이벤트로 소싱하지 마세요. 참조 데이터, 설정값, 국가 목록, 흥미로운 역사가 없는 레코드를 다루는 관리 화면 같은 것은 이벤트 스트림으로 만들면 나아지는 것이 아니라 나빠집니다. 이 패턴은 역사에 가치가 있는 곳에서 복잡도에 걸맞은 값을 합니다. 시스템 전체에 균일하게 적용하는 것이 이벤트 소싱을 비싸다고 부르게 만드는 방식입니다.
- 정정에는 업무가 알아듣는 이름이 필요합니다. `ItemRemovedInError`는 누군가에게 물어볼 수 있는 도메인 사실입니다. JSON 차이가 담긴 일반적인 `Corrected` 이벤트는 분장한 데이터베이스 갱신일 뿐이고, 이 패턴이 사 주기로 했던 것을 하나도 돌려주지 않습니다.
- 로그를 재생하는 것과 다시 실행하는 것은 다릅니다. 재구성은 메일을 보내거나 카드를 승인하거나 누군가를 호출해서는 안 됩니다. 부수 효과는 새 이벤트에 반응하는 핸들러에만 두고, 재구성이 훑고 지나가는 `Apply` 메서드에는 절대 두지 마세요. 그러지 않으면 운영 환경에서의 첫 재생이 엉뚱한 이유로 기억에 남습니다.

## .NET에서는

저장소는 덧붙이기 전용 테이블이고 애그리게이트는 그 위의 접기입니다. 여기에 프레임워크가 필요한 부분은 없습니다.

```csharp
// One row per event. Nothing in this table is ever updated or deleted, so the
// primary key is (stream, version) and the only statement that touches it is
// an INSERT.
public class StoredEvent
{
    public Guid StreamId { get; set; }
    public int Version { get; set; }
    public string Type { get; set; } = "";   // "ItemAdded"
    public int SchemaVersion { get; set; }   // 1, 2, 3 …
    public string Data { get; set; } = "";   // the payload, as JSON
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<StoredEvent>().HasKey(e => new { e.StreamId, e.Version });
    model.Entity<StoredEvent>().Property(e => e.Data).HasColumnType("jsonb");
}
```

애그리게이트가 결정하고, 내놓는 것은 변경이 아니라 이벤트입니다. `Apply`는 상태가 바뀌는 유일한 자리이고, 재구성이 부르는 것도 같은 메서드입니다.

```csharp
public class Order
{
    private readonly List<object> _pending = new();

    public int Items { get; private set; }
    public bool Paid { get; private set; }
    public int Version { get; private set; }

    // The command: it validates, and then it records. It never assigns to a
    // property directly, because the state has to be reachable from the log.
    public void AddItem(string sku)
    {
        if (Paid) throw new InvalidOperationException("the order is already paid");
        Raise(new ItemAdded(sku));
    }

    private void Raise(object e)
    {
        Apply(e);
        _pending.Add(e);
    }

    // The fold. A replay calls exactly this, so a rebuilt aggregate and a live
    // one cannot disagree — and nothing in here may have a side effect.
    public void Apply(object e)
    {
        switch (e)
        {
            case ItemAdded: Items += 1; break;
            case ItemRemoved: Items -= 1; break;
            case OrderPaid: Paid = true; break;
        }
        Version += 1;
    }

    public static Order Rehydrate(IEnumerable<object> history)
    {
        var order = new Order();
        foreach (var e in history) order.Apply(e);
        return order;
    }
}
```

덧붙이기는 낙관적 동시성이 사는 자리입니다. 기대 버전이 삽입의 일부이므로, 한 애그리게이트를 두고 경쟁하는 두 쓰기는 갱신 손실이 아니라 고유 키 위반을 냅니다. 가변 행에 `rowversion`이 주는 것과 같은 보장을, 여기서는 기본 키에서 공짜로 얻습니다.

```csharp
public async Task AppendAsync(Guid stream, int expectedVersion, IEnumerable<object> events)
{
    var version = expectedVersion;
    foreach (var e in events)
    {
        version += 1;
        db.Events.Add(new StoredEvent
        {
            StreamId = stream,
            Version = version,
            Type = e.GetType().Name,
            SchemaVersion = 1,
            Data = JsonSerializer.Serialize(e, e.GetType()),
            At = DateTimeOffset.UtcNow,
        });
    }

    // Unique on (StreamId, Version): whoever gets there second is told so.
    await db.SaveChangesAsync();
}
```

직렬화는 `System.Text.Json`이고, 5년 뒤에도 이벤트를 읽을 수 있게 만드는 것은 `Type`과 `SchemaVersion` 두 열입니다. 읽기는 `JsonSerializer.Deserialize<object>`가 아니라 그 두 열에 대한 분기입니다. 페이로드의 모양은 지금 코드가 기대하는 바가 아니라 그때 쓰인 바가 정하기 때문입니다.

```csharp
static object Rehydrate(StoredEvent row) => (row.Type, row.SchemaVersion) switch
{
    ("ItemAdded", 1) => Upcast(JsonSerializer.Deserialize<ItemAddedV1>(row.Data)!),
    ("ItemAdded", 2) => JsonSerializer.Deserialize<ItemAdded>(row.Data)!,
    ("OrderPaid", 1) => JsonSerializer.Deserialize<OrderPaid>(row.Data)!,
    _ => throw new NotSupportedException($"{row.Type} v{row.SchemaVersion}"),
};
```

스냅숏은 스트림과 버전을 키로 삼는 두 번째 테이블이고, 담는 것은 이벤트가 아니라 직렬화된 상태입니다. 이것은 캐시입니다. 적재 경로는 원하는 버전 이하의 가장 최신 스냅숏을 가져와 적용하고, 그 뒤의 이벤트만 읽습니다. 테이블을 지워도 시스템은 그대로 동작하고 다만 느려집니다. 스냅숏을 만든 것인지 두 번째 진실을 실수로 만든 것인지 가려 주는 시험입니다.

```csharp
var snap = await db.Snapshots
    .Where(s => s.StreamId == id)
    .OrderByDescending(s => s.Version)
    .FirstOrDefaultAsync();

var order = snap is null
    ? new Order()
    : Order.FromSnapshot(JsonSerializer.Deserialize<OrderState>(snap.State)!);
var from = snap?.Version ?? 0;

await foreach (var row in db.Events
    .Where(e => e.StreamId == id && e.Version > from)
    .OrderBy(e => e.Version)
    .AsAsyncEnumerable())
{
    order.Apply(Rehydrate(row));
}
```

투영은 4단계이고, 다른 사람이 쓴 같은 접기입니다. 구독자가 로그를 순서대로 훑으면서 자기가 도달한 위치를 보관하고, 자기 화면이 원하는 모양으로 씁니다. 두 번째 구독자는 감사 뷰를 위해 똑같이 하고, 둘은 서로를 모릅니다. 위치가 뷰와 함께 저장되므로 투영을 다시 만드는 일은 테이블을 지우고 위치를 0으로 되돌린 뒤 돌리는 것이 전부입니다. 조회 모델의 버그가 이관이 아니라 한나절이 되는 이유입니다.

직접 소유하고 싶지 않다면 Marten과 EventStoreDB가 위의 내용을 모두 묶어 줍니다. 스트림 종류가 하나를 넘어가면 둘 다 손을 뻗을 만합니다. 어느 쪽도 위의 모양을 바꾸지는 않고, 그것이 먼저 손으로 적어 본 이유입니다.
