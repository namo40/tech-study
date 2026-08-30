---
title: "Utilization"
summary: "資源のうち、いま使われている割合です。待ち時間が伸び始める前に天井があとどれだけ残っているかを教えてくれるので、最も安い早期シグナルになります。"
category: "要件と品質特性"
scene: throughput
sceneStep: 2
related:
  - label: Throughput
    slug: throughput
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "Collect metrics in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-collection
---

場面の第 2 段階は曲線の退屈な区間で、退屈であることがこの区間の値打ちです。流入が上がり、スロットの列が埋まり、`busy` が 25% から 40%、さらに 80% へと上がりますが、`out` もその間ずっと一緒に上がります。行列は空のままで、待ち時間はゼロのままです。これが線形の区間です。余分に届いた負荷の一単位がそのまま余分に終わる仕事の一単位になり、読み手の体験で変わったのはサーバーがより多くこなしているという事実だけです。

utilization を見る価値があるのは、まさにその区間でこれだけが動くからです。線形区間のレイテンシは平らなので、レイテンシのアラートは鳴りません。スループットは上がっているのでスループットのアラートも鳴らず、むしろ良い知らせに見えます。エラー率はゼロです。その間ずっと静かに何かを伝えていた唯一の数字が、資源のうち使われている割合です。それが天井までの距離であり、次に何が起きるかを予告するのはその距離だけだからです。

予告の中身が線形でないところが、人をつまずかせます。待ち時間は残りの余裕の逆数におおむね比例して伸びるので、40% から 50% へ行くのはほとんど無料ですが、90% から 95% へ行くと待ち時間はおよそ 2 倍になります。utilization 対レイテンシのグラフはホッケースティックで、平らな部分は急な部分よりずっと長くなっています。システムが何か月も問題なさそうに見えたあと、ある忙しい午後に倒れるのはそのためです。場面の第 3 段階が、その曲線の先端がどんな姿かを見せています。

だから目標にする数字は utilization ではなく余裕であり、その値は見つけるものではなく選ぶものです。ピークで 70~80% がよくある答えで、これは迷信ではありません。バーストを吸収し、インスタンスを一つ失っても持ちこたえ、トラフィックが変わった時点ですでに動いていた仕事を終えられるだけの余りを残す値です。機材を 95% で回していると誰かが誇るなら、その人が買ったのは安い請求書と、悪い 1 分に対する答えを持たないシステムです。計算は逆向きに進めます。どのバーストまで生き延びたいかを決めれば、utilization の目標はそこから出てきます。

測定で引っかかりやすい罠が二つあります。一つは平均です。1 分間 50% の資源は、30 秒間 100% だったのかもしれず、100% で過ごした 30 秒は実際の利用者が並んでいる行列です。1 分平均ではなく、短い窓と高いパーセンタイルで見てください。もう一つは違う資源を測ることです。utilization は資源ごとなので、CPU が 30% だという事実は 100% のコネクションプールについて何も語りませんが、リクエストが実際に待っているのはそのプールです。ここでは USE メソッドが規律になります。資源ごとに utilization と saturation とエラーを見て、その対象はグラフにしやすい資源ではなく、尽きうる資源にします。

.NET で尽きる資源が CPU であることはまれです。スレッドプール、`SemaphoreSlim` のゲート、エンドポイントごとの `HttpClient` の接続上限、SQL のコネクションプールは、どれも後ろに行列を抱えた固定サイズのもので、それぞれ読める数字があります。自分で上限をかけたものには使用中の許可数を設定した許可数と並べて公開し、フレームワークが上限をかけるものには `threadpool-queue-length` とプールのカウンターを見ます。そのどれかが上限の近くに張り付いていたら、場面が描くのと同じ警告として読んでください。天井は近く、次に来るのは行列です。
