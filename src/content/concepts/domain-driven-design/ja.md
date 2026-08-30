---
title: "Domain-Driven Design"
summary: "ドメイン駆動設計は、言語が変わる場所に国境を引きます。bounded context の中では一つの単語が一つのことを意味し、aggregate root が扉のところで不変条件を守り、コンテキストどうしはモデルを共有せず翻訳で対話します。"
category: "アプリケーションアーキテクチャ"
scene: domain-driven-design
steps:
  - title: "全員が共有するモデルは、誰のものでもないモデルです"
    text: "ゴーストは、販売と配送と請求を一度に仕えるうちに育った一つの Order オブジェクトを見せます。フィールド四十個、単語ごとに四つの意味、そしてあらゆる変更が交渉です。DDD は告白から始まります。ビジネスにはモデルが一つではありません。言語が変わる場所に国境を引きます。"
  - title: "bounded context の中では、一つの単語は一つのことを意味します"
    text: "Sales の Order は価格と割引を知り、Shipping の Order は住所と箱を知ります。同じ単語、二つのモデルで、どちらも小さく、どちらも正しい。それぞれが自分のコンテキストの投げる質問で定義されているからです。国境は人を防ぐ壁ではなく、意味についての約束です。"
  - title: "aggregate root は、一貫性を守る国境の門番です"
    text: "注文の行は Order を通じてだけ変わります。ルートが変更のたびに不変条件(合計が合わなければならない)を検査するので、どんな書き込みもこっそり通り抜けてそれを壊せません。外の参照は行ではなくルートの id だけを握ります。扉一つ、番人一人、いつでも真の規則一つです。"
  - title: "コンテキストは共有ではなく翻訳で対話します"
    text: "Sales は自分の言語でイベントを発行し、Shipping はそれを聞いて自分の Order を新しく建てます。どちらも相手のクラスを持ち込まないので、各モデルは変わる自由を保ちます。コンテキストと翻訳の地図こそがアーキテクチャであり、コードはその地図に同意するだけです。"
related:
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Unit of Work
    slug: unit-of-work
  - label: Saga
    slug: saga
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
---

## いつ使うか

- ドメインに本物のビジネス複雑性があり、言語が争われているときに使います。コマース、物流、請求、保険、医療のように、「注文」「顧客」「アカウント」が部署ごとにはっきり違うことを意味し、その違いを取り違えると趣味の問題ではなく金額が動く領域です。会議で二人が一つの単語の意味を十分間言い合えるなら、その単語はまだ引かれていない国境です。
- 複数のチームがシステムをそれぞれ独立に育てなければならないときに使います。コンテキストの境界はチームの境界になり、やがてサービスの境界になります。順序が逆になるとうまくいきません。コンテキストを所有するチームは、そのモデルとスキーマとリリース間隔をまとめて所有し、チームをまたぐ移行なしに三つとも変えられます。外の誰もそのチームのクラスを握っていないからです。
- 「共有モデルにフィールドを一つ足すだけ」が既定の動きになったときに使います。その一文は、誰のものでもないモデルが出す音です。ある部署のために足したフィールドは、残りの四つの部署が無視するか、間違えて埋めるか、防がなければならないフィールドであり、オブジェクトは何のためのものか誰も一言で言えなくなるまで育ちます。シーンの 1 段階目がまさにそのオブジェクトです。
- 規則が面白く、守る価値があるときに使います。ドメインの中で面白い文が「合計は行の合計と一致しなければならない」や「決済が確定する前に出荷はできない」という形をしているなら、それが不変条件であり、不変条件には持ち主が必要です。その持ち主が aggregate root であり、扉を一つ与えることは買える中でいちばん安い正しさです。
- テーブルの上の CRUD には使わないでください。フォーム生成器、管理画面、参照データの編集画面には、争う言語も、名前を付ける価値のある不変条件もありません。DDD の費用は実在します。モデリングの会話、翻訳層、参照についての規律がどれも費用であり、守るものがないシステムはその費用だけを払って何も返してもらえません。

## 注意点

- bounded context はデプロイではなく言語についてのものです。互いのテーブルに触らない二つのコンテキストを持つモジュラーモノリスは境界を守り、一つの `Entities.dll` を共有するマイクロサービスの群れは現代的に見えながら境界を破ります。問うべきは「サービスがいくつか」ではなく「モデルがいくつで、それぞれの持ち主は誰か」です。デプロイの構成は地図に従って後から決めればよく、従わないほうがよい場合も少なくありません。
- 共有された正典モデルは、DDD がなくすために存在するアンチパターンです。真実は一つ、重複はなし、直す場所も一か所という善意で提案されますが、届くのは正反対のものです。すべてのチームが合意しなければならず、誰も単純にできないスキーマができ、その前に変更の待ち行列が伸びます。翻訳を挟んだ二つのモデルのほうが、持ち主が五人いる一つのモデルより安いのです。人が恐れる重複は欠陥ではなく、独立の値段です。
- 集約はオブジェクトグラフではなく一貫性の境界です。一つの規則が可否を答えるために読む必要のあるデータだけをちょうど囲み、それ以上には広げません。規則が注文の合計についてのものなら、自分の行を所有する `Order` が正しく、顧客とその住所録とポイントまで所有する `Order` は、誰が何を買っても顧客にロックを掛けます。ほかの集約は id で参照し、それらのあいだの一貫性は少し遅れて届くことを受け入れます。
- 不変条件がなければ集約もありません。トランザクションが終わるたびにエンティティの束をまたいで真でなければならないものが何もないなら、その束は集約ではなく、ルートは儀式です。境界を定義するのは不変条件の一覧です。一覧を書き出せないなら、見つけたのは境界ではなくフォルダです。
- ほかのチームのモデルが入ってくる境界には、必ず翻訳層を置きます。anti-corruption layer は、相手の形を自分の形に変える小さく退屈でまったく格好よくないクラスですが、自分のモデルと他人のリリース日程のあいだに立つ唯一のものです。これを飛ばすと、他人のモデルが静かに自分のモデルになります。
- ユビキタス言語は手入れをしないと死にます。用語集は文書ではなくコードレビューの材料です。ドメイン専門家が「託送」と言うのにクラスが `Shipment` なら、どちらかが間違っていて、安く気づける瞬間は今です。誰も直さない言語は一年のうちに四つの私的な方言に戻り、その言語から引いた国境ももう何とも合わなくなります。

## .NET では

集約はただのクラスです。基底クラスもフレームワークも属性もありません。外から代入できないように setter を private にし、外から追加できないようにコレクションを private にし、中へ入る唯一の通路である振る舞いメソッドを置きます。

```csharp
public class Order
{
    private readonly List<OrderLine> _lines = new();

    public Guid Id { get; private set; } = Guid.NewGuid();
    public Guid CustomerId { get; private set; }          // Customer ではなく id
    public decimal Total { get; private set; }
    public IReadOnlyCollection<OrderLine> Lines => _lines;

    // 扉は一つ。不変条件が頼るものはすべてこのクラスの中にあるので、
    // 行へ直接書いて検査を飛ばすことはできない。
    public void AddLine(string sku, int quantity, decimal price)
    {
        if (quantity <= 0) throw new DomainException("a line needs a quantity");
        _lines.Add(new OrderLine(sku, quantity, price));
        Total = _lines.Sum(l => l.Quantity * l.Price);
        CheckInvariants();
    }

    private void CheckInvariants()
    {
        if (Total != _lines.Sum(l => l.Quantity * l.Price))
            throw new DomainException("the total no longer matches the lines");
    }
}
```

`order.Lines.Add(...)` ではなく `order.AddLine(...)` という一行に設計のすべてが入っています。後者の書き方は門番を回り込んだ書き込みであり、`Lines` が private なリストの上の `IReadOnlyCollection` なので型システムがそれを断ります。

EF Core はこの形を漏らさずに永続化します。バッキングフィールドのおかげでコレクションは private のままでいられ、所有型のおかげで値オブジェクトは自分のテーブルではなく親テーブルの列になります。

```csharp
protected override void OnModelCreating(ModelBuilder model)
{
    model.Entity<Order>(order =>
    {
        order.Navigation(o => o.Lines).UsePropertyAccessMode(PropertyAccessMode.Field);
        order.OwnsMany(o => o.Lines);              // 行はそれ自体の生を持たない
        order.OwnsOne(o => o.ShipTo);              // エンティティではなく値オブジェクト
        order.Property(o => o.Total).HasPrecision(18, 2);
    });
}
```

リポジトリはテーブルごとではなく集約ごとに置き、ルートを返します。`IOrderLineRepository` はありません。行は、それを所有する注文を通らずには届かないからです。

```csharp
public interface IOrderRepository
{
    Task<Order?> FindAsync(Guid id, CancellationToken ct);
    void Add(Order order);
    // Update はない。集約がしたことは unit of work がコミットする。
}
```

ドメインイベントが境界の向こうへ翻訳を運びます。集約はイベントを記録しておき、トランザクションがコミットされるまで何も発行しません。だから購読側が、巻き戻された変更の知らせを聞くことはありません。

```csharp
public class Order
{
    private readonly List<IDomainEvent> _events = new();
    public IReadOnlyCollection<IDomainEvent> Events => _events;

    public void Place()
    {
        Status = OrderStatus.Placed;
        _events.Add(new OrderPlaced(Id, CustomerId, _lines.Count));
    }
}

// コンテキストごとに DbContext を一つ、イベントはコミットとともに出ていく。
public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
{
    var roots = ChangeTracker.Entries<Order>().Select(e => e.Entity).ToList();
    var events = roots.SelectMany(r => r.Events).ToList();
    var saved = await base.SaveChangesAsync(ct);
    foreach (var e in events) await mediator.Publish(e, ct);   // コミットのあと
    return saved;
}
```

Shipping は `OrderPlaced` を購読し、自分が気にするフィールドだけで自分の `Shipment` を建てます。Sales のアセンブリを参照もしませんし、Sales のクラスを逆シリアル化もしません。イベントは名前と基本型でできた契約であり、ハンドラーこそが翻訳です。

```csharp
public class OrderPlacedHandler : INotificationHandler<OrderPlaced>
{
    public Task Handle(OrderPlaced e, CancellationToken ct)
    {
        var shipment = Shipment.For(e.OrderId, e.LineCount);   // 自分たちの単語、自分たちのモデル
        return repository.AddAsync(shipment, ct);
    }
}
```

bounded context ごとに `DbContext` を一つ、アセンブリを一つ置き、共有の `Entities` プロジェクトは作らないでください。二つのコンテキストがいつか二つのサービスになるとき、変わるのはイベントが一方から他方へ渡る方法だけです。先に国境を引いておいた理由がここにあります。
