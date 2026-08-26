---
title: "Readiness Probe"
summary: "readiness probe は数秒ごとに 1 つのことを尋ねます。今このインスタンスがトラフィックを受けてよいか。失敗すれば pod は静かにローテーションから外れ、通過すればトラフィックが戻ります。liveness はもっと厳しい質問、つまりこのプロセスが存在し続けてよいかを尋ね、再起動で答えます。"
category: "コンテナーとオーケストレーション"
scene: readiness-probe
steps:
  - title: "2 つの質問、2 つの答え"
    text: "readiness は、今このインスタンスがトラフィックを受けてよいかを問います。liveness は、このプロセスが存在し続けてよいかを問います。起動したばかりの pod は readiness に失敗して何も受け取らず、準備できた瞬間にローテーションへ加わります。"
  - title: "not ready は静かな退場です"
    text: "依存先が一瞬揺れると readiness が 3 回失敗し、pod は endpoints から外れます。何も殺されません。トラフィックがその横を流れるだけです。プローブが再び通れば、トラフィックは去ったときと同じくらい静かに戻ってきます。"
  - title: "liveness の答えは再起動です"
    text: "固まったプロセスは何も通せないので、kubelet がコンテナーを殺して再起動します。カウンターが増え、readiness が新しい出発を守り、pod が本当に準備できるまでトラフィックは待ちます。再起動は固まったものへの処方であって、忙しいものへの処方ではありません。"
  - title: "liveness は自分を、readiness は依存先を見ます"
    text: "liveness にデータベースを確認させると、一度の揺れですべての pod が同時に再起動します。自分で作った障害です。正しく分ければ、同じ揺れは pod をローテーションから外すだけで、依存先が戻った瞬間に pod も戻ります。"
related:
  - label: Health Check
    slug: health-check
  - label: Liveness Probe
    slug: liveness-probe
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Load Balancer
    slug: load-balancer
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: "Kubernetes: configure liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
  - title: "ASP.NET Core: health checks"
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks
---

## いつ使うか

- ルーターの後ろに置かれるすべてのデプロイで使います。ロールアウト、スケールアウト、復旧はどれも新しいものが現れる場面であり、トラフィックが早すぎるタイミングで届かないのは、プローブがまだ通っていないからです。
- インスタンスに暖機の作業があるときに使います。設定の読み込み、キャッシュの充填、コネクションプールのオープン、起動時のマイグレーションは、どれも最初のリクエストより前に済ませるべきものです。readiness は、プロセスがそれを伝える手段です。
- 壊れてはいないのに一時的に処理できないインスタンスがある場所で使います。依存先を待っている pod、負荷を捨てている pod、停止を指示されて残りのリクエストを片づけている pod は、いずれも殺されることではなく飛ばされることを望んでいます。
- ready の数を replica の数と並べて見て、その隣で再起動カウンターを見ます。ready の数が下がりながら再起動が増えていくなら、たいていは全体が病んでいるのではなく、プローブが見当違いのものを見ています。

## 注意点

- readiness は依存先を確認してよいのに対し、liveness はプロセス自身だけを確認すべきです。データベースまで手を伸ばす liveness probe は、1 本の遅いクエリを全体の再起動に変え、その再起動がデータベースをさらに遅くします。
- initial delay と period、failureThreshold をアプリケーションの実際の暖機時間に合わせます。見ているプロセスより厳しいプローブは、数秒ごとに endpoints を出入りするばたつきを生みますが、呼び出す側にとっては外れたままより悪い状態です。
- しきい値の代償を覚えておきます。周期 2 秒で 3 回の拒否とは、もう処理できないと自分で分かっているインスタンスへ 6 秒間トラフィックを送るということです。しきい値は反応を遅らせる代わりに、1 回の悪いサンプルに揺さぶられない性質を買います。既定値のまま驚くのではなく、意図して選びます。
- 負荷がかかると失敗する readiness の検査は、全体が揃っていてほしいまさにその瞬間に台数を減らします。検査がレイテンシーやキュー長を測っていると、忙しいインスタンスが自分から外れ、その分が隣へ移り、隣も順に外れていきます。プローブを緩めるのではなく、負荷の切り捨てと同時実行数の制限を組み合わせます。
- 起動の遅いプロセスには、liveness を起動時間まで引き延ばすのではなく startup probe を使います。2 分の起動に耐えられるほど寛容な liveness probe は、固まったプロセスを 2 分放置するにも十分寛容です。
- 終了が始まったら readiness をすぐに失敗させます。endpoints からインスタンスを外す処理は瞬時ではないので、ready の報告をやめるのと同時にリクエストも断り始める pod は、ほんの少し前にルーティングされたリクエストを断ることになります。
- エンドポイントはクラスター内では認証なしで軽く保ち、公開ルーターには載せません。すべてのインスタンスで毎秒何度も走る検査なので、高価なものを問い合わせる検査は健全性という名前を付けた負荷生成器です。

## .NET では

ASP.NET Core にはこの切り分けが最初から入っています。検査にタグを付けて登録し、そのタグで絞り込むエンドポイントを 2 つマップすれば、readiness 側は依存先を確認し、liveness 側はプロセスだけで答えます。

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddCheck<OrdersDbHealthCheck>("orders-db", tags: ["ready"])
    .AddCheck<CacheWarmHealthCheck>("cache-warm", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Tags.Contains("live") });
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

マニフェストはその経路と一致している必要があり、そこに書く数字こそシーンが見せている値です。最初の質問までどれだけ待つか、どれくらいの頻度で尋ねるか、何回続けて断られたら kubelet が動くか、の 3 つです。

```yaml
readinessProbe:
  httpGet: { path: /healthz/ready, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 2
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /healthz/live, port: 8080 }   # the process only
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet: { path: /healthz/live, port: 8080 }
  periodSeconds: 5
  failureThreshold: 30                           # up to 150s to boot
```

最後の一片は終了です。`ApplicationStopping` が発生した瞬間に not-ready を報告すれば、処理中のリクエストが終わる間に endpoints の変更がすでに伝わっていきます。そしてホストの終了タイムアウトはプラットフォームの猶予時間の内側に収めます。

```csharp
// One flag, set by the lifetime and read by readiness, is the whole handshake.
builder.Services.AddSingleton<ShutdownState>();
builder.Services.AddHealthChecks()
    .AddCheck<ShutdownState>("not-shutting-down", tags: ["ready"]);

app.Lifetime.ApplicationStopping.Register(
    () => app.Services.GetRequiredService<ShutdownState>().Stopping = true);
```

HTTP の口を持たないワーカーにも同じ発想が使えます。プロセスが書き出す目印を確認するコマンドを `exec` で回すか、準備できてから初めて開くリスナーを `tcpSocket` で見ます。検査の形よりも、2 つの質問のどちらに答えているかのほうがはるかに重要です。
