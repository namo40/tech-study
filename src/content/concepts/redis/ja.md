---
title: "Redis"
summary: "Redis は、インスタンスたちが一緒に使うインメモリのデータ構造サーバーです。文字列やハッシュ、ソート済みセット、ストリームを抱えた速いプロセスがひとつあることが、分散キャッシュやセッションストア、レート制限のカウンター、分散ロック、軽量なキューの答えになる理由です。"
category: "キャッシュ"
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Lock
    slug: distributed-lock
  - label: Eviction
    slug: eviction
  - label: HybridCache
    slug: hybridcache
  - label: Session State
    slug: session-state
  - label: IDistributedCache
    slug: idistributedcache
references:
  - title: Redis Docs
    url: https://redis.io/docs/latest/
  - title: Distributed caching in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0
  - title: StackExchange.Redis
    url: https://seredis.dev/
---

## いつ使うか

- キャッシュがプロセスごとではなく共有される必要があるときに持ち出します。インメモリのキャッシュはインスタンスの数だけ掛け算になります。レプリカ十台は写しを十個抱え、十回温め、それぞれ別に期限切れになります。`IDistributedCache` の背後の Redis ひとつなら、どのレプリカも同じ項目を見ますし、HybridCache を登録したときに昇格する L2 もこれです。
- セッション状態をアプリケーションのプロセスの外に出したいときに使います。セッションが Redis にあれば、どのインスタンスもどのリクエストも扱えます。だからスティッキーセッションを外せますし、カートを捨てずに縮小でき、誰もログアウトさせずにポッドを再起動できます。
- ほかに置き場所がないとき、協調のための部品をここに置きます。分散ロックもレート制限のカウンターも重複防止の記録も、すべてのインスタンスが同意するひとつの場所を必要とします。コマンドが単一スレッドで原子的に処理されるので、増やして比べる形を正しく作るのが容易です。
- ブローカーでは大げさなときの軽いメッセージングとして使います。pub/sub は投げて忘れるファンアウトで、ストリームはコンシューマーグループと確認応答を足してくれます。どちらも役に立ちますが、耐久性が要件ならどちらもブローカーの代わりにはなりません。

## 注意点

- メモリーが予算であり、退避の方針は自分たちが下す決定です。`maxmemory` と方針がなければ、インスタンスはホストが音を上げるまで太りますし、あればどの項目から出ていくかを自分たちが選んだことになります。`allkeys-lru` はキャッシュらしく振る舞い、`noeviction` は満杯のインスタンスを書き込みエラーに変えます。この違いは、作業集合が箱を超えた日にいちばん大きく効きます。
- 既定の立ち位置はキャッシュであって、記録の原本ではありません。永続化は RDB のスナップショットと AOF として存在し、それぞれ耐久性の答えが違います。スナップショットは最後の書き込みからの数分を失いえますし、追記型のログはスループットを削ります。障害をまたいで残らなければならないデータはデータベースにあるべきで、Redis は写しを持つ側です。
- ホットキーと大きなキーは負荷を一箇所に集めます。すべてのリクエストが読むキーひとつは、シャードをいくら増やしてもトラフィックを一台に固定しますし、数メガバイトの値は転送のあいだ接続をふさぎます。値を分けるか、キー空間を狭めるか、熱い項目を Redis の手前でローカルにキャッシュします。
- コマンドの実行が単一スレッドなので、O(N) のコマンドひとつが全員を止めます。`KEYS` や大きな `SMEMBERS`、広い範囲のスキャンは、終わるまで走るあいだほかのすべてのクライアントを待たせます。デバッグの習慣ひとつが本番障害になる場所です。走査には `SCAN` を使い、コレクションの大きさは抑えておきます。

## .NET では

- `ConnectionMultiplexer` は作るのが高価で、共有するように設計されています。アプリケーションにひとつをシングルトンとして登録し、プロセスの寿命のあいだ使い回します。少ない数の接続の上にすべてのコマンドを多重化するので、操作ごとに作るのがソケットを枯渇させる典型的なやり方です。
- キャッシュ用途なら、分散キャッシュの実装を登録してあとは抽象に任せます。

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("redis");
    options.InstanceName = "checkout:";
});

// Registered after the distributed cache, HybridCache picks it up as L2.
builder.Services.AddHybridCache();
```

- セッションとデータ保護の保管先も同じやり方で付きます。`AddStackExchangeRedisCache` に `AddSession` を足せばセッション状態がインスタンスの外に出ますし、同じ接続がデータ保護のキーリングを持つこともできます。スケールアウトしたアプリケーションが二番目に共有する必要があるのは、たいていこれです。
- マネージドのサービスは運用の話を変えるだけで、API は変えません。Azure Managed Redis はパッチ適用とフェイルオーバーと TLS を引き受けるので、アプリケーションは同じクライアントで同じプロトコルをそのまま話します。仕事が移るのはサイズの見積もりと退避の方針、そして永続化が本当に要るかを決めるほうです。
