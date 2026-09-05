---
title: "Horizontal Pod Autoscaler"
summary: "Horizontal Pod Autoscaler は指標 1 つと目標値 1 つからワークロードのレプリカ数を変えます。計算は desired = ceil(現在の数 × 実測値 / 目標値) です。起きたあとに反応し、新しいポッドが準備できるまで時間がかかり、見ている指標の良し悪しがそのまま結果になります。"
category: "コンテナーとオーケストレーション"
scene: horizontal-pod-autoscaler
steps:
  - title: "平常"
    text: "ポッド 2 つが目標 60% に対して CPU 35% で動いています。15 秒ごとにオートスケーラーが望ましい数を計算し直し、同じ答えを得ます。2 つです。何も変わらないことがまさに狙いです。"
  - title: "急増"
    text: "トラフィックが 3 倍になり、ポッド 2 つが飽和します。オートスケーラーは次の周期で 4 つを要求します。新しいポッドが起動する 30 秒は元の 2 つが全部を受け持ち、リクエストが 1 つ 2 つ断られます。その隙間を埋めるのが余裕容量です。"
  - title: "縮小はゆっくり"
    text: "トラフィックが減ると計算はまた 2 つと言いますが、オートスケーラーは安定化ウィンドウが過ぎるのを待ってからポッドを削除します。その間の短い急増で上下に揺れないようにするためです。拡張は積極的に、縮小は辛抱強く動きます。"
  - title: "正しい指標"
    text: "仕事が I/O 待ち中心に変わります。CPU は request の 30% のままで何も要求しないのに、キューは上限へ向かって積み上がります。オートスケーラーにキューを見せるとようやく 4 つと言い、新しいポッドができるまでリクエストは捨てられます。"
related:
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Resource Limit
    slug: resource-limit
  - label: Readiness Probe
    slug: readiness-probe
  - label: Horizontal Scaling
    slug: horizontal-scaling
  - label: Elasticity
    slug: elasticity
  - label: Load Balancer
    slug: load-balancer
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "HorizontalPodAutoscaler walkthrough"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
---

## いつ使うか

- 1 日のうちで負荷が上下する、状態を持たないワークロード。Web や API のポッド、コンシューマー、バックグラウンドのワーカーが当てはまります。
- レプリカを増やすことが実際に処理能力を増やすとき。後ろにいるデータベース、キャッシュ、ブローカーに、増えた接続を受け止める余地があって初めて成り立ちます。
- 「忙しすぎる」を意味する数値を特定して、外に出せるとき。オートスケーラーは制御器であり、制御器にはユーザーが気づく前に動く信号が要ります。

## 注意点

- 拡張は起きたあとの反応で、ポッドが準備できるまでには時間がかかります。負荷が届いた時点と処理能力が届いた時点の隙間は余裕容量で埋めるので、ここでは巧妙なポリシーよりも低めの目標値と速い起動のほうが効きます。
- resource request を設定してください。CPU 使用率はノードではなく request に対する百分率であり、request のないポッドはオートスケーラーに割る分母そのものを渡しません。
- readiness probe が新しいポッドへのトラフィックを止めてくれます。実際に処理できる前に準備完了と答えるポッドは急増をさらに悪くします。ロードバランサーが割り当てを送り、それを失敗させてしまうからです。
- 縮小には安定化ウィンドウを置き、拡張には置かないでください。ポッドを外す判断は遅らせても損が小さく、誤ると高くつきます。短い凪が同じレプリカを外しては足す循環に育たないよう止めるのが、このウィンドウです。
- I/O 待ちやキューが主導する仕事には CPU は誤った指標です。処理中のリクエスト数、キューの深さや待ち時間、コンシューマーの遅れ、p95 レイテンシはどれも CPU が動かないときに動き、どれも custom metric や external metric として使えます。
- `max` を上げる前に、その先の鎖を確かめてください。ポッド 16 個がそれぞれ接続を 10 本持てば 160 本ですが、データベースは 100 本で設定されているかもしれません。
- 仕事が均一でなければ、ポッド 2 つはポッド 2 つ分の処理能力と同じではありません。拡張が平均に何をしたかだけでなく、テールに何をしたかを見てください。

## .NET では

ポリシーが置かれる場所はマニフェストです。下の `behavior` ブロックが書き下ろしているのは、Kubernetes が既定ですでにしていること、つまり下げるときは 5 分の安定化ウィンドウ、上げるときはなし、です。一度明示しておくと非対称が見えるようになります。本当に出番が来るのは、別のウィンドウが要るときや、1 分にポッドを 1 つしか外さないといった速度を抑える `policies` が要るときです。

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: orders-worker }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: orders-worker }
  minReplicas: 2
  maxReplicas: 8
  behavior:
    scaleDown: { stabilizationWindowSeconds: 300 }
    scaleUp:   { stabilizationWindowSeconds: 0 }
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 60 } }
    - type: Pods
      pods:
        metric: { name: orders_queue_depth }
        target: { type: AverageValue, averageValue: "100" }
```

2 つ目の指標は、アプリケーションがそれを外に出しているから存在します。Prometheus exporter 経由で読まれる `ObservableGauge` 1 つと、スクレイプの結果を custom metric に変えるクラスター側のアダプター 1 つで、配管はすべてです。この exporter は `OpenTelemetry.Exporter.Prometheus.AspNetCore` で、安定版が一度も出ていません。プレリリースへの依存が許されない場合は、代わりに OTLP でコレクターへ送り、スクレイプ用のエンドポイントはコレクターに公開させます。

```csharp
// アプリケーションが、オートスケーラーのスケール判断に使う数値を外に出します。
private static readonly Meter Meter = new("Shop.Orders");
private static readonly ObservableGauge<long> QueueDepth =
    Meter.CreateObservableGauge("orders_queue_depth", () => queue.ApproximateDepth);

builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("Shop.Orders").AddPrometheusExporter());
app.MapPrometheusScrapingEndpoint();          // /metrics
```

Deployment の 2 行が、オートスケーラー本体と同じくらい効きます。`resources.requests.cpu` は CPU のパーセントが基準にする分母であり、readiness probe はポッドが処理できるようになるまでトラフィックを止めておく仕組みです。前者がなければ計算式に使う値がなく、後者がなければ新しいポッドがまだ役に立たないうちに輪に加わります。よりによって負荷が最も高い瞬間にです。
