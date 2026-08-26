---
title: "Server GC"
summary: "Server GC はプロセスにコアごとのヒープ 1 つとコレクタースレッド 1 つを与え、それらを並列に回収します。メモリ使用量が大きくなる代わりに、回収が生む停止が短くなります。ASP.NET Core の既定であり、コンテナーでもっとも頻繁に間違ったまま残される設定でもあります。"
category: "パフォーマンスと最適化"
scene: garbage-collection
sceneStep: 4
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
  - label: Load Test
    slug: load-test
references:
  - title: Workstation and server garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/workstation-server-gc
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

回収はヒープを書き換えているスレッドを止める必要があるので、停止を短くする方法は、歩く作業を複数のスレッドに分けることです。Server GC はまさにそれを行います。ヒープを 1 つ持つ代わりにコアごとに 1 つ持ち、それぞれが自分の割り当て予算と専用のコレクタースレッドを備え、回収はそれらを一斉に走らせます。実時間で見た停止はおおよそ全体の作業をヒープ数で割った値になり、毎秒多くのリクエストを扱うサービスがこの方式を欲しがる理由がここにあります。

代価はメモリ使用量です。ヒープごとに自分の gen0 予算があるので、いずれかの回収が起きるまでにプロセスが割り当てる量はヒープ数だけ掛け算され、定常状態のヒープもそのぶん大きくなります。これは意図した取引です。停止時間を買うためにメモリを使うのであり、自分のマシンや自分のコンテナーを丸ごと使うサービスには正しい取引です。サイドカーや CLI ツール、小さなプロセスを何十も詰め込んだノードでは正しくありません。そうした場所では、プロセスごとにコア数ぶんのヒープを主張することが、誰も使っていないメモリとして積み上がります。

コンテナーではこの半分を間違えたまま置きやすくなります。ランタイムは自分から見える CPU 数でヒープ数を決めますが、コアの端数として表した CPU 上限は、コンテナーランタイムが別途制限しないかぎり、プロセスにノードの全コアを見せたままにします。その結果、それらを走らせる CPU 時間よりずっと多くのヒープを持つプロセスができ、ヒープはそれぞれ自分の予算を抱えます。コンテナーの CPU とメモリの上限を設定し、プロセスが実際に何を見ているかを確認し、それでもヒープ数が合わないなら自分で固定してください。

```xml
<!-- The default for a web project; written down so the choice is visible. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# Same switches as environment variables, which is how a container usually sets them.
DOTNET_gcServer=1
DOTNET_GCHeapCount=0x2         # two heaps, hex; only with a measurement that says so
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
```

同時回収 (バックグラウンド回収) は別のスイッチで、既定では有効です。gen2 回収の大半をアプリケーションスレッドと並んで走らせるので、そのままなら長い停止 1 回だった完全な回収が、短い停止 2 回とそのあいだの同時作業に変わります。これを切ると (`ConcurrentGarbageCollection=false`) CPU とメモリの負担が少し減りますが、その利点を手放すことになるので、長い停止が何の損にもならないバッチ処理でだけ意味があります。

既定ではなく数字で決めてください。実際にデプロイする形のマシンで Server GC と Workstation GC の両方で同じ負荷テストを走らせ、`time-in-gc`、`gc-heap-size`、p99 を並べて比べます。停止を半分にしながらヒープを 2 倍にする Server GC は、余裕のあるコンテナーでは利益で、古い数字に合わせて大きさを決めたコンテナーでは災難です。メモリ上限とコレクターの選択を同じ場で決めなければならない理由がここにあります。
