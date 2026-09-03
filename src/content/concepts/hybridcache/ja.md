---
title: "HybridCache"
summary: "HybridCache は、ふたつの層をひとつの .NET キャッシュ API で覆ったものです。プロセス内の速い L1 と、任意の共有 L2 をまとめて扱い、スタンピード保護が呼び出しひとつに組み込まれているので、同じキーに対する同時のミスはひとつのファクトリ実行にまとまります。"
category: "キャッシュ"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Eviction
    slug: eviction
  - label: LRU
    slug: lru
  - label: Cache Key
    slug: cache-key
  - label: Redis
    slug: redis
  - label: IDistributedCache
    slug: idistributedcache
  - label: Output Cache
    slug: output-cache
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Caching overview in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/overview?view=aspnetcore-10.0
---

## いつ使うか

- `IMemoryCache` と `IDistributedCache` を自分で組み合わせようとしている場所で持ち出します。その組み合わせはいつも同じ四つの部品です。ローカルを見て、リモートを見て、元を呼び、両方の層に書き戻します。そしてどのコードベースでも、この四つのどれかが微妙に間違っています。HybridCache はその組をサポートされた抽象にしてくれるので、詰め込みの戦略が保守対象から外れます。
- スタンピード保護を自分で作らずに手に入れたいときに使います。同じキーが空のときに殺到した呼び出し元は、それぞれ高価な読み込みを走らせるのではなく、進行中のファクトリ呼び出しひとつに合流します。自分で掛けて正しく仕上げる必要のあったロックの代わりに、`GetOrCreateAsync` の中で処理されます。
- 複数のインスタンスがローカルの速さと共有された答えを同時に必要とするときに使います。L1 はホットパスをメモリの遅延に留め、L2 は起動したばかりのインスタンスや増えたばかりのインスタンスが完全に冷えた状態で到着するのを防ぎます。呼び出し側は、寿命がふたつあり失敗の仕方もふたつある API ではなく、ひとつだけを見ます。
- 複数のチームがキャッシュを使い始めたら、社内のヘルパークラスより向いています。登録の場所がひとつなら、シリアライザーも既定の有効期限もタグの決まりも変える場所がひとつです。三つのサービスがコピーしてそれぞれ手を入れた静的ユーティリティとは違います。

## 注意点

- L1 の項目は、別のインスタンスが値を変えたことを知りません。書き込みや削除は、それを実行したプロセスのローカルキャッシュとその背後の分散層には届きますが、ほかのインスタンスは自分のローカルの写しが期限切れになるまで、すでに持っている値を返し続けます。ローカルの有効期限は、ふたつのインスタンスがずれうる時間を言葉で説明できるくらい短くしておき、削除がブロードキャストだと決めつける前に無効化のページを読んでください。
- タグによる無効化は粗い道具であって購読ではありません。項目のまとまりを一度に落とす手段なので「このテナントに関する全部」には向いていますが、すべてのノードが同じ瞬間に受け取るイベントのように期待するとずれます。
- L2 に渡るものはすべてシリアライズされ、その費用もキャッシュの一部です。ミスのたびに大きなオブジェクトグラフをシリアライズすると、置き換えたはずのクエリより遅くなることがありますし、大きな項目ひとつが共有ストアで小さな項目をいくつも押し出します。たまたま読み込んだ集約ではなく、実際に描画する射影をキャッシュします。
- インスタンスごとに値が多少ずれてよいものだけをキャッシュします。同じ秒にふたつのインスタンスへ届いたふたつのリクエストがまったく同じ値を見なければならないなら、その値はそもそもキャッシュの候補ではありません。答えは TTL を短くすることではなく、記録の原本を読むことです。

## .NET では

- パッケージは `Microsoft.Extensions.Caching.Hybrid` で、API は .NET 9 で入りました。`AddHybridCache` が妥当な既定値でサービスを登録し、`GetOrCreateAsync` の呼び出しひとつが取得とミスの分岐とふたつの書き込みを肩代わりします。

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        // How long the shared L2 copy lives.
        Expiration = TimeSpan.FromMinutes(10),
        // The in-process L1 copy should be the shorter of the two.
        LocalCacheExpiration = TimeSpan.FromMinutes(1),
    };
});

// Concurrent callers for the same key share one factory execution.
var product = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (key, ct) => await repository.GetProductAsync(key, ct),
    cancellationToken: ct);
```

- ふたつめの層を有効にするのは `IDistributedCache` の登録です。ほかに何も登録しなければ、HybridCache はスタンピード保護の付いたインプロセスキャッシュです。`AddHybridCache` の前に `AddStackExchangeRedisCache` を置けば、同じ呼び出し箇所が一行も変えずに共有の L2 を手に入れます。
- ふたつの有効期限は別々のつまみで、別々に決めるものです。`Expiration` は分散側の写しの寿命、`LocalCacheExpiration` はインプロセスの写しの寿命です。ふたつのインスタンスがどれだけ長く違う値を見てよいかを決めるのはローカル側です。
- シリアライズは型ごとに差し替えられます。既定の実装は文字列とバイト配列をそのまま扱い、それ以外は JSON で処理しますが、`AddSerializer` を使えばよく行き来する型だけ安い形式にできて、キャッシュの仕方は変わりません。
