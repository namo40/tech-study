---
title: "HybridCache"
summary: "HybridCache は、2 つの層を 1 つの .NET キャッシュ API で覆ったものです。プロセス内の速い L1 と、任意の共有 L2 をまとめて扱い、スタンピード保護が呼び出し 1 つに組み込まれているので、同じキーに対する同時のミスは 1 つのファクトリー実行にまとまります。"
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

- `IMemoryCache` と `IDistributedCache` を自分で組み合わせようとしている場所で持ち出します。その組み合わせはいつも同じ 4 つの部品です。ローカルを見て、リモートを見て、元を呼び、両方の層に書き戻します。そしてどのコードベースでも、この 4 つのどれかが微妙に間違っています。HybridCache はその組をサポートされた抽象にしてくれるので、キャッシュを埋める戦略が保守対象から外れます。
- スタンピード保護を自分で作らずに手に入れたいときに使います。同じキーが空のときに一斉に来た呼び出し元は、それぞれ高価な読み込みを走らせるのではなく、進行中のファクトリー呼び出し 1 つに合流します。自分で掛けて正しく仕上げる必要のあったロックの代わりに、`GetOrCreateAsync` の中で処理されます。
- 複数のインスタンスがローカルの速さと共有された答えを同時に必要とするときに使います。L1 はホットパスをメモリーのレイテンシに留め、L2 は起動したばかりのインスタンスや増えたばかりのインスタンスが完全に冷えた状態で到着するのを防ぎます。呼び出し側は、寿命が 2 つあり失敗の仕方も 2 つある API ではなく、1 つだけを見ます。
- 複数のチームがキャッシュを使い始めたら、社内のヘルパークラスより向いています。登録の場所が 1 つなら、シリアライザーも既定の有効期限もタグの決まりも変える場所が 1 つです。3 つのサービスがコピーしてそれぞれ手を入れた静的ユーティリティとは違います。

## 注意点

- L1 のエントリは、別のインスタンスが値を変えたことを知りません。書き込みや削除は、それを実行したプロセスのローカルキャッシュとその背後の分散層には届きますが、ほかのインスタンスは自分のローカルの写しが期限切れになるまで、すでに持っている値を返し続けます。ローカルの有効期限は、2 つのインスタンスがずれうる時間を言葉で説明できるくらい短くしておき、削除がブロードキャストだと決めつける前に無効化のページを読んでください。
- タグによる無効化は論理的なもので、購読ではなく粗い道具です。`RemoveByTagAsync` はそのタグの締め切り時刻を記録し、あとの読み取りはそれより古いものをミスとして扱います。L1 からも L2 からも何も削除されないので、メモリーはそれらのエントリが自分で期限切れになるまで回収されません。「このテナントに関する全部」には正しい道具ですが、すべてのノードが同じ瞬間に受け取るイベントのように期待するとずれます。
- L2 に渡るものはすべてシリアライズされ、その費用もキャッシュの一部です。ミスのたびに大きなオブジェクトグラフをシリアライズすると、置き換えたはずのクエリより遅くなることがありますし、大きなエントリ 1 つが共有ストアで小さなエントリをいくつも押し出します。たまたま読み込んだ集約ではなく、実際に描画するプロジェクションをキャッシュします。大きさには硬い縁もあります。`MaximumPayloadBytes` (既定で 1 MB) を超える値はキャッシュされずにログに記録されて飛ばされ、「なぜこのキーは一度もヒットしないのか」のたいていの答えがこれです。
- インスタンスごとに値が多少ずれてよいものだけをキャッシュします。同じ秒に 2 つのインスタンスへ届いた 2 つのリクエストがまったく同じ値を見なければならないなら、その値はそもそもキャッシュの候補ではありません。答えは TTL を短くすることではなく、記録の原本を読むことです。

## .NET では

- パッケージは `Microsoft.Extensions.Caching.Hybrid` です。.NET 9 と同時に出荷され、.NET 8 と .NET Framework 4.7.2 でも動くので、LTS のサービスが締め出されることはありません。`AddHybridCache` が妥当な既定値でサービスを登録し、`GetOrCreateAsync` の呼び出し 1 つが取得とミスの分岐と 2 つの書き込みを肩代わりします。

```csharp
builder.Services.AddHybridCache(options =>
{
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        // 共有される L2 の写しが生きる長さ。
        Expiration = TimeSpan.FromMinutes(10),
        // プロセス内の L1 の写しは、2 つのうち短いほうにします。
        LocalCacheExpiration = TimeSpan.FromMinutes(1),
    };
});

// 同じキーに同時に来た呼び出し元は、1 回のファクトリー実行を共有します。
var product = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (id, token) => await repository.GetProductAsync(id, token),
    cancellationToken: ct);
```

- 2 つめの層を有効にするのは `IDistributedCache` の登録です。ほかに何も登録しなければ、HybridCache はスタンピード保護の付いたインプロセスキャッシュです。`IDistributedCache` の実装を、たとえば `AddStackExchangeRedisCache` を、順序を問わず登録すれば、同じ呼び出し箇所が 1 行も変えずに共有の L2 を手に入れます。
- 2 つの有効期限は別々のつまみで、別々に決めるものです。`Expiration` は分散側の写しの寿命、`LocalCacheExpiration` はインプロセスの写しの寿命です。2 つのインスタンスがどれだけ長く違う値を見てよいかを決めるのはローカル側です。
- シリアライズは型ごとに差し替えられます。既定の実装は文字列とバイト配列をそのまま扱い、それ以外は JSON で処理しますが、`AddSerializer` を使えばよく行き来する型だけ安い形式にできて、キャッシュの仕方は変わりません。
