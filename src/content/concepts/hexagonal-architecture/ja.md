---
title: "Hexagonal Architecture"
summary: "ヘキサゴナルアーキテクチャは、すべての依存を内側へ向けます。domain は真ん中で外側の名前をひとつも知らないまま座り、port はその domain が話す契約で、adapter は世界をその契約へ翻訳します。契約こそが境界なので、ウェブもデータベースもテストハーネスも差し替えられる詳細になります。"
category: "アプリケーションアーキテクチャ"
scene: hexagonal-architecture
steps:
  - title: "方向がなければ、外側が内側にひびを入れます"
    text: "ゴーストはデータベースに直結された domain を見せます。カラム名がひとつ変わると domain にひびが入り、そのひびはウェブ層まで走ります。誰かがこう選んだのではありません。誰も方向を決めてやらないとき、依存関係がすることがこれなのです。このアーキテクチャの全体がひとつのルールです。すべての依存は内側を向く。"
  - title: "内側は契約だけを話します"
    text: "port は domain が所有するインターフェースです。リクエストはこちらのポートから入り、domain の必要はあちらのポートから出て、どちらも domain 自身の言葉で書かれています。「この注文を保存せよ」であって「INSERT INTO」ではありません。内側を覗いても、ウェブも SQL もベンダー名もどこにもありません。その不在こそが設計です。"
  - title: "アダプターは世界を契約に翻訳します"
    text: "片面では HTTP や SQL を話し、もう片面ではポートだけを話します。データベースのアダプターをメモリのアダプターに差し替えても domain は気付きません。この場面のテストが、データベースなしで本物の domain を全速力で回せる理由です。差し替えられたのなら、それは詳細だったのです。アダプターは、すべての詳細が行って住む場所です。"
  - title: "同じルール、違う絵です"
    text: "ヘキサゴナルは六角形の上にポートを描き、クリーンアーキテクチャはエンティティを真ん中に置いた同心円を描き、オニオンは芯の周りの層を描きます。三つとも同じルールです。依存は内側を向き、真ん中は外の名前を知りません。チームの好きな絵を選び、ルールを守り、議論は別の場所に使ってください。"
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Facade
    slug: facade
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

## いつ使うか

- ドメインのロジックをインフラの移り変わりから守る価値があるときです。価格のルール、資格のルール、精算のルールのように、いまのウェブフレームワークが生まれる前にも正しく、それが置き換えられた後にも正しい文章たちです。システムの面白い部分が紙に書き出しても依然として面白いなら、その部分はどんな ORM のリリースノートも届かない場所に住む資格があります。
- 何も起動せずに中核をテストしたいときです。ポートに偽のアダプターを挿せば、本物のルールをメソッド呼び出しの速さで確かめるテストになります。データベースも HTTP ホストもコンテナも要りません。場面の第三段階がまさにその取引です。同じ domain、同じソケットに挿さった別のもの、そして何分の一かに縮んだ応答時間です。
- ひとつのアプリケーションが複数の外側に同時に向き合うときです。同じことをしなければならない HTTP エンドポイントとキューのコンシューマーと夜間スケジューラーは、ひとつのポートの上に載ったアダプター三つであって、それぞれ違うバグを抱えたロジックの写し三つではありません。入り口が二つ目になった瞬間に、この形は元を取ります。
- 詳細の差し替えがすでにロードマップにあるときです。データベースの移行、決済事業者の変更、ファイル共有からブロブストレージへの移動といった話です。ベンダー名がちょうど一つのクラスにしか現れないなら、それぞれは乗り切れる作業であり、四百箇所に現れるなら、それぞれは書き直しです。ポートは移行が決まっている最中ではなく、決まる前に引いておきます。
- **向かないの**は CRUD が薄いだけのサービスです。要求が「このフィールドをあのテーブルへ書け」であり、ドメインに守るべきルールがないなら、ポートとアダプターは守るものを何も増やさずにホップとインターフェースとマッピングだけを足します。素通りするドメインが得るのは儀式だけです。その場合はフレームワークを直接使い、守るべきものがある場所に労力を回すほうが得です。

## 注意点

- このルールの質はポートの言葉の質までです。`IQueryable<T>` を返したり `DbContext` を受け取ったりベンダーの例外型をそのまま投げるインターフェースは、インターフェースの服を着た配線です。外側は依然として内側にあり、ただ型引数を読まないと見つからないだけです。ポートは、ストレージエンジンの名前を一度も聞いたことがない人が読んでも意味が通るべきものです。
- ポートの所有権は内側に置きます。インターフェースはドメインのプロジェクトに宣言し、インフラのプロジェクトで実装します。そうして初めて矢印が望む向きを指します。ドメインのプロジェクトがインターフェースを見るためにインフラのプロジェクトを参照しているなら、向きはすでに静かに反転しており、ビルドは何の文句も言いません。
- アダプターは薄いままにします。アダプターに忍び込んだ判断のひとつひとつが、速いテストの死角になります。速いテストは偽物を相手に回るからです。翻訳とマッピング、リトライ方針、コネクションの扱いはアダプターの仕事ですが、業務のルールは違います。アダプターを単体テストしたくなった瞬間が、その合図です。
- 層のために層を増やさないでください。価値は依存の向きにあり、輪の数にはありません。ルールがひとつはっきりしているプロジェクト四つは、誰も言い直せないルールを抱えたプロジェクト九つに勝ります。呼び出しをただ転送するだけの層は、誰かが急いだ最初の瞬間に飛ばされます。
- 境界ごとに付くマッピングが目に見えるコストです。リクエストモデルからコマンドへ、コマンドからドメインオブジェクトへ、ドメインオブジェクトから永続モデルへ、そしてまた戻すコードは、データベースに直結する設計ならば無かった本物のコードです。保護が実在する場所ではその代金を払い、そうでない場所では断ります。CRUD のサービスがこの形を採るべきでない正直な理由がここにあります。
- コンポジションルートはすべての矢印がついに出会う場所で、全部を知ってよい唯一の場所です。小さく保ち、いちばん外側のプロジェクトに置き、中核の内側からサービスロケーターに手を伸ばしたくなる誘惑は退けてください。コンテナにものを頼める内側は、再び外側への依存を持ったことになり、しかも目に見えない形で持ったことになります。

## .NET では

この形は何よりも先にプロジェクト参照で強制されます。プロジェクト三つとルールひとつです。矢印は内側を向き、ドメインはプロジェクト参照をひとつも持ちません。

```
Shop.Domain           <- 参照なし。エンティティ、値オブジェクト、そしてポート
Shop.Infrastructure   -> Shop.Domain          (EF Core、HTTP クライアント、アダプター)
Shop.Web              -> Shop.Domain, Shop.Infrastructure   (コンポジションルート)
```

ポートはドメインの中に住み、ドメインの言葉で書かれます。ドメインが何を必要とするかを言うだけで、それを誰がどう提供するかは言いません。

```csharp
namespace Shop.Domain;

// ポート。テーブルではなく Order を名前で呼び、呼び出す側がストレージ
// エンジンを知らないと捕まえられない例外はひとつも投げない。
public interface IOrderStore
{
    Task<Order?> FindAsync(OrderId id, CancellationToken ct);
    Task SaveAsync(Order order, CancellationToken ct);
}

public sealed class PlaceOrder(IOrderStore orders, IClock clock)
{
    public async Task<OrderId> HandleAsync(PlaceOrderCommand command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines, clock.UtcNow);
        await orders.SaveAsync(order, ct);
        return order.Id;
    }
}
```

EF Core のアダプターは、同じインターフェースの後ろにストレージエンジンを置いたものです。ソリューション全体でテーブルの存在を知る唯一のファイルです。

```csharp
namespace Shop.Infrastructure;

internal sealed class EfOrderStore(ShopDbContext db) : IOrderStore
{
    public async Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        await db.Orders.Include(o => o.Lines).FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task SaveAsync(Order order, CancellationToken ct)
    {
        if (db.Entry(order).State == EntityState.Detached) db.Orders.Add(order);
        await db.SaveChangesAsync(ct);       // SQL が話される唯一の場所
    }
}
```

メモリのアダプターは、同じインターフェースの後ろに辞書を置いたもので、インフラなしで中核をテストできるようにするものです。場面の第三段階が行う差し替えがこれです。

```csharp
public sealed class InMemoryOrderStore : IOrderStore
{
    private readonly Dictionary<OrderId, Order> _saved = new();

    public Task<Order?> FindAsync(OrderId id, CancellationToken ct) =>
        Task.FromResult(_saved.GetValueOrDefault(id));

    public Task SaveAsync(Order order, CancellationToken ct)
    {
        _saved[order.Id] = order;
        return Task.CompletedTask;
    }
}
```

コンポジションルートは両側の名前を一緒に呼ぶ唯一の場所です。その上のコードはすべてインターフェースを相手に書かれており、そのインターフェースにようやく体が与えられる場所がここです。

```csharp
// Shop.Web の Program.cs
builder.Services.AddDbContext<ShopDbContext>(o => o.UseNpgsql(connectionString));
builder.Services.AddScoped<IOrderStore, EfOrderStore>();   // 駆動される側のアダプター
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<PlaceOrder>();

// 駆動する側のアダプター。HTTP を受けてポートを呼び、それ以外は何もしない。
app.MapPost("/orders", async (PlaceOrderRequest body, PlaceOrder handler, CancellationToken ct) =>
{
    var id = await handler.HandleAsync(body.ToCommand(), ct);
    return Results.Created($"/orders/{id.Value}", new { id = id.Value });
});
```

テストは二つの大きさに分かれ、何百個も書くことになるのは安いほうです。中核のテストは本物のハンドラーをポート越しに動かし、その後ろに偽のアダプターを置き、ほかには何も触りません。

```csharp
[Fact]
public async Task placing_an_order_stores_it()
{
    var store = new InMemoryOrderStore();
    var id = await new PlaceOrder(store, new FixedClock(...)).HandleAsync(command, default);

    Assert.NotNull(await store.FindAsync(id, default));
}
```

もう一つの大きさは `WebApplicationFactory` で本物のホストを起動し、テストに置きたくないアダプターだけを差し替えます。これが成り立つのは、アダプターの交換がドメインから見える何かの変更ではなく、登録一行の変更だからです。

```csharp
public sealed class Harness : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IOrderStore>();
            services.AddSingleton<IOrderStore, InMemoryOrderStore>();
        });
}
```

その最後の差し替えが一行なら、向きは合っています。それが午前中ずっと絡まりをほどく作業になるなら、内側のどこかが決して知ってはならない名前を握っています。
