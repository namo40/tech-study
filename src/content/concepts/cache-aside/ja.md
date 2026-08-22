---
title: "Cache-Aside"
summary: "Cache-Aside はキャッシュをアプリケーション自身が管理する方式です。まずキャッシュを読み、miss ならデータベースまで下りてその結果をキャッシュに保存し、データが変わったらエントリを無効化します。"
category: "キャッシュ"
scene: cache-aside
steps:
  - title: "Miss"
    text: "キャッシュが空なので、アプリケーションはデータベースを読み、戻る途中でその結果をキャッシュに保存します。"
  - title: "Hit"
    text: "以降の読み取りはキャッシュからそのまま返ります。データベースが読まれたのは 5 回ではなく 1 回です。"
  - title: "TTL"
    text: "エントリは期限切れになります。次の読み取りが miss になってキャッシュを埋め直すので、古い値が TTL より長く生き残ることはありません。"
  - title: "書き込み"
    text: "データベースだけを更新する書き込みは、キャッシュを古いままにします。書き込み時にエントリを無効化すれば、次の読み取りが新しい値で埋め直します。"
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: TTL
    slug: ttl
  - label: Read-Through
    slug: read-through
  - label: Write-Through
    slug: write-through
  - label: Write-Behind
    slug: write-behind
  - label: Cache Stampede
    slug: cache-stampede
  - label: Stale-While-Revalidate
    slug: stale-while-revalidate
  - label: Negative Cache
    slug: negative-cache
  - label: HybridCache
    slug: hybridcache
  - label: IDistributedCache
    slug: idistributedcache
  - label: Redis
    slug: redis
references:
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## いつ使うか

- 読み取りが書き込みよりはるかに多く、同じキーを繰り返し読む場合
- TTL の長さのあいだは少し古い値でも構わない場合
- 元のデータストアがキャッシュより大幅に遅い、あるいは高くつく場合

## 注意点

- 書き込み時は無効化します。書く側から新しい値をキャッシュに入れてはいけません。2 つの書き込みが競合すると、より古い値が新しい TTL を持ってキャッシュに残ることがあります。
- 無効化する場合でも、すべてのエントリに TTL を設定します。取りこぼした無効化を受け止める安全網です。
- Cache-Aside 自体は stampede を防ぎません。人気のあるキーが期限切れになると多くの読み取りが一斉に miss するので、リクエストの合流や Stale-While-Revalidate と組み合わせます。
- 存在しない値も短時間キャッシュします。そうしないと、ないキーを探す問い合わせがそのままデータベースまで届きます。

## .NET では

`HybridCache` を使います。読み取りは `GetOrCreateAsync` で行い、書き込みのあとは `RemoveAsync` を呼びます。

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(5),
        LocalCacheExpiration = TimeSpan.FromMinutes(1),
    };
});

public sealed class UserReader(HybridCache cache, UserRepository repository)
{
    public ValueTask<User?> GetAsync(int id, CancellationToken ct) =>
        cache.GetOrCreateAsync(
            $"user:{id}",
            async token => await repository.FindAsync(id, token),
            cancellationToken: ct);

    public async Task UpdateAsync(User user, CancellationToken ct)
    {
        await repository.SaveAsync(user, ct);
        await cache.RemoveAsync($"user:{user.Id}", ct);
    }
}
```

`HybridCache` は同じキーに同時に起きた miss を 1 回の呼び出しにまとめてくれます。自分で書くことになっていた stampede 対策を代わりに担ってくれる形です。`IDistributedCache` が登録されていればそれが 2 次キャッシュになり、Redis のような共有キャッシュがプロセス内のキャッシュの後ろに置かれます。
