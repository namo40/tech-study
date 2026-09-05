---
title: "Entity Framework Core"
summary: "EF Core は .NET の既定の ORM です。LINQ を SQL に翻訳し、読み込んだオブジェクトの何が変わったかを追跡し、更新の文を代わりに書いてくれます。その便利さの代金は、翻訳と追跡を理解することです。"
category: ".NET データアクセス"
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Change Tracking
    slug: change-tracking
  - label: Database Migration
    slug: database-migration
  - label: LINQ
    slug: linq
  - label: Dapper
    slug: dapper
  - label: Compiled Query
    slug: compiled-query
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: EF Core overview
    url: https://learn.microsoft.com/en-us/ef/core/
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

## いつ使うか

- 永続化がテーブルの一覧ではなくドメインのモデルに沿ってほしいときに持ち出します。ナビゲーションプロパティを持つエンティティのおかげで、注文が自分の明細と顧客をオブジェクトとして連れて回り、それと外部キーの間の対応付けは設定になり、業務の規則を表すコードが結合ではなくオブジェクトとして読めます。
- スキーマがそれを必要とするコードと一緒に動くように、マイグレーションを使います。モデルを変えればマイグレーションのファイルができ、そのファイルはレビューされ、コードと一緒にバージョン管理され、ロールアウトの前の一段階として適用されます。「このブランチのスキーマ」という言い方が、データベースの担当者へ尋ねる質問ではなく意味の通る表現になる理由です。
- 作業単位が複数のエンティティにまたがるときは変更の追跡に頼ります。読み込み、オブジェクトを直し、`SaveChangesAsync` を一度呼べば、EF Core が挿入と更新と削除を割り出し、依存の順に並べ、トランザクションで包みます。
- クエリの大半が CRUD と中くらいの結合であるときに選びます。翻訳がうまく引き受けられる範囲がそのあたりで、生産性は実際に手に入るものです。絞り込みもプロジェクションもページングも関連データの読み込みも同じ LINQ の表面から出てきて、型はコンパイルの時点で検査されます。

## 注意点

- N+1 はフレームワークの欠陥ではなく使い方の型で、EF Core のコードでいちばんよくある性能の不具合です。ナビゲーションプロパティに触れるループは行ごとにクエリを一度ずつ走らせ、`Include` やプロジェクションはそれを一度にまとめて要求します。当て推量ではなくクエリのログを読み、クエリの本数をテストが確かめられる値として扱ってください。
- 読み取りの経路が追跡の費用を払う理由はありません。`AsNoTracking` は、変更追跡器が返されたエンティティごとに残すスナップショットを飛ばします。誰も直さない数百行を返す一覧のエンドポイントでいちばん差が出ます。`Select` で DTO へプロジェクションすれば、同じ利得に加えて列も少なく送れます。
- すべての C# の式が SQL になるわけではなく、その境目は正確に知っておく価値があります。`Where` の中の対応していない呼び出しはコンパイルの時点ではなく実行時に例外になりますし、`AsEnumerable` で評価を早く強いる昔の癖は絞り込みをメモリーへ移してしまいます。テーブル全体を回線越しに引き寄せて、その大半を捨てることになります。
- 大量の処理は、オブジェクトを 1 つずつ読み込み、追跡し、書く ORM の性分に逆らいます。`ExecuteUpdateAsync` と `ExecuteDeleteAsync` は何も読み込まずに集合単位の文を 1 つ送りますし、大きな取り込みや重い集計のクエリなら、Dapper や生の SQL が敗北ではなく正直な答えです。

## .NET では

- `Include` とプロジェクションの違いは「オブジェクトをください」と「ちょうどこの列をください」の違いで、何が回線を渡るかと何が追跡されるかの両方を決めます。

```csharp
// Include: エンティティを追跡付きで、全部の列を、往復 1 回の結合で取ります。
var orders = await db.Orders
    .Include(o => o.Lines)
    .Where(o => o.CustomerId == customerId)
    .ToListAsync(ct);

// projection: 応答が必要とする列だけを取り、何も追跡しません。
var summaries = await db.Orders
    .AsNoTracking()
    .Where(o => o.CustomerId == customerId)
    .OrderByDescending(o => o.PlacedAt)
    .Select(o => new OrderSummary(o.Id, o.PlacedAt, o.Lines.Count, o.Total))
    .Take(50)
    .ToListAsync(ct);

// 集合単位の書き込み: UPDATE の文 1 つで、エンティティの読み込みも追跡もありません。
await db.Orders
    .Where(o => o.Status == OrderStatus.Pending && o.PlacedAt < cutoff)
    .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.Expired), ct);
```

- `DbContext` がスコープの寿命であることには理由があります。スレッドセーフではなく、生きている間は追跡するエンティティが溜まり続け、`AddDbContext` はリクエストごとに 1 つ登録して、作業単位ごとにきれいな変更追跡器を渡し、プールから借りた接続を早めに返させます。
- 開発の間は生成される SQL を表示させておいてください。開発の環境で `LogTo` と `EnableSensitiveDataLogging` を一緒に使うと、それぞれの LINQ のクエリが何になったかがそのまま見えます。「このエンドポイントが遅い」が、読めてクエリプランへ持っていける文に変わります。
- コレクションに `Include` を何度も掛けると、行が掛け合わされて直積になります。`AsSplitQuery` は代わりにコレクションごとにクエリを 1 つずつ送り、往復の回数が増える代わりに結果の集合がはるかに小さくなりますし、プロジェクションを使えばその選択そのものがなくなることも多いです。
