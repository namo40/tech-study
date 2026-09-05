---
title: "Rolling Update"
summary: "ローリングアップデートはポッドを一まとまりずつ入れ替えます。新しいポッドが起動し、readiness probe を通過し、トラフィックを受け始めてから初めて、古いポッドが停止を指示されて残りのリクエストを片づけます。2 つのバージョンが並んで動けるなら、誰も気づきません。"
category: "コンテナーとオーケストレーション"
scene: rolling-update
steps:
  - title: "1 つずつ"
    text: "新しいポッドが起動し、readiness を通過し、endpoints に加わってから初めて、古いポッドが停止を指示されます。数は 4 を下回らないので、トラフィックは気づきません。しばらくは 2 つのバージョンが一緒に動きます。"
  - title: "readiness が関門"
    text: "新しいバージョンが probe に失敗すると、endpoints に加われず、リクエストを一度も受けません。ロールアウトは古いポッドが動き続けたまま止まり、元に戻すのはコマンド 1 つです。今度は同じコントローラーがポッドを 1 つずつ元へ戻していきます。"
  - title: "空にしてから出る"
    text: "直したビルドがロールアウトされ、そのポッドが準備できると古いポッドが停止を指示されます。終了中のポッドは endpoints から外れますが、伝わるまで少しかかるので、もう少し受け付けて手元のものを終えます。SIGTERM は要求であって強制終了ではありません。"
  - title: "2 つのバージョンに 1 つのデータベース"
    text: "ロールアウト中、古いポッドと新しいポッドはスキーマと API を共有します。途中で試した名前の変更は、まだ動いているバージョンを壊して元に戻されます。代わりに拡張します。列を追加し、古い列を残し、すべてのポッドが新しくなってから縮小します。"
related:
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Load Balancer
    slug: load-balancer
  - label: Sticky Session
    slug: sticky-session
  - label: Replication Lag
    slug: replication-lag
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: liveness, readiness and startup probes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/probes/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## いつ使うか

- 状態を持たないサービスの既定のデプロイ戦略として使います。Kubernetes に限らず、プロセスを複数動かすたいていのプラットフォームで同じです。
- 2 つのバージョンが同時に動くことを許容できるときに使います。許容できないならブルーグリーンが代わりになりますが、そちらもデータ層の互換性は同じように必要です。
- レプリカが互いに置き換え可能なときに使います。ローリングアップデートはどのポッドでもどのリクエストにも答えられることを前提にするので、1 つのインスタンスに結びついたものは先にメモリーの外へ移しておきます。

## 注意点

- readiness probe は、起動できるかではなく処理できるかを表す必要があります。依存先にまだ届かずキャッシュも温まっていないのに通過する probe は、トラフィックを失敗へ流し込みます。しかもその失敗は、全体の半分が新しいポッドになっているときに届きます。
- SIGTERM を処理してください。新しい仕事を受けるのをやめ、処理中のものを終え、猶予期間が尽きる前に出ていきます。ホストのシャットダウンタイムアウトは `terminationGracePeriodSeconds` より上ではなく下に置きます。そうしないとプロセスはリクエストの途中で殺されます。
- pre-stop の遅延を短く入れてください。ポッドを endpoints から外す処理は即座には終わらないので、SIGTERM が届いた瞬間にリスナーを閉じると、わずかに前に振り分けられたリクエストを拒否することになります。
- スキーマと API の変更は、1 バージョン分は互換になるようにしてください。消す前に足し、両方の形を扱うコードをデプロイし、それから古い形を片づけます。
- 進行期限を決め、リビジョン履歴を残してください。それがないと、いつまでも準備できないロールアウトがそのまま止まり、解決策は誰も実行したことのないコマンドになります。
- surge がポッドの後ろ側に何をするかを見てください。`maxSurge` は一時的にレプリカ 1 つ分の接続をデータベースとブローカーに足します。ポッド 4 つを想定したプールは、5 つを想定したプールではありません。
- 長く張り続ける接続は、リクエストのようには空になりません。WebSocket や gRPC ストリームは設計上、猶予期間を超えて生き残るので、待つのではなくクライアントに再接続を伝える必要があります。

## .NET では

振る舞いの大半はマニフェストにあります。`maxUnavailable: 0` が容量を平らに保ち、readiness probe が新しいポッドへのトラフィックを止め、pre-stop の sleep が、ポッドが停止を指示された時点と endpoints の変更が振り分ける側に届く時点との隙間を埋めます。

```yaml
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  progressDeadlineSeconds: 300
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          readinessProbe: { httpGet: { path: /healthz/ready, port: 8080 }, periodSeconds: 5 }
          lifecycle:
            preStop: { exec: { command: ["sh", "-c", "sleep 5"] } }   # endpoints の伝播待ち
```

アプリケーション側の受け持ちは見た目より小さいものです。シャットダウンが始まった時点ですぐ not-ready を返します。これはポッドを直接プローブするルーターのためです。Kubernetes では endpoints の変更は削除によってすでに始まっており、preStop の sleep がその伝播を覆います。シャットダウンタイムアウトは猶予期間の内側に置きます。

```csharp
// シャットダウンが始まったらすぐ not-ready を返し、処理中の仕事を仕上げます。
builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(20));
builder.Services.AddHealthChecks()
    .AddCheck("shutting-down", () => lifetimeState.IsStopping
        ? HealthCheckResult.Unhealthy("shutting down")
        : HealthCheckResult.Healthy(), tags: ["ready"]);

var app = builder.Build();
app.Lifetime.ApplicationStopping.Register(() => lifetimeState.IsStopping = true);
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

マニフェストでは手が届かないのがデータです。EF Core のマイグレーションを拡張のデプロイと縮小のデプロイに分け、その間にリリースを 1 つ挟んでください。列を nullable で追加し、両方に書き、過去のデータを埋め、読み取りを移してから初めて古い列を落とします。一度に名前を変えるマイグレーションは、まだ古いコードで動いているポッドを壊すマイグレーションであり、ローリングアップデート中はそれが半分を占めます。

長く張り続ける接続には別の答えが要ります。SignalR や gRPC のストリームは猶予期間より長く生き残るので、`ApplicationStopping` のハンドラーを登録して意図的に閉じ、クライアントに再接続を伝えてください。期限が過ぎてプラットフォームに切られるのを待つよりよい方法です。
