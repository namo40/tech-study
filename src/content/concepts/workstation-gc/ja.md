---
title: "Workstation GC"
summary: "Workstation GC はヒープを 1 つ持ち、場所が足りなくなったそのスレッド自身が回収します。プロセスは小さくなり、停止はごく普通のものになります。サイドカーやツール、多数のプロセスを走らせるノードのように、プロセスごとにコア数ぶんのヒープを取ることが誰も使わないメモリになる場所に向いています。"
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

Workstation GC は素朴な構成です。ヒープ 1 つ、gen0 予算 1 つ、専用のコレクタースレッドはなし。あるスレッドが割り当てられなくなると、そのスレッド自身が回収を行い、そのまま続きを進めます。作業を分ける並列性がないので、同じ大きさの生存集合を回収しても実時間では Server GC より長くかかります。そして、サービスの傍らで動くもののほとんどにとって、その差はまったく問題になりません。

代わりに得られるのは小ささです。ヒープが 1 つなら予算もコアごとではなく 1 つだけなので、プロセスは最初の回収により早く到達し、定常状態のヒープもより小さいところに落ち着きます。小さなプロセスが 20 個動くノードでは、その差がそのままメモリの請求額になります。毎秒数件を中継するサイドカー、マイグレーションツール、作業集合の小さいキューコンシューマー、そして CPU の一部しか受け取らないものはすべて、何分の一かの大きさのヒープを少し頻繁に回収するほうが向いています。

プロセスが CPU を占有できないときにも、こちらのほうが安全な既定です。Server GC はコレクタースレッドを走らせるコアがある前提でそれらを起動します。半コアに制限されたコンテナーでもスレッドは起動し、プロセスが実際に持っている時間をめぐってリクエストスレッドと競合します。厳しい CPU 上限のもとで動かす必要があり、Server GC が競合しているなら、Workstation GC はその競合をまるごと取り除きます。`GCHeapCount` を固定するのが両者の中間の道です。

```xml
<!-- A sidecar or a tool: one heap, and still collect in the background. -->
<PropertyGroup>
  <ServerGarbageCollection>false</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# The same choice as environment variables.
DOTNET_gcServer=0
DOTNET_gcConcurrent=1
dotnet-counters monitor --process-id <pid> System.Runtime   # compare gc-heap-size and time-in-gc against Server GC
```

何が変わらないかも見ておいてください。世代、昇格、large object heap、85,000 バイトのしきい値、コンテナーのメモリ上限から導かれるヒープのハードリミットは、どれもまったく同じように働きます。変わるのはヒープの数と、誰が回収を実行するかだけです。Server GC で効いた割り当て削減の手法はここでも同じように効きますし、コレクターのモードに手を伸ばすのは相変わらず最初の一手ではなく最後の一手です。

2 つのどちらにするかは、実際に使うデプロイの形で負荷テストを行って決め、`gc-heap-size`、`time-in-gc`、p99 を並べて比べます。Workstation GC ならメモリ上限の下に余裕で収まるのに Server GC では OOM で殺されるポッドは、どちらを望んでいるかを既に語っていますし、回収を 4 つのヒープに分けたら p99 が半分になったサービスも同じです。
