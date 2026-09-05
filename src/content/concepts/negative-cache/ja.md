---
title: "Negative Cache"
summary: "ネガティブキャッシュは、中身のある答えだけでなく「ここには何もない」という答えも保存します。そのため、存在しないキーへの照会が大量に届いても、毎回データベースまで行く代わりにメモリーから答えられます。"
category: "キャッシュ"
scene: cache-stampede
sceneStep: 4
related:
  - label: Cache Stampede
    slug: cache-stampede
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
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Spike Test
    slug: spike-test
  - label: Rate Limiter
    slug: rate-limiter
  - label: Distributed Lock
    slug: distributed-lock
references:
  - title: Cache in-memory in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: MemoryCacheEntryOptions Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
---

シーンの最後のステップは、そもそも存在しなかったキーへリクエストの一群を送ります。これを見せる価値があるのは、普通のキャッシュにはこれに対する守りがまったくないからです。キャッシュは見つけたものを保存します。何も見つからなかった照会は何も保存しないので、同じ無いキーへの次の照会もキャッシュから何も見つけられず、やはりデータベースへ行き、やはり空で帰ってきます。存在しないキーへのリクエストは、呼ぶ側が送りたいだけの速さで、永遠に確定したミスです。「ない」という答えをキャッシュすることだけがこれを閉じられて、シーンではヒットが受けるのと同じ反射として現れます。

これは聞こえるほど珍しい話ではありません。無いキーは想像よりずっと頻繁にまとまって届くからです。URL の中の識別子は順に数えられるので、`/products/1` から上へ歩くスキャナは空きを何千と続けて叩きます。404 を最終的な答えとして扱わない再試行ループを持つクライアントは、誰かが止めるまで同じ無いものを要求し続けます。片方のシステムで null の結合キーをもう片方で照会すれば、何でもないものへの照会が細く流れ続けます。そして削除された項目は、まだそれを指しているすべてのページから何か月も要求され続けることがあります。4 つとも、データベースは考えうる限り最も安い問いに何千回も答えていて、その答えは決して変わりません。

ネガティブキャッシュを安全にする規則は 1 つです。隣にある肯定側のエントリよりずっと短い寿命を与えます。古いネガティブの代償は間違った数字ではなく、見えないことです。作られたばかりの項目が、ネガティブなエントリの期限が切れるまで全員にとって無いままになります。商品を 10 分、「ない」を 30 秒でキャッシュすれば、守りはほぼ手に入れつつ、作成から見えるまでの窓は誰も不具合として届け出ない程度に短く保てます。書き込み経路で作成時に無効化できるならそれも併せてやれば窓は完全に閉じますが、短い TTL はそれでも残しておきます。取りこぼした無効化を受け止める安全網だからです。

表現に関する落とし穴が 1 つあり、素朴に実装すると静かに何もしなくなる理由がこれです。無いキーに `null` を保存すると、キャッシュは「まだ照会していない」と「照会したが何も無かった」を区別できません。どちらも `null` として読み戻されるからです。`IMemoryCache` と `HybridCache` はその `null` を平気で保存するので、この曖昧さは机上の話ではありません。`Get<T>` や `GetOrCreateAsync` の読み取りはどちらの場合も `null` を返し、違いを見分けられるのは `TryGetValue` の形をした読み取りだけです。`IDistributedCache` は逆の方向に失敗し、null のペイロードをそのまま拒むので、ネガティブなエントリは決して書かれません。代わりに目印を保存します。`record Cached<T>(T? Value, bool Found)` のような包みでも、よく知られた空のインスタンスでも構いません。何を使うにせよ、読み取り経路が不在ではなく確定した答えとして見分けられるものでなければなりません。

最後に限りを付けるべきものはメモリーです。ネガティブキャッシュは、キーを呼び出す側が選ぶキャッシュであり、それこそ攻撃者が望む形です。存在しない相異なる識別子を 100 万個送り、決して存在しないものたちのエントリでキャッシュが埋まっていくのを眺めればよいのです。ネガティブエントリに専用の大きさの制限を与えるか、`SizeLimit` を設定した別のキャッシュインスタンスに入れて、それらが追い出されるときに本来守るはずだった本物の値まで押し出せないようにします。キー空間が巨大で、ミスが偶然ではなく悪意による場所では、次の一手はたいていキャッシュの前に置く所属判定フィルターです。定数メモリーで「確実に無い」を答え、残りはすべて通常の経路へ流します。
