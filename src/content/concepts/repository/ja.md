---
title: "Repository"
summary: "repository はドメインに、コレクションのように見える保存の扉を渡します。ドメインはアイデンティティでエンティティを求めるだけで SQL を見ず、エンティティは id で等しく、値オブジェクトは内容で等しく、保存技術は外側の層に置かれる詳細になります。"
category: ".NET データアクセス"
scene: repository
steps:
  - title: "永続化がドメインへ漏れるのは、ゆっくりとした浸水です"
    text: "ゴーストはサービスの中に食い込む SQL の断片を見せます。クエリごとに複製され、写しごとにずれ、データベースなしでは何もテストできません。repository は扉です。ドメインは Find と Add でだけ話し、保存に関するすべてはその扉の後ろに収まります。"
  - title: "repository はコレクションのように見えて、エンジンを隠します"
    text: "ドメインはメモリー上の集合に話すように Find と Add を呼び、実装が扉の後ろで SQL に翻訳します。その実装を偽物に替えてもドメインは気づきません。それこそがテストの継ぎ目であり、まさに要点です。"
  - title: "エンティティは見た目ではなく、アイデンティティで等しいのです"
    text: "2 枚のカードがどちらも id 7 なら、フィールドが違っても 1 つの存在の 2 つの時点です。フィールドがそっくりでも id が違う 2 枚は他人です。repository が探し、追跡し、更新する基準がアイデンティティであり、属性は今日の状態にすぎません。"
  - title: "値オブジェクトは内容で等しく、それがすべてです"
    text: "10 USD のチップ 2 枚は同じお金です。id も履歴も repository もありません。値オブジェクトは直さず新しいチップに置き換え、内容が同じなら同じお金です。共有しても安全で、テストは些細です。"
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Index
    slug: database-index
references:
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
  - title: "Implement the infrastructure persistence layer with EF Core"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation-entity-framework-core
  - title: "Testing EF Core applications"
    url: https://learn.microsoft.com/en-us/ef/core/testing/
---

## いつ使うか

- ドメインに、永続化から切り離す価値のあるふるまいがあるときです。丸ごと読み込み、不変条件を検査し、丸ごと保存しなければならない集約は、まさに repository が受け持つ形です。オブジェクトを手渡すメソッドが 1 つ、新しいオブジェクトを受け取るメソッドが 1 つあればよく、ドメインの中にはそのどちらがどこから来たのかを知るコードがありません。そうすると面白いコードが、データベースについての文ではなく業務についての文として読めます。
- テストがデータベースなしで走らなければならないときです。この一点だけで抽象化の代金は返ってきます。ドメインが依存する先がインターフェイスなら、テストプロジェクトの辞書 1 つでも満たせます。「支払いが確定するまで注文は出荷できない」という規則に、1 ミリ秒で終わり、ただ 1 つの理由でだけ失敗するテストが付きます。そうでなければ、その 3 つのどれとも関係のない事実を確かめるために、サーバーとスキーマと後片付けの手順を必要とするテスト群を抱えることになります。
- 保存技術が変わりうるとき、あるいはすでに 1 つではないときです。読み取りはキャッシュから、書き込みは SQL へ、検索インデックスはその隣に、という構成でも、扉の取っ手だけを握る呼び出し側はどれが答えたかを気にしません。そのうちの 1 つを差し替える日、変更は実装で止まります。ドメインが `DbContext` と直接話すシステムでは、その決定がすべての呼び出し箇所に散らばっています。
- 複数の呼び出し箇所が同じ読み込みを必要とするときです。扉の後ろに一度だけ書いた `FindActiveByCustomer` は、include の構成が決まったクエリ 1 つです。同じ読み込みを 6 つのサービスに書き下すと、互いにずれていくクエリが 6 つになり、その 6 番目が include を忘れて N+1 になります。
- すべてのテーブルに必要なわけでは**ありません**。CRUD 画面にも要りません。`DbSet<T>` はすでに repository であり、`DbContext` はすでに作業単位です。6 つのメソッドを 6 つの `DbSet` 呼び出しへそのまま流すだけの `IProductRepository` で包んでも、増えるのはファイル 1 つだけです。画面がテーブル上の入力フォームで、守るべき不変条件もないなら、コンテキストに問い合わせ、DTO へプロジェクションして先へ進んでください。

## 注意点

- EF Core の `DbSet` がそのまま repository パターンであり、`DbContext` がそのまま作業単位です。ですからその上に載せる repository は、ドメイン側の理由で自らを正当化しなければなりません。強制したい集約境界、テストが差し込める継ぎ目、一度だけ書きたいクエリの語彙といったものです。「本にそう書いてあった」は理由になりませんし、ただ流すだけの薄い包みが、このパターンが悪く言われる最もありふれた経路です。
- `IQueryable` ではなく集約を返してください。インターフェイスの外へ出た `IQueryable<Order>` は、呼び出し側に扉の鍵を渡します。任意のフィルターも結合もプロジェクションも足せるので、repository はもう、何が読み込まれるかも、いつ実行されるかも、接続がまだ生きているかも制御できません。呼び出し側に本当に任意のクエリが必要なら、それは読み取り経路を別に作れという合図であって、インターフェイスをより緩くせよという合図ではありません。
- repository は集約ルートごとに 1 つであって、テーブルごとに 1 つではありません。`IOrderLineRepository` は存在しません。明細は、それを所有する注文の外では生きられないからです。もしそれを作れば、ルートに一度も触れていない人が、ルートの守ろうとしていた不変条件を壊せるようになります。システム内の repository の数は少ないはずで、1 つの単位として一貫していなければならないものの数と一致するはずです。
- 画面向けのクエリはここに置く場所がありません。repository に `GetOrderSummariesForDashboard` が生えた瞬間、それはドメインのコレクションであることをやめ、画面層になります。読み取りモデルはドメインを丸ごと飛ばしてかまいません。Dapper のクエリや追跡なしのプロジェクションで DTO を直接作るほうが速く単純で、レポートのために集約を引きずり込みません。
- 最後まで非同期で通し、`CancellationToken` を受け取ってください。repository は入出力の境界なので、その上のすべてのメソッドは本質的に非同期です。非同期プロバイダーの上に同期の `Find` を載せるのは、スレッドプール枯渇の事故への最短経路であり、その事故はデータベースのせいにされます。
- メモリー上の偽実装が同じアイデンティティの規則を守らなければ、テストは嘘をつきます。本物の実装は同じ id で 2 度目の `Find` をすると追跡中のインスタンスを返すのに、偽物が新しい写しを返すなら、通ったテストが本番について証明することは何もありません。偽物の中に id を鍵にした辞書を 1 つ置き、そこにあるものをそのまま返してください。
- すべてのメソッドの中に `SaveChanges` を入れないでください。`Add` のたびにコミットする repository は、トランザクション境界を呼び出し側から静かに奪っており、一緒に成功しなければならない 2 つの書き込みがもうそうできなくなります。コレクションに入れることと作業単位をコミットすることは別の決定であり、2 つ目の決定は、その操作が何だったかを知っている側のものです。

## .NET では

インターフェイスはドメインプロジェクトに置きます。そうすることで依存の向きが正しく立ちます。ドメインが必要なものを宣言し、外側の層がそれを供給します。

```csharp
// ドメインプロジェクトです。このアセンブリのどこにも EF Core への参照はありません。
public interface IOrderRepository
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    void Add(Order order);
    // Update も Save もありません。集約がしたことは作業単位がコミットします。
}
```

EF Core の実装は外側の層に置かれ、`DbContext` を注入で受け取り、システムの中で「SQL」という語を知る唯一の場所になります。

```csharp
public sealed class OrderRepository(ShopDbContext db) : IOrderRepository
{
    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        db.Orders
          .Include(o => o.Lines)          // 集約は丸ごと読み込みます
          .SingleOrDefaultAsync(o => o.Id == id, ct);

    public void Add(Order order) => db.Orders.Add(order);
}
```

`DbSet` の `FindAsync` は知っておく価値があります。データベースへ行く前に変更追跡器を先に見るので、1 つの作業単位の中で同じ id を二度尋ねると、食い違う 2 つのオブジェクトではなく同じインスタンスが返ります。そのふるまいこそアイデンティティが働いている姿であり、偽実装も同じことをしなければならない理由です。

エンティティはアイデンティティで等しいので、基底クラスに一度書いておき、二度と `Equals` を書きません。

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

値オブジェクトは内容で等しく、その場で書き換えられることはありません。`record` が両方を無料でくれます。構造的な等値性が付いてきますし、`with` は手元のインスタンスを変える代わりに新しいインスタンスを返します。

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // 変更ではなく新しい値
            : throw new InvalidOperationException("mixed currencies");
}
```

EF Core は `ComplexProperty` で値オブジェクトを所有者のテーブルの列として保存します。「アイデンティティもなく、自分の repository もない」をモデリングに移したものです。`Money` テーブルもなければ、それだけを読み込む方法もありません。`OwnsOne` は同じ道具に見えて、そうではありません。所有型はあくまでエンティティで、自分のキーと追跡されるアイデンティティを持ち、参照型でなければなりません。

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.HasKey(o => o.Id);
        order.ComplexProperty(o => o.Total);   // Orders の Total_Amount と Total_Currency
        order.OwnsMany(o => o.Lines);          // 明細はそれ自体の生を持ちません
    });
}
```

作業単位は `DbContext` です。だからコミットは追加とは別の決定であり、操作全体が 1 つのトランザクションに収まります。

```csharp
public async Task<OrderId> PlaceAsync(Cart cart, CancellationToken ct)
{
    var order = Order.From(cart);         // データベースの影もなく、ドメインが決めます
    orders.Add(order);
    await db.SaveChangesAsync(ct);        // トランザクション 1 つ、コミット 1 回
    return order.Id;
}
```

ドメインのテストを速くする偽実装は辞書 1 つです。同じ id に同じインスタンスを返す点で役目を果たします。

```csharp
public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly Dictionary<OrderId, Order> _orders = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_orders.GetValueOrDefault(id));

    public void Add(Order order) => _orders[order.Id] = order;
}
```

読み取り側はこのすべてを飛ばします。ダッシュボードに集約は要らないので、コンテキストへ直接問い合わせ、画面が望む形へまっすぐプロジェクションします。追跡も include も、また平らに戻すためだけに作るドメインオブジェクトもありません。

```csharp
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Total.Amount))
    .ToListAsync(ct);
```

この分かれ目がこの設計のすべてです。規則のある書き込みには小さく退屈なインターフェイスを、規則のない読み取りには直接のクエリを使います。
