---
title: "Server GC"
summary: "Server GC はヒープを複数のコレクタースレッドに分けて並列に回収します。メモリー使用量が大きくなる代わりに、回収が生む停止が短くなります。ASP.NET Core の既定であり、コンテナーでもっとも頻繁に間違ったまま残される設定でもあります。"
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

回収はヒープを書き換えているスレッドを止める必要があるので、停止を短くする方法は、歩く作業を複数のスレッドに分けることです。Server GC はまさにそれを行います。ヒープを 1 つ持つ代わりに複数持ち、それぞれが自分の割り当て予算と専用のコレクタースレッドを備えます。数は最大で論理 CPU ごとに 1 つです。回収はそれらを一斉に走らせます。実時間で見た停止はおおよそ全体の作業をヒープ数で割った値になり、毎秒多くのリクエストを扱うサービスがこの方式を欲しがる理由がここにあります。

代価はメモリー使用量です。ヒープごとに自分の gen0 予算があるので、いずれかの回収が起きるまでにプロセスが割り当てる量はヒープ数に比例し、定常状態のヒープもそのぶん大きくなります。これは意図した取引です。停止時間を買うためにメモリーを使うのであり、自分のマシンや自分のコンテナーを丸ごと使うサービスには正しい取引です。サイドカーや CLI ツール、小さなプロセスを何十も詰め込んだノードでは正しくありません。そうした場所では、プロセスの一つ一つが機械全体に合わせて自分の大きさを決めることが、誰も使っていないメモリーとして積み上がります。

実際にいくつのヒープを得るかは、もう起動時に一度だけ決まるものではありません。.NET 9 から、Server GC は DATAS (Dynamic Adaptation To Application Sizes) を既定で有効にして動きます。DATAS は必ずヒープ 1 つで始め、回収が奪うスループットが目標の 2% 付近にとどまるように、負荷の動きに合わせてヒープを足したり減らしたりします。ですから軽いトラフィックの小さなサービスは、上の段落が思わせるよりずっと Workstation GC に近い使用量になり、余分なヒープの代金は忙しいあいだだけ払います。`DOTNET_GCDynamicAdaptationMode=0` はすべてのヒープを前もって用意する昔の振る舞いに戻すので、自分がどちらを測っているのかは知っておく価値があります。

コンテナーではこの半分を間違えやすく、ランタイムに何が見えるかは、どのつまみを設定したかで決まります。上限なしの CPU *request* だけではノードの全コアが見えたままなので、64 コアのノードに置いた 2 コアのサービスは 64 に合わせて自分の大きさを決めます。*上限* は cgroup から読まれて切り上げられ、1.5 は 2 になります。1 コア以下の上限では、設定が何と言っていようとランタイムは Workstation GC を使います。論理 CPU が 1 つのときは常にそうするからです。メモリーと CPU の上限を設定し、コンテナーの中から `Environment.ProcessorCount` が何を返すかを確認し、それでも合わないときにだけヒープ数を固定してください。

```xml
<!-- ウェブプロジェクトの既定値。選択が見えるように書き下したもの。 -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

```text
# 同じスイッチを環境変数で書いたもの。コンテナーではふつうこの形で設定する。
DOTNET_gcServer=1
DOTNET_GCDynamicAdaptationMode=1     # DATAS、.NET 9 からの既定。0 はすべてのヒープを前もって用意する
DOTNET_GCHeapCount=0x2               # ヒープ 2 つに固定、16 進。DATAS の前ではなく、あとで手を伸ばすもの
DOTNET_GCHeapHardLimitPercent=0x4B   # 75、16 進
```

同時回収 (バックグラウンド回収) は別のスイッチで、既定では有効です。gen2 回収の大半をアプリケーションスレッドと並んで走らせるので、そのままなら長い停止 1 回だった完全な回収が、短い停止 2 回とそのあいだの同時作業に変わります。これを切ると (`ConcurrentGarbageCollection=false`) CPU とメモリーの負担が少し減りますが、その利点を手放すことになるので、長い停止が何の損にもならないバッチ処理でだけ意味があります。

既定ではなく数字で決めてください。実際にデプロイする形のマシンで Server GC と Workstation GC の両方で同じ負荷テストを走らせ、GC に費やした時間、ヒープサイズ、p99 を並べて比べます。停止を半分にしながらヒープを 2 倍にする Server GC は、余裕のあるコンテナーでは利益で、古い数字に合わせて大きさを決めたコンテナーでは災難です。メモリー上限とコレクターの選択を同じ場で決めなければならない理由がここにあります。
