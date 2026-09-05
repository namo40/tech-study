---
title: "Cache Invalidation"
summary: "Cache Invalidation は、キャッシュが自分のコピーがもう正しくないと知るための手段です。時間で知らせるか、データが変わったときに削除やメッセージで知らせるか、キーを変えて古いエントリを二度と読まないようにします。"
category: "キャッシュ"
scene: cache-invalidation
steps:
  - title: "時間だけでは"
    text: "TTL しかないと、すべてのインスタンスが期限切れまで古い値を返し続けます。最大で TTL 1 周期ぶん、古いままです。"
  - title: "書き込み時の無効化"
    text: "書き込み側がそのキーの invalidate を配信し、すべてのインスタンスが自分のコピーを捨てます。残る隙間はメッセージが届くまでの時間だけです。"
  - title: "競合"
    text: "読み取りがミスになり、その間に書き込みがすでに空の場所を無効化し、遅い読み取りが古い値を保存します。TTL を短くして自己回復させます。"
  - title: "キーを変える"
    text: "キーにバージョンを入れ、書き込み時に上げます。古いエントリは二度と読まれず、自然に消えます。削除メッセージも競合もありません。"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Tag
    slug: cache-tag
  - label: Cache Version
    slug: cache-version
  - label: Cache Key
    slug: cache-key
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Change Data Capture
    slug: change-data-capture
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: HybridCache
    slug: hybridcache
  - label: Redis
    slug: redis
references:
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
---

## いつ使うか

- データが変わり、読む側が古い値を長く見てはいけない場合
- キャッシュが複数インスタンスのプロセス内にあり、1 か所で消すだけでは足りない場合
- データが変わる瞬間を指し示せる場合。書き込み経路、ドメインイベント、CDC ストリームがその地点です。

## 注意点

- 更新ではなく削除します。書く側から新しい値をキャッシュに入れると、同時に読む側と競合します。
- TTL はつねに最後の砦として残します。無効化メッセージは失われますし、読んでから書く競合はすべての Cache-Aside システムに存在します。
- できればバージョンやタグを含むキーを使います。無効化がキーの変更になれば、競合も配信の広がりもありません。
- 古い値の読み取り (stale read) を計測します。読む側が古いデータをどれだけ見ているかわからなければ、TTL は調整できません。

## .NET では

`HybridCache` は両方の形に対応します。削除側はタグによる無効化、キーを変える側はバージョン付きキーです。

```csharp
// 1. 書き込み時の無効化。キーを削除し、タグを共有するものもまとめて削除します。
public async Task UpdateAsync(User user, CancellationToken ct)
{
    await repository.SaveAsync(user, ct);
    await cache.RemoveAsync($"user:{user.Id}", ct);
    // 狭いタグです。このユーザーが現れる一覧と断片だけで、それより広くはしません。
    await cache.RemoveByTagAsync($"user:{user.Id}", ct);
}

// 2. バージョン付きのキー。バージョンを上げるだけで、削除はしません。
public async ValueTask<Catalog> GetCatalogAsync(CancellationToken ct)
{
    var version = await versions.GetAsync("catalog", ct);
    return await cache.GetOrCreateAsync(
        $"catalog@{version}",
        async token => await catalogRepository.LoadAsync(token),
        new HybridCacheEntryOptions { Expiration = TimeSpan.FromMinutes(10) },
        cancellationToken: ct);
}
```

2 次キャッシュの `IDistributedCache` があれば、ほかのインスタンスの*次のミス*には削除が見えますが、それぞれのプロセス内のコピーは `LocalCacheExpiration` まで生き続けますし、`HybridCache` に組み込みのバックプレーンはありません。削除をそれより速く伝えたいなら、Redis Pub/Sub でキーを自分で配信し、それを受け取った各インスタンスでローカルに `RemoveAsync` を呼びます。どちらにしても `LocalCacheExpiration` を短くして、プロセス内のコピーがその隙間より長く生き残らないようにします。
