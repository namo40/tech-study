---
title: "Event Sourcing"
summary: "Event Sourcing は、今の姿ではなく起きたことを保存します。あらゆる変更は追記されるイベントであり、現在の状態はログを再生した結果であり、更新も削除もされないそのログ自体が、ほかのすべてを導き出す唯一の記録になります。"
category: "アプリケーションアーキテクチャ"
scene: event-sourcing
steps:
  - title: "今の姿ではなく、起きたことを書きます"
    text: "コマンドが集約に届き、集約が決定し、保存されるのはイベントです。ログに追記するだけで、何も上書きしません。左の状態カードは、右のログの累計にすぎません。"
  - title: "状態は再生の結果です"
    text: "集約を消しても失うものはありません。ログを最初から流せば、同じ状態がイベント 1 つずつ育ち直します。再生を早めに止めれば、見えるのは過去です。ログは真実のすべてのバージョンを覚えています。"
  - title: "再生が長くなったら、写真を撮っておきます"
    text: "スナップショットはある順番の時点の状態を保存します。次の再構成はそこから出発し、その後のものだけを再生します。ここではログ全体ではなく 1 行だけです。真実は依然としてログであり、スナップショットは捨ててかまいません。"
  - title: "1 つのログから、複数の真実が導かれます"
    text: "同じイベントが、こちらでは projection を、あちらでは監査記録を作り出します。どちらも、もう 1 つの再生にすぎません。そして訂正は UPDATE ではありません。イベントを 1 つ追記すれば、導出されたすべてのビューが追いつきます。歴史は育つだけなので、正直なまま残ります。"
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

## いつ使うか

- 歴史そのものが製品であるときです。元帳、注文、在庫の移動、規約の変更のように監査が付いて回る領域では、出来事の並びはデバッグの補助ではなく、業務が実際に所有している資産です。`balance = 412.30` と書かれた 1 行は、誰もが尋ねてくる唯一の記録をすでに捨てています。
- 「どうしてこの状態になったのか」に答えられる必要があるときです。現在状態のテーブルは、今何が真かは教えてくれます。しかし 5 回の変更のどれが、どの順で、誰の権限でそうしたのかは教えてくれません。その問いが問い合わせとして、監督機関の文書として、再現しないバグ報告として届いたことがあるなら、必要だったのはイベントです。
- 1 つの書き込みモデルから複数の照会ビューが導かれるときです。Event Sourcing は CQRS と自然に組み合わさります。ログが記録になれば、read model はその上のもう 1 つの畳み込みにすぎず、2 つ目のビューの費用はスキーマ変更ではなく購読者 1 つです。作り間違えたビューは消してログから作り直せます。2 年間更新し続けたテーブルにはない選択肢です。
- 訂正を説明できる必要があるときです。`UPDATE` 1 回が証跡を静かに消してしまう領域なら、補正イベントは何が誤りで、いつ気づき、どう処理したのかを語ります。変わった 1 行と、うまく動いてほしい監査トリガーよりもずっとよい成果物です。
- 時点の照会が仕事の一部であるときです。「3 月 3 日にこの注文はどんな姿だったか」は早めに止めた再生です。ログがあればほぼ無料で、なければほぼ不可能です。

## 注意点

- イベントは契約であり、そのバージョン管理こそが本当の長期費用です。テーブルの行は移行できますが、10 年分の保存済みイベントは、保存する価値を生んでいた性質を壊さずには書き直せません。最初のデプロイ前に計画が要ります。すべてのイベントに型名とバージョンを付け、読み込み時に古い形を新しい形へ変えるアップキャスターを置き、すでに存在するイベントの意味は決して変えないという規律を持つことです。新しいイベント型の追加は安いです。古いものの変更は安くありません。
- ログは永遠に育ち、永遠はディスクより長いです。スナップショットは再構成時間を抑えますが、容量については何もしません。古いイベントをどこへ送るか、終わった集約をまるごと保管に回せるか、削除しないよう設計されたストアで削除要求が何を意味するかを早めに決めてください。「不変」と「この人のデータを消してほしい」は、障害対応ではなく設計の中で折り合いを付ける必要があります。
- ログから導かれるものはすべて結果整合です。書き込み側はイベントをコミットして戻り、read model は少し後で追いつきます。フォームを送ったユーザーにすぐ projection から作った一覧を見せれば、手当てをしておかないかぎり古いデータが見えます。手当ては通常、書き込み直後の画面だけ集約から読み、ほかは projection から読むことです。
- すべてを Event Sourcing にしないでください。参照データ、設定値、国の一覧、面白い歴史のないレコードを扱う管理画面のようなものは、イベントストリームにするとよくなるのではなく悪くなります。このパターンは歴史に価値がある場所で複雑さの元を取ります。システム全体へ一様に適用することが、Event Sourcing を高価だと呼ばせる原因です。
- 訂正には業務が分かる名前が要ります。`ItemRemovedInError` は誰かに尋ねられるドメインの事実です。JSON の差分を抱えた一般的な `Corrected` イベントは、衣装を着たデータベース更新であり、このパターンが買ってくれるはずだったものを何も返してくれません。
- ログを再生することと、実行し直すことは別です。再構成はメールを送っても、カードを決済しても、誰かを呼び出してもいけません。副作用は新しいイベントに反応するハンドラーだけに置き、再構成が通り抜ける `Apply` メソッドには決して置かないでください。さもないと本番での最初の再生が、よくない理由で記憶に残ります。

## .NET では

ストアは追記専用のテーブルで、集約はその上の畳み込みです。ここにフレームワークが要る部分はありません。

```csharp
// イベント 1 つにつき 1 行。このテーブルの行が更新されることも削除されることも
// ないので、主キーは (stream, version) であり、このテーブルに触れる文は
// INSERT だけです。
public class StoredEvent
{
    public Guid StreamId { get; set; }
    public int Version { get; set; }
    public string Type { get; set; } = "";   // "ItemAdded"
    public int SchemaVersion { get; set; }   // 1, 2, 3 …
    public string Data { get; set; } = "";   // JSON にしたペイロード
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<StoredEvent>().HasKey(e => new { e.StreamId, e.Version });
    model.Entity<StoredEvent>().Property(e => e.Data).HasColumnType("jsonb");
}
```

集約が決定し、生み出すのは変更ではなくイベントです。`Apply` は状態が変わる唯一の場所であり、再構成が呼ぶのも同じメソッドです。

```csharp
public class Order
{
    private readonly List<object> _pending = new();

    public int Items { get; private set; }
    public bool Paid { get; private set; }
    public int Version { get; private set; }

    // コマンド。検証し、そのうえで記録します。プロパティに直接代入することは
    // ありません。状態はログからたどり着けるものでなければならないからです。
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

    // 畳み込み。再生もまさにこれを呼ぶので、再構成した集約と生きている集約が
    // 食い違うことはありません。そしてここに副作用があってはいけません。
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

追記は楽観的同時実行制御が住む場所です。期待バージョンが挿入の一部なので、1 つの集約を巡って競合する 2 つの書き込みは、更新の消失ではなく一意キー違反になります。可変な行に `rowversion` が与えるのと同じ保証を、ここでは主キーから無料で得ます。EF Core はこの違反を、`DbUpdateConcurrencyException` ではなく、プロバイダーのエラーを包んだ `DbUpdateException` として表面化させます。読み直して再試行するループが捕まえるべき例外はそちらです。

```csharp
public async Task AppendAsync(
    Guid stream, int expectedVersion, IEnumerable<object> events, CancellationToken ct)
{
    var version = expectedVersion;
    foreach (var e in events)
    {
        version += 1;
        db.Events.Add(new StoredEvent
        {
            StreamId = stream,
            Version = version,
            Type = e switch                        // クラス名ではなく、選んだ名前
            {
                ItemAdded => "ItemAdded",
                ItemRemoved => "ItemRemoved",
                OrderPaid => "OrderPaid",
                _ => throw new NotSupportedException(e.GetType().Name),
            },
            SchemaVersion = 1,
            Data = JsonSerializer.Serialize(e, e.GetType()),
            At = DateTimeOffset.UtcNow,
        });
    }

    // (StreamId, Version) に一意制約。2 番目に着いたほうはそう知らされます。
    await db.SaveChangesAsync(ct);
}
```

保存する名前を `e.GetType().Name` ではなくあの switch から取るのは、テーブルの中の名前がコードの中の名前より長生きしなければならないからです。クラス名を変えれば、リフレクションで得た名前は、すでに書かれたすべての行と静かに一致しなくなります。シリアライズは `System.Text.Json` で、5 年後にもイベントを読めるようにするのは `Type` と `SchemaVersion` の 2 列です。読み取りは `JsonSerializer.Deserialize<object>` ではなく、その 2 列に対する分岐です。ペイロードの形は、今のコードが期待するものではなく、そのとき書かれたものが決めるからです。

```csharp
static object Rehydrate(StoredEvent row) => (row.Type, row.SchemaVersion) switch
{
    ("ItemAdded", 1) => Upcast(JsonSerializer.Deserialize<ItemAddedV1>(row.Data)!),
    ("ItemAdded", 2) => JsonSerializer.Deserialize<ItemAdded>(row.Data)!,
    ("OrderPaid", 1) => JsonSerializer.Deserialize<OrderPaid>(row.Data)!,
    _ => throw new NotSupportedException($"{row.Type} v{row.SchemaVersion}"),
};
```

スナップショットはストリームとバージョンをキーにした 2 つ目のテーブルで、収めるのはイベントではなくシリアライズされた状態です。これはキャッシュです。読み込み経路は欲しいバージョン以下で最も新しいスナップショットを取って適用し、その後のイベントだけを読みます。テーブルを消してもシステムは動き、ただ遅くなるだけです。スナップショットを作ったのか、2 つ目の真実をうっかり作ったのかを見分けるテストです。

```csharp
var snap = await db.Snapshots
    .Where(s => s.StreamId == id)
    .OrderByDescending(s => s.Version)
    .FirstOrDefaultAsync(ct);

var order = snap is null
    ? new Order()
    : Order.FromSnapshot(JsonSerializer.Deserialize<OrderState>(snap.State)!);
var from = snap?.Version ?? 0;

await foreach (var row in db.Events
    .Where(e => e.StreamId == id && e.Version > from)
    .OrderBy(e => e.Version)
    .AsAsyncEnumerable()
    .WithCancellation(ct))
{
    order.Apply(Rehydrate(row));
}
```

projection は 4 番目のステップであり、別の人が書いた同じ畳み込みです。購読者がログを順に辿り、自分が到達した位置を保存し、自分の画面が求める形で書きます。2 つ目の購読者は監査ビューのために同じことをし、両者は互いを知りません。位置がビューと一緒に保存されるので、projection を作り直すのはテーブルを消し、位置を 0 に戻して動かすだけです。read model のバグがマイグレーションではなく半日で済む理由です。

自分で持ちたくなければ、Marten と KurrentDB (旧 EventStoreDB) が以上をまとめて提供します。ストリームの種類が 1 つを超えたらどちらも手を伸ばす価値があります。どちらも上の形を変えはしません。それが先に手で書いてみた理由です。
