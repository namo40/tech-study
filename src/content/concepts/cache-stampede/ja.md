---
title: "Cache Stampede"
summary: "キャッシュスタンピードは、人気のキーが期限切れになった瞬間に起きることです。すべてのリクエストが一斉にミスし、同じ値を取りに全員でオリジンへ押し寄せます。対策はどれも 1 つの考えを共有しています。行くのは 1 つだけにする、という考えです。"
category: "キャッシュ"
scene: cache-stampede
steps:
  - title: "熱いキー 1 つ、すべてのリクエストがヒット"
    text: "人気の値がキャッシュに座っていて、すべてのリクエストが近道を通るので、オリジンはほとんど気づきません。その間、TTL リングは静かに減り続けています。"
  - title: "期限切れはスタートの合図です"
    text: "キーが死んだ瞬間、飛んでいたリクエスト全部が同時にミスし、同じ値を取りに全員でオリジンへ押し寄せます。1 時間に 1 回再計算すればよかったオリジンが、今や 7 件を同時に受け止め、全員にとって遅くなります。"
  - title: "リクエストは 1 つだけ行かせ、残りには古い値を出します"
    text: "ミスが出ると single flight がリクエスト 1 つだけをオリジンへ送り、残りは今は古い値を、次は新しい値を受け取ります。stale-while-revalidate はこの取引を明示的にします。一瞬の古さと引き換えに、群衆を一度も見ないオリジンを得ます。"
  - title: "値だけでなく期限を設計します"
    text: "TTL にジッターを与えてキーが一緒に死なないようにし、熱いキーは期限の前に先に更新し、「ない」という答えもしばらくキャッシュして、存在しないキーもスタンピードを起こせないようにします。同じスパイクが来ても、オリジンの針はほとんど動きません。"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Negative Cache
    slug: negative-cache
  - label: Spike Test
    slug: spike-test
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Cache in-memory in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "RFC 5861: HTTP Cache-Control Extensions for Stale Content"
    url: https://www.rfc-editor.org/rfc/rfc5861
---

## いつ使うか

- 高価な計算の前に置かれたキャッシュのうち、いくつかのキーが残りよりずっと熱い場合です。商品ページ、ダッシュボード、レンダリング済みの断片、権限の集合などです。
- 値を 1 つ計算し直す費用が十分に大きく、それを同時に 100 回計算すると痛む場合です。
- 平均ではなく、キャッシュが期限切れになる瞬間のオリジン負荷を見ます。スタンピードは幅が数百ミリ秒のスパイクなので、1 分平均はそれを完全に隠してしまいます。

## 注意点

- キーが一様に分布した負荷テストではスタンピードは見えません。仮想ユーザーごとに違うキーを要求し、キーごとに期限が違うので何も積み上がりません。熱いキーの分布でテストしないと、この問題には本番で初めて出会うことになります。
- single flight にはタイムアウト付きのロックが必要です。オリジンへ行ったその 1 つが落ちたり止まったりすると、後ろで待っていた全員がロックの生きている間ずっと塞がれ、負荷のスパイクが障害に変わります。
- stale-while-revalidate は性能の小技ではなく、結果整合性についての決定です。TTL を決める同じ文で古さの予算も決めます。値は期限を過ぎてから更新の窓の分だけ長く配られる可能性があります。
- ネガティブキャッシュには、ずっと短い専用の TTL が必要です。「ない」を 5 分キャッシュすると、作ったばかりのエントリが 5 分間見えません。
- 合流はプロセス単位です。インスタンス 10 台がそれぞれ自分の呼び出し元だけをまとめるので、複数台にまたがるスタンピードは 1 回ではなく 10 回送ります。たいていは問題ありませんが、測る前に知っておく価値があります。

## .NET では

`HybridCache` は同じキーを同時に要求した呼び出し元を、下側の呼び出し 1 つにまとめます。`IMemoryCache` の周りに自分で書くことになっていた single flight がこれです。

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),
        LocalCacheExpiration = TimeSpan.FromMinutes(2),
    };
});

public sealed class ProductReader(HybridCache cache, ProductRepository repository)
{
    private static readonly Random Jitter = Random.Shared;

    public ValueTask<Product?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync(
            $"product:{id}",
            id,
            async (id, token) => await repository.FindAsync(id, token),
            new HybridCacheEntryOptions
            {
                // 有効期限をばらして、まとめて埋まったものがまとめて切れないようにします。
                Expiration = TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(Jitter.Next(0, 60)),
            },
            cancellationToken: ct);
}
```

API より大事なことが 3 つあります。まず、すべてのエントリの期限にジッターを与えます。同じループで詰めたエントリは、そうしなければ同じミリ秒に期限切れになります。次に、ヒットだけでなくミスも保存します。存在しないキーの照会が毎回データベースへ行く代わりに、自分用の短い TTL でメモリーから答えられます。そして、新しい値を計算している間も古い値を配り続ける必要があるなら、論理的な期限を過ぎてもエントリを生かしておき、裏で更新します。すでに追い出されたエントリに `GetOrCreateAsync` を呼ぶと、呼び出し元が再計算を待つことになり、それこそ避けようとしていた待ちだからです。

```csharp
// ネガティブキャッシュのページが説明する番人です。不在ではなく、1 つの答えです。
public sealed record Cached<T>(T? Value, bool Found);

// エントリのオプションはファクトリーが動く前に決まるので、ファクトリーは見つけた
// ものから有効期限を選べません。答えを保存してから、空のほうを書き直します。
var cached = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (id, token) =>
    {
        var product = await repository.FindAsync(id, token);
        return new Cached<Product>(product, product is not null);
    },
    new HybridCacheEntryOptions { Expiration = TimeSpan.FromMinutes(10) },
    cancellationToken: ct);

if (!cached.Found)
{
    // 「そんな商品はない」も同じキーを取り、寿命だけをずっと短くします。
    await cache.SetAsync(
        $"product:{id}",
        cached,
        new HybridCacheEntryOptions { Expiration = TimeSpan.FromSeconds(30) },
        cancellationToken: ct);
}
```

HTTP の側では、同じ考えが `Cache-Control` の `stale-while-revalidate` として書かれています。共有キャッシュに対して、裏で更新する間は古い写しで答えてよいと伝える指示です。
