---
title: "IDistributedCache"
summary: "IDistributedCache はプロセス間で共有するキャッシュに対する ASP.NET Core の抽象です。文字列キーの上の 4 つの操作で、値は byte[] です。シリアライズは呼ぶ側の仕事であり、その裏にどの実装が入るかは呼び出し地点ではなく起動時に決まります。"
category: "キャッシュ"
scene: cache-aside
sceneStep: 1
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: HybridCache
    slug: hybridcache
  - label: Redis
    slug: redis
  - label: Cache Key
    slug: cache-key
  - label: TTL
    slug: ttl
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Distributed caching in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0
---

シーンの最初のステップで、アプリケーションはミスに当たってデータベースを読み、戻る途中でその結果をキャッシュに保存します。ASP.NET Core でその「キャッシュ」が指すインターフェイスが `IDistributedCache` であり、意図して小さく作られています。文字列キーの上の get、set、refresh、remove と、それぞれの非同期版がすべてです。依存性注入から受け取って使い、呼び出し地点で実装の名前を口にすることはありません。

```csharp
byte[]? cached = await cache.GetAsync(key, ct);
if (cached is not null) return JsonSerializer.Deserialize<Order>(cached);

Order order = await db.LoadOrderAsync(id, ct);
var options = new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5),
};
await cache.SetAsync(key, JsonSerializer.SerializeToUtf8Bytes(order), options, ct);
```

値の型が `byte[]` なのは抜けているのではなく、それ自体が契約です。シリアライズが呼ぶ側の仕事なのは、そのバイト列が共有されるからです。別のプロセスが読み、ローリングデプロイのあとには自分のコードの別のバージョンも読みます。そのため形式を決める作業は、通信規約を決めるのと同じ規則に従う互換性の判断になります。省略可能なフィールドを足すのはたいてい安全で、フィールドの型を変えるのは安全ではなく、形を変えるデプロイには新しいキーの接頭辞か全消去のどちらかが要ります。あいだで形式を移してくれる者がいないからです。`GetString` と `SetString` の拡張メソッドは同じ契約の上に載せた UTF-8 の便利機能であって、別の契約ではありません。

実装は呼び出し側のコードを 1 行も触らずに下で入れ替わります。`AddDistributedMemoryCache`、`AddStackExchangeRedisCache`、SQL Server の実装、そして同じ 4 つの操作を出すベンダーのパッケージがあります。メモリーの実装には繰り返す価値のある注意が付きます。1 つのプロセスの中でインターフェイスを満たすだけで、まったく分散していません。インスタンスごとに自分の写しを持つので、あるインスタンスが無効化したエントリが残りの 4 台では生きたままです。テストには正しい選択で、本番では不具合です。期限は `DistributedCacheEntryOptions` でエントリごとに決め、絶対の時刻として与えるか、いまからの長さとして与えるか、誰かがエントリを読むか `Refresh` を呼んだときだけ伸びるスライディングの区間として与えます。

このインターフェイスが与えないものも、与えるものと同じくらい大事です。複数のキーをまとめて取る操作がなく、まとめて無効化するタグや領域がなく、原子的な加算がなく、スタンピードを防ぐ仕組みもありません。だから同時に起きたミスは 2 つともデータベースを読み、2 つとも同じ値を書きます。プロセス内の層もないので、同じインスタンスが 1 ミリ秒前に尋ねたキーでも、ヒットのたびにネットワークの往復と逆シリアライズがかかります。.NET 9 の `HybridCache` は、まさにこの隙間のために入りました。`IDistributedCache` を L2 に置き、その手前にプロセス内の L1 を立て、シリアライズを引き受け、同じキーへの同時のミスを 1 つにまとめます。生の意味づけが必要なときや、その下に何かを実装する場面ではこのインターフェイスを直接使い、ほしかったものが丁寧に作られた cache-aside だったなら HybridCache を取りましょう。
