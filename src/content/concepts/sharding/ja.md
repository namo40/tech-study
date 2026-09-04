---
title: "Sharding"
summary: "Sharding は一つのデータベースをキーで分けて多数にするやり方です。shard key がすべての行の住む場所を決め、シャードを足せばデータは引っ越し、consistent hashing はその引っ越しを小さく保ちます。だから成長が非常事態ではなく、上限のある予測可能な出来事になります。"
category: "データ分散と一貫性"
scene: sharding
steps:
  - title: "一つのデータベースは、そうでなくなる日までだけ一つです"
    text: "すべてのキーを一つの箱に入れるやり方は、その箱がいっぱいになる日までしか通用しません。データで、書き込みで、障害半径でいっぱいになります。シャーディングは箱をキーで分けます。同じデータモデル、いくつもの小さな家、そしてどのキーがどの家に住むかを知っているルーターです。"
  - title: "shard key はすべての行の住所です"
    text: "同じキーはいつも同じシャードです。その約束があってこそ、キー一つの照会は箱一つだけに触れます。キーを無視したクエリはすべてのシャードへ広がり、全部の代金を払います。ほとんどのクエリがすでに持っているキー、そして均等に広がるキーを選びます。"
  - title: "成長が、ほとんどすべての引っ越しを意味してはいけません"
    text: "hash mod n のもとで三つ目のシャードを足すと、大半のキーで答えが変わります。十二のうち八つが引っ越すことになります。ハッシュリングでは、新しいシャードは自分の近所の区間だけを引き継ぎます。四つだけが引っ越し、八つは家に残ります。地図がほとんど変わらないから、約束がスケールに耐えます。"
  - title: "シャード三つ、地図一つ、騒ぎはありません"
    text: "キーはリングの言う場所に座り、ルーターは要求をまっすぐ家へ送り、負荷はすべての箱に広がります。成長は上限のある予測可能な引っ越しになり、次のシャードも同じ値段でしょう。残る仕事はキーそのものを見張ることです。人気キーは別の問題で、専用のページがあります。"
related:
  - label: Shard Key
    slug: shard-key
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Hot Partition
    slug: hot-partition
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Rebalancing
    slug: rebalancing
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Database Index
    slug: database-index
  - label: Load Balancer
    slug: load-balancer
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
references:
  - title: "Sharding pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: "Data partitioning guidance"
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
  - title: "Partitioning and horizontal scaling in Azure Cosmos DB"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
---

## いつ使うか

- データベース一つがデータを抱えきれず、書き込みを受けきれず、障害半径を閉じ込められなくなり、垂直スケールで買える機械も尽きたときです。シャーディングは、箱一つをこれ以上大きくできなくなった後に取り出す手段です。
- テナントが自然な境界になっているマルチテナントのシステムです。シャードごとにテナント一つ、あるいは小さなテナントをまとめて置けば、隔離がおまけで付いてきます。暴走したテナントは全員の箱ではなく自分の箱を埋めます。
- 単一のプライマリでは受けきれない書き込み中心のワークロードです。読み取りレプリカは読み取りを増やすだけで書き込みには何もしないので、書き込み経路が天井になったら、書き込み経路を割る以外に手は残りません。
- クエリがすでに持ち歩いているキーがあるデータです。ほとんどの要求がどの顧客、どのテナント、どの地域についてのものかを知っているなら、データを分けるキーはもう手の中にあります。
- 最初の手段ではありません。インデックス、キャッシュ、読み取りレプリカ、古い行のアーカイブという安い順に試します。それらはすべて取り消せますが、シャーディングは取り消せません。シャーディング以降に書かれるクエリは、ずっと税を払い続けます。

## 注意点

- shard key は事実上変えられません。変えるにはすべての行の住む場所を書き直すことになります。今日書いているクエリ一つではなく、実際に走らせるクエリ全体を基準に選びます。
- シャードをまたぐ照会とトランザクションが請求書です。キーのない照会はすべてのシャードへ広がる fan-out になり、シャードをまたぐトランザクションは分散コミットか saga になります。よくある経路はシャード一つの中に収まるよう設計し、まれな経路は遅くてよいことにします。
- consistent hashing のない再配置は、成長を大移動に変えます。`hash mod n` のもとではシャードを一つ足した瞬間に大半のキーで答えが変わり、データの大部分が一度に動きます。ハッシュリングや、あらかじめ割っておいた仮想パーティションを割り当て直すやり方は、移動量を足した分に見合う大きさに抑えます。
- キー空間が均等でも負荷が均等とは限りません。キーが完璧に散らばっていても、シャード一つだけが燃えることがあります。あるキーだけが他の千倍読まれるからです。それが hot partition で、シャードをいくら増やしても直りません。
- 運用コストが掛け算になります。バックアップ、スキーマ移行、監視、フェイルオーバー訓練、オンコール手順がすべて N 個になり、全部に触れる作業は最も遅いシャードの速度に合わせられます。
- 自動採番の識別子はもう一意ではありません。シーケンスはシャードごとに別々に回るので、保存される前からすでに一意な識別子を与えます。GUID、ULID、あるいはシャード情報を含んだキーがそれにあたります。

## .NET では

フレームワークが代わりにシャーディングしてくれることはなく、それが正しい形です。ルーティングはデータ層にあるべきもので、その実体はキーを接続文字列へ移す shard map です。

```csharp
// シャードの地図: 接続を決めるのはキーだけです。
public sealed class ShardMap(IReadOnlyList<string> connections)
{
    public int ShardOf(string shardKey)
    {
        // string.GetHashCode() ではなく安定したハッシュを使います。あちらはプロセス
        // ごとにランダム化されるので、再起動すると同じテナントが別のシャードへ
        // 行ってしまいます。XxHash64 は System.IO.Hashing パッケージにあります。
        var hash = XxHash64.HashToUInt64(Encoding.UTF8.GetBytes(shardKey));
        return (int)(hash % (ulong)connections.Count);
    }

    public string ConnectionFor(string shardKey) => connections[ShardOf(shardKey)];

    public IReadOnlyList<string> Connections => connections;
}

// キーを持つ照会はシャード一つに触れます。キーのない照会は全部に触れ、その費用が
// メソッドそのものに現れているので、誰も偶然に fan-out を作りません。
public sealed class OrderQueries(ShardMap map, IDbContextFactory<OrderDbContext> inner)
{
    public async Task<List<Order>> ForTenantAsync(string tenantId, CancellationToken token)
    {
        await using var context = Open(map.ConnectionFor(tenantId));
        return await context.Orders
            .Where(o => o.TenantId == tenantId)
            .ToListAsync(token);
    }

    public async Task<List<Order>> PlacedSinceAsync(DateTimeOffset cutoff, CancellationToken token)
    {
        var pages = await Task.WhenAll(map.Connections.Select(async connection =>
        {
            await using var context = Open(connection);
            return await context.Orders.Where(o => o.PlacedAt > cutoff).ToListAsync(token);
        }));

        return pages.SelectMany(page => page).OrderByDescending(o => o.PlacedAt).ToList();
    }

    // プールは接続文字列ごとに別々に取られます。シャードが N 個なら共用プール一つ
    // ではなくプールが N 個ということなので、大きさは全体ではなくシャード一つを
    // 基準に決めます。
    private OrderDbContext Open(string connection)
    {
        var context = inner.CreateDbContext();
        context.Database.SetConnectionString(connection);
        return context;
    }
}
```

マネージドの選択肢はルーティングをコードの外へ移してくれますが、考えるべきことは変わりません。Azure Cosmos DB はコンテナーごとにパーティションキーを求め、そのキーで代わりに分けてくれるので、設計の仕事はそのキーを選ぶことと、照会を論理パーティション一つの中に収めることになります。Azure SQL Database は弾力性プールと shard map manager を提供します。キーからデータベースへの地図をカタログデータベースに置き、与えられたキーに合う接続を返します。キャッシュ層では同じ発想が一段上に現れます。クライアント側でキャッシュノードに consistent hashing を掛けておけば、ノードを一つ足してもキャッシュ全体ではなく一部だけが無効になります。
