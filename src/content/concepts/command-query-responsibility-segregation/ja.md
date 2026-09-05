---
title: "CQRS"
summary: "CQRS はデータを変えるモデルと、データについての問いに答えるモデルを分けます。command はルールを通り、query は画面に合わせて用意した形を読みます。ストアまで分けるのは読み取りと書き込みの拡張が本当に別々になるときで、そのときは遅れも一緒に引き受けます。"
category: "アプリケーションアーキテクチャ"
scene: command-query-responsibility-segregation
steps:
  - title: "1 つのモデルですべてを"
    text: "ルールに従うべき書き込みと、JOIN が 3 回必要な読み取りが、同じコード経路と同じデータベースを使います。遅い読み取りが 1 秒以上も層を占めるので、3 件のリクエスト (うち 2 件は command) が満杯の箱の外に立たされ、遅れて戻ってきます。"
  - title: "データはまだ、まずコードを分ける"
    text: "command はルールを実行し、画面いっぱいのデータではなく id を返します。query は画面に合わせて用意した行をビューから読み、そのまま返します。データベースはまだ 1 つですが、どちらも相手を待たなくなり、2 つのメーターはどちらも低いままです。"
  - title: "ストアを分ける"
    text: "書き込みは 1 つのストアに入り、projection が変更のたびにクエリ用の read store へ複製します。読み取りはこれで独立して拡張できます。projection より先に届いた読み取りはまだ古い行を見ますが、正しいふりをせず stale と示されます。"
  - title: "read model は使い捨てにできる"
    text: "形を変え、書き込み側から作り直し、query をそこへ向け直せばよいのです。空のあいだ query は write store を経由する遅い道を回ります。CQRS に Event Sourcing は必須ではなく、読み取りと書き込みが本当に異なるときだけ分けます。"
related:
  - label: Read Model
    slug: read-model
  - label: Projection
    slug: projection
  - label: Event Sourcing
    slug: event-sourcing
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate
    slug: aggregate
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Materialized View
    slug: materialized-view
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Vertical Slice Architecture
    slug: vertical-slice-architecture
references:
  - title: CQRS pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
  - title: Event Sourcing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: Apply simplified CQRS and DDD patterns in a microservice
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
---

## いつ使うか

- 読み取りと書き込みで形が違うとき。書き込み側にはドメインのルールが詰まり、読み取り側には画面の形そのままの平たい行があれば足ります。
- 読み取りが書き込みより桁違いに多いとき、あるいは書き込みモデルに背負わせたくないインデックスや非正規化が読み取り側に必要なとき。
- projection にかかる時間だけ書き込みから遅れた読み取りを許容できるとき。

## 注意点

- まずはデータベース 1 つの上でハンドラーだけを分けます。それだけで得られる見通しのほとんどが手に入り、整合性では何も失いません。ストアを分けるのは、読み取りが独立して拡張される必要があると計測が言ったときだけです。
- ストアを分けると結果整合性がついてきます。画面をそれに合わせて設計してください。command 自身が返した結果を見せる、新しい値をポーリングする、購読する、といった方法があります。書いたばかりのものの id とバージョンを command が返すのはパターン違反ではありません。CQRS が禁じるのは、command が画面向けの形のデータを返すことです。やってはいけないのは、書き込み直後にクエリ側を読み、その答えを確定値として扱うことです。
- projection には監視と再構築の手段が必要です。読み取り側が追いつけているかを教えてくれる指標が遅延 (lag) であり、捨てて作り直せない read model は資産ではなく負債です。
- projection のハンドラーは同じ変更を 2 回以上見ることになります。更新する行をキーにして冪等に書いておけば、再生は何も起こらない処理になり、値が二重に足されることもありません。
- CQRS と Event Sourcing は独立しています。どちらか一方だけでも成立し、前者を選んだから後者も必要だと考えた瞬間に、小さなリファクタリングが全面的な書き直しに変わります。

## .NET では

```csharp
public interface ICommandHandler<in TCommand, TResult> { Task<TResult> HandleAsync(TCommand command, CancellationToken ct); }
public interface IQueryHandler<in TQuery, TResult> { Task<TResult> HandleAsync(TQuery query, CancellationToken ct); }

// 書き込み側です。ルールを通してから永続化します。書いたものの id を返し、
// 画面が描くようなものは何も返しません。
public sealed class PlaceOrderHandler(ShopDbContext db) : ICommandHandler<PlaceOrder, Guid>
{
    public async Task<Guid> HandleAsync(PlaceOrder command, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines);   // ドメインのルールはここに住みます
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return order.Id;
    }
}

// 読み取り側です。ビューか読み取り用テーブルから平たい行を 1 つ取り、追跡もドメインオブジェクトもありません。
public sealed class OrderSummaryHandler(ShopDbContext db) : IQueryHandler<GetOrderSummary, OrderSummary?>
{
    public Task<OrderSummary?> HandleAsync(GetOrderSummary query, CancellationToken ct) =>
        db.OrderSummaries.AsNoTracking()
          .Where(s => s.OrderId == query.OrderId)
          .Select(s => new OrderSummary(s.OrderId, s.CustomerName, s.Total, s.Status))
          .SingleOrDefaultAsync(ct);
}
```

ハンドラーのインターフェイス 2 つと、`Select` でそのまま DTO へプロジェクションするクエリ 1 つが、最初のステップのすべてです。書き込み側は変更追跡も集約も検証もそのまま持ち、読み取り側はドメインオブジェクトを一度も読み込みません。DTO へプロジェクションすれば、追跡すべきエンティティが残らないからです。上の `AsNoTracking()` は費用がかからず習慣にする価値がありますが、それが効くのはエンティティ型をそのまま返す読み取りクエリだけです。

ストアを分けたあとは、`BackgroundService` のプロジェクターが outbox やイベントストリームを読んで read store を更新します。いま適用した変更がどれだけ古いかをメトリクスとして出させれば、遅延は推測ではなくアラートを設定できる数値になります。最初から再生し直すコマンドも用意しておけば、read model の形を変える作業はマイグレーションではなくデプロイになります。
