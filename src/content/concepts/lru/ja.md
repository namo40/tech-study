---
title: "LRU"
summary: "LRU は最も長く読者のいなかった項目を追い出します。アクセス履歴をポリシーに変える規則です。最近触れたものを次も欲しがるだろうと仮定し、それ以外は外れた推測に空間を使っていると見なします。"
category: "キャッシュ"
scene: eviction
sceneStep: 2
related:
  - label: Eviction
    slug: eviction
  - label: Cache Key
    slug: cache-key
  - label: Cache-Aside
    slug: cache-aside
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Stampede
    slug: cache-stampede
  - label: Cache Version
    slug: cache-version
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Output Cache
    slug: output-cache
  - label: HybridCache
    slug: hybridcache
references:
  - title: "Cache in-memory in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/memory?view=aspnetcore-10.0
  - title: "MemoryCacheEntryOptions Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.caching.memory.memorycacheentryoptions
  - title: "Caching in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/caching
---

Least Recently Used は、過去で作った未来への賭けです。キャッシュは次に何を尋ねられるかを知りようがないので、手元にある唯一の証拠、つまりどの項目が最近尋ねられたかを使い、最後の読者が最も遠い項目を追い出します。この賭けはたいてい当たります。アクセスの型はふつう固まって来るからです。編集中のページは一分後にまた読まれ、トップに出ている商品は一秒後にまた読まれ、今朝から誰も見ていない行が今になって面白くなることはあまりありません。シーンで、最初の追い出しより先に追い出しのリストが見えているのはこのためです。各キーの下の明るさがそのキーの最後の読み取りなので、列の暗い端は、まだ誰も投げていない問いの答えになっています。

LRU が多くの選択肢の一つではなく既定になった理由は、設定もドメインの知識も要らないことです。競合はどれも何かを要求します。Least Frequently Used は項目ごとのカウンターを要求し、そのうえで古い人気をどう忘れるかを決めなければなりません。決めなければ、先週熱かった項目を永遠に守ってしまいます。FIFO は何も要求しない代わりに読み取りをまったく無視するので、読者が何人いようと熱い項目が予定どおり出ていきます。無作為な追い出しは評判よりずっとよく、費用もほとんどかかりませんが、障害の最中に誰にも説明できません。LRU は、よいふるまいと一文で済む説明が重なる場所にあり、それは妥協ではなく本物の工学的性質です。

よく知られた弱点は走査です。LRU は一度の読み取りを関心の証拠として扱いますが、大きなテーブルをなめる処理はすべての行をちょうど一回ずつ読むので、それらの行が、一日かけてトラフィックが築いた作業集合よりも新しく見えてしまいます。走査は価値あるものをすべて追い出し、二度と読まれない項目でキャッシュを満たし、そして自分自身も追い出します。残るのは、大仕事を終えたばかりなのに誰も欲しがらないものしか持っていないキャッシュです。実際の実装が純粋な LRU のままでいることが少ないのはこのためです。一度しか見ていない項目のための観察区間を置いたり、新しさと並べて頻度を数えたり、アプリケーションが一部の項目を対象外に印を付けられるようにしたりします。夜間のレポートとホットパスが一つのキャッシュを共有しているなら、すでにこの問題を抱えており、直し方はより大きな上限ではなく分離か優先順位です。

正確な LRU は見た目より高くつきもするので、私たちが使うキャッシュのほとんどは近似 LRU にすぎません。厳密な順序を保つには読み取りのたびに共有の構造を更新することになり、キャッシュで最も安い操作であるヒットが、すべてのスレッドが取り合う構造への書き込みになってしまいます。本番のキャッシュは、標本抽出や、位置の代わりに項目あたり一ビットだけを持つ clock や second-chance の方式、あるいは区間に分けた近似でそれを避けます。.NET の `MemoryCache` もこの系統です。圧縮のとき項目のスナップショットを優先順位で、次に最終アクセスで並べ替え、一つずつではなくキャッシュの一定割合をまとめて取り除きます。ですから得られるのは、LRU の精神をまとめ単位で適用した結果です。Redis はキーをいくつか標本に取り、その中で最も古いものを追い出します。どちらも LRU の言葉で考えて差し支えないほど近く、どちらも教科書が選ぶまさにその項目をくれるわけではありません。その違いが問題になるのは、その項目を当てにして何かを組み立てたときだけです。
