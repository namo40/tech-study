---
title: "Horizontal Pod Autoscaler"
summary: "Horizontal Pod Autoscaler は指標 1 つと目標値 1 つからワークロードの replica 数を変えます。計算は desired = ceil(現在の数 × 実測値 / 目標値) です。起きたあとに反応し、新しい pod が準備できるまで時間がかかり、見ている指標の良し悪しがそのまま結果になります。"
category: "コンテナーとオーケストレーション"
scene: horizontal-pod-autoscaler
steps:
  - title: "平常"
    text: "pod 2 つが目標 60% に対して CPU 35% で動いています。15 秒ごとにオートスケーラーが望ましい数を計算し直し、同じ答えを得ます。2 つです。何も変わらないことがまさに狙いです。"
  - title: "急増"
    text: "トラフィックが 3 倍になり、pod 2 つが飽和してリクエストが断られ始めます。オートスケーラーは次の周期で気づいて 4 つを要求し、新しい pod は起動に 30 秒かかります。準備が整うまで、元の 2 つがすべてを受け持ちます。その隙間を埋めるのが余裕容量です。"
  - title: "縮小はゆっくり"
    text: "トラフィックが減ると計算はまた 2 つと言いますが、オートスケーラーは安定化ウィンドウが過ぎるのを待ってから pod を削除します。その間の短い急増で上下に揺れないようにするためです。拡張は積極的に、縮小は辛抱強く動きます。"
  - title: "正しい指標"
    text: "仕事の性質が I/O 待ち中心に変わります。CPU は 30% のままで何も要求しないのに、pod の後ろのキューはリクエストが捨てられるまで積み上がります。オートスケーラーにキューを見せると、同じ計算式がようやく 4 つと言います。"
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

- 一日のうちで負荷が上下する、状態を持たないワークロード。Web や API の pod、コンシューマー、バックグラウンドのワーカーが当てはまります。
- replica を増やすことが実際に処理能力を増やすとき。後ろにいるデータベース、キャッシュ、ブローカーに、増えた接続を受け止める余地があって初めて成り立ちます。
- 「忙しすぎる」を表す数値を name として挙げ、外に出せるとき。オートスケーラーは制御器であり、制御器には利用者が気づく前に動く信号が要ります。

## 注意点

- 拡張は起きたあとの反応で、pod が準備できるまでには時間がかかります。負荷が届いた時点と処理能力が届いた時点の隙間は余裕容量で埋めるので、ここでは巧妙な方針よりも低めの目標値と速い起動のほうが効きます。
- resource request を設定してください。CPU 使用率はノードではなく request に対する百分率であり、request のない pod はオートスケーラーに割る分母そのものを渡しません。
- readiness probe が新しい pod へのトラフィックを止めてくれます。実際に処理できる前に準備完了と答える pod は急増をさらに悪くします。ロードバランサーが割り当てを送り、それを失敗させてしまうからです。
- 縮小には安定化ウィンドウを置き、拡張には置かないでください。pod を外す判断は遅らせても損が小さく、誤ると高くつきます。短い凪が同じ replica を外しては足す循環に育たないよう止めるのが、このウィンドウです。
- I/O 待ちやキューが主導する仕事には CPU は誤った指標です。処理中のリクエスト数、キューの深さや待ち時間、コンシューマーの遅れ、p95 遅延はどれも CPU が動かないときに動き、どれも custom metric や external metric として使えます。
- `max` を上げる前に、その先の鎖を確かめてください。pod 16 個がそれぞれ接続を 10 本持てば 160 本ですが、データベースは 100 本で設定されているかもしれません。
- 仕事が均一でなければ、pod 2 つは pod 2 つ分の処理能力と同じではありません。拡張が平均に何をしたかだけでなく、裾に何をしたかを見てください。

## .NET では

方針が置かれる場所はマニフェストです。抜けやすい半分が `behavior` で、デプロイが上下に揺れるかどうかを決めるのもこちらです。下げるときは安定化ウィンドウを置き、上げるときは置きません。

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

2 つ目の指標は、アプリケーションがそれを外に出しているから存在します。Prometheus exporter 経由で読まれる `ObservableGauge` 1 つと、スクレイプの結果を custom metric に変えるクラスター側のアダプター 1 つで、配管はすべてです。

```csharp
// The app exports the number the autoscaler scales on.
private static readonly Meter Meter = new("Shop.Orders");
private static readonly ObservableGauge<long> QueueDepth =
    Meter.CreateObservableGauge("orders_queue_depth", () => queue.ApproximateDepth);

builder.Services.AddOpenTelemetry()
    .WithMetrics(m => m.AddMeter("Shop.Orders").AddPrometheusExporter());
app.MapPrometheusScrapingEndpoint();          // /metrics
```

Deployment の 2 行が、オートスケーラー本体と同じくらい効きます。`resources.requests.cpu` は CPU のパーセントが基準にする分母であり、readiness probe は pod が処理できるようになるまでトラフィックを止めておく仕組みです。前者がなければ計算式に使う値がなく、後者がなければ新しい pod がまだ役に立たないうちに輪に加わります。よりによって負荷が最も高い瞬間にです。
