---
title: "Workstation GC"
summary: "Workstation GC はヒープを 1 つ持ち、場所が足りなくなったそのスレッド自身が回収します。プロセスは小さくなり、停止はごく普通のものになります。サイドカーやツール、多数のプロセスを走らせるノードのように、プロセスごとにコア数ぶんのヒープを取ることが誰も使わないメモリーになる場所に向いています。"
category: "パフォーマンスと最適化"
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Server GC
    slug: server-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Request
    slug: resource-request
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

Workstation GC は素朴な構成です。ヒープ 1 つ、gen0 予算 1 つ、コアごとのコレクタースレッドはありません。ブロッキングの回収は場所が足りなくなったスレッド自身が行い、そのスレッドはそのまま続きを進めます。ここでも既定で有効なバックグラウンド gen2 は、代わりに専用スレッド 1 本で走ります。どちらにせよ作業を分ける並列性はないので、同じ大きさの生存集合を回収しても実時間では Server GC より長くかかります。そして、サービスの傍らで動くもののほとんどにとって、その差はまったく問題になりません。

代わりに得られるのは小ささで、それは条件なしに得られます。ヒープが 1 つなら gen0 予算も 1 つで決して倍々にならないので、プロセスは最初の回収により早く到達し、定常状態のヒープもより小さいところに落ち着きます。小さなプロセスが 20 個動くノードでは、その差がそのままメモリーの請求額になります。毎秒数件を中継するサイドカー、マイグレーションツール、作業集合の小さいキューコンシューマー、そして CPU の一部しか受け取らないものはすべて、何分の一かの大きさのヒープを少し頻繁に回収するほうが向いています。

プロセスが CPU を占有できないときにも、こちらのほうが安全な既定です。ただし、よく挙げられる場面ではありません。半コアの上限は論理 CPU 1 つに切り上げられ、論理 CPU が 1 つならランタイムは設定が何と言っていようと Workstation GC を使うので、決めることは何もありません。競合が起きるのは、大きなノードに小さな上限を置いた場合です。Server GC は切り上げた上限から、あるいは上限なしで CPU request だけを設定したならノードの全コアから、ヒープとスレッドの数を決め、そのコレクタースレッドがリクエストスレッドと同じ割り当て分を奪い合います。そうなる場所では Workstation GC が競合をまるごと取り除き、`GCHeapCount` を固定するのが両者の中間の道です。

```xml
<!-- サイドカーやツール: ヒープは 1 つ、それでもバックグラウンドで回収する。 -->
<PropertyGroup>
  <ServerGarbageCollection>false</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# 同じ選択を環境変数で書いたもの。
DOTNET_gcServer=0
DOTNET_gcConcurrent=1
dotnet-counters monitor --process-id <pid> --counters System.Runtime
# Server GC と比べる: .NET 9 以降は dotnet.gc.last_collection.heap.size と dotnet.gc.pause.time、
# .NET 8 以前は gc-heap-size と time-in-gc。
```

何が変わらないかも見ておいてください。世代、昇格、large object heap、85,000 バイトのしきい値、コンテナーのメモリー上限から導かれるヒープのハードリミットは、どれもまったく同じように働きます。変わるのはヒープの数と、誰が回収を実行するかだけです。Server GC で効いた割り当て削減の手法はここでも同じように効きますし、コレクターのモードに手を伸ばすのは相変わらず最初の一手ではなく最後の一手です。

2 つのどちらにするかは、実際に使うデプロイの形で負荷テストを行って決め、ヒープサイズ、GC に費やした時間、p99 を並べて比べます。Workstation GC ならメモリー上限の下に余裕で収まるのに Server GC では OOM で殺されるポッドは、どちらを望んでいるかを既に語っていますし、回収を 4 つのヒープに分けたら p99 が半分になったサービスも同じです。
