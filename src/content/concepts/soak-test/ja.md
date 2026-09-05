---
title: "Soak Test"
summary: "Soak Test はシステムが扱える負荷を何時間も維持し、時間が経ってはじめて現れる不具合を探します。リーク、ドリフト、そして増える一方で戻ってこないものすべてが対象です。"
category: "テストと検証"
scene: load-test
sceneStep: 3
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Garbage Collection
    slug: garbage-collection
  - label: Connection Lifetime
    slug: connection-lifetime
references:
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: Debug a memory leak in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-memory-leak
---

Soak Test はわざと退屈です。サービスが扱えるとすでに示された負荷を選びます。ふつうは Capacity Test が見つけた持続可能なスループットです。そして数分ではなく数時間維持します。劇的なことは何も起きないはずで、それこそが要点です。探しているのは、10 分の実行では作り出せない遅い種類の不具合だからです。

手がかりは水準ではなく傾向です。ワーキングセット、gen 2 ヒープサイズ、開いている接続数、スレッド数、ハンドル数を経過時間に対して描き、何時間にもわたって着実に上がり続けて下がらないものがあれば、それが結果です。レイテンシの数値がすべて平らだったとしても同じです。1 リクエストあたり数十バイトのリークは最初の 100 万件までは見えず、1000 万件目で致命的になります。返されない接続、上限のないキャッシュ、誰も回さないログファイルも同じです。

実行中は何も再起動せず、最後の 1 時間を目標ではなく最初の 1 時間と比べます。グラフが曲がり始めた瞬間に終わる soak は、与えられた問いに答えられるだけ長く走っていません。すべてのグラフが平らなまま終わった soak は記録しておく価値があります。次の劣化をひと目で分からせてくれるのが、まさにその記録だからです。
