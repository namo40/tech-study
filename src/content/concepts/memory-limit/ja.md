---
title: "Memory Limit"
summary: "コンテナーが押さえつけられる天井です。CPU limit を超えるとプロセスはスロットリングされ、memory limit を超えると、捕まえられる例外もログの 1 行もないまま終了させられます。"
category: "コンテナーとオーケストレーション"
scene: memory-pressure
sceneStep: 3
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Limit
    slug: resource-limit
  - label: Resource Request
    slug: resource-request
  - label: CPU Limit
    slug: cpu-limit
  - label: Allocation Rate
    slug: allocation-rate
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: Server GC
    slug: server-gc
  - label: ArrayPool
    slug: arraypool
references:
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Assign Memory Resources to Containers and Pods"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

memory limit はマニフェストに書かれた数字であり、その背後にあるカーネルの強制機構です。コンテナーランタイムがその値を cgroup に書き込み、その cgroup 内のプロセスが許された量より多い匿名メモリーを使っていると、カーネルが 1 つを選んで SIGKILL を送ります。交渉も、背圧も、猶予もありません。シーンの 3 番目のステップがまさにその瞬間で、そのときアプリケーションのなかで起きることは、止まるということだけです。

大事な語は SIGKILL です。処理できないシグナルなので、そのあとプロセスのなかでは何も実行されません。`catch` も `finally` も `IHostApplicationLifetime.ApplicationStopping` も、ログバッファの最後のフラッシュも、進行中だったリクエストの成功や失敗もありません。これが OOM による終了を `OutOfMemoryException` と分ける点です。後者はランタイムが割り当てを満たせないときに投げる普通のマネージ例外で、原則としては捕まえられます。cgroup の境界には、失敗する割り当てそのものがありません。次の命令の時点でプロセスはただ存在せず、飛んでいたリクエストは、呼び出し側が自分で解釈するしかない接続のリセットとして終わります。

この事実は、故障をどう診断するかに直結します。スタックトレースを前提にした反射はすべて役に立ちません。スタックがないからです。残るのはプロセスの外側にあります。ポッドの再起動回数、`reason: OOMKilled` と `exitCode: 137`、つまり 128 にシグナル 9 を足した値が入った `lastState.terminated` ブロック、ポッドのイベント、そして線が途切れる瞬間までのメモリーグラフです。ログに何もないまま 20 分ごとに再起動するサービスは謎ではなくこれで、確かめる方法はログ文をもう 1 つ足すことではなく `kubectl describe pod` です。

この限度には読み手がもう 1 人いて、2 つの値は一致していなければなりません。.NET はコンテナーを認識します。cgroup の限度を読み、既定ではその 75% をヒープのハード上限に置き、残りの 4 分の 1 をスタックや JIT やネイティブバッファなど、マネージヒープではないすべてに残します。2 つの見方が一致していれば、コレクターはヒープが自分の天井へ近づくほど攻めるようになり、プロセスを生かしたままにできることが多くなります。一致していない場合、たとえば別のマシンを見て誰かが設定した `DOTNET_GCHeapHardLimit` があるとき、cgroup v2 を読むには古すぎるランタイムのとき、ランタイムから見えない場所に限度が掛かっているときには、コレクターは、カーネルが余裕があると思っていたプロセスを殺すその瞬間まで、のんびり走り続けます。

限度の隣にあるリクエスト量は別の判断で、2 つは分けて考えるほうが安全です。リクエスト量はスケジューラーが確保する値であり、ノードの容量を計画する基準です。限度はカーネルが強制する値です。両者を同じにするとポッドは Guaranteed になり、これは最も高いサービス品質クラスで、ノード自体が足りなくなったときに最後に退避されます。実際の利点ですが、空いているノードの余ったメモリーを使える余地を代償に差し出します。限度をリクエスト量よりずっと高くすればその余ったメモリーを使えて、ポッドは Burstable になります。ノードが圧迫を受け、よりによって最悪の時点で退避対象に選ばれるまでは問題ありません。

とはいえ、それで限度が変えるべき対象になるわけではありません。シーンの 4 番目のステップがある理由は、限度を上げても崖の位置が動くだけで傾きは変わらないからです。ヒープは遠のいた天井へ向かってゆっくり満ち、回収は大きくなったライブセットを歩くぶん、道中で毎回より長く止まります。512Mi で 40 分ごとに死んでいたコンテナーは 1Gi で 80 分ごとに死に、その間の停止はより悪くなり、グラフは軸の数字が違うだけでほとんど同じに見えます。本当の変更を書くあいだ時間を買うために上げるのは構いません。ただ、それが修正ではなく執行猶予だということは、自分に対してはっきりさせておいてください。
