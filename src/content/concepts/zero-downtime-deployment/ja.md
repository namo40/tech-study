---
title: "Zero-Downtime Deployment"
summary: "無停止デプロイとは、デプロイが原因で失敗するリクエストが 1 つもないデプロイのことです。それ自体が戦略なのではなく、3 つの条件が同時に成り立っている状態です。新しいインスタンスは処理できるようになってから初めてトラフィックを受け、古いインスタンスは受けたものを終えてから出ていき、両方が動いている間、2 つのバージョンは互換である、という 3 つです。"
category: "コンテナーとオーケストレーション"
scene: rolling-update
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Kubernetes: Deployments"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

シーン全体が 1 つの問いへの答えです。デプロイが見えないためには何が成り立っている必要があるか。ポッドではなく上のリクエストの流れを見ると、答えが見えやすくなります。流れは一度も止まらず、4 つのステップを通じて ✕ を付けて戻る点は 2 つだけです。どちらも最後のステップにあり、どちらもデプロイの手順そのものが生んだ失敗ではありません。

1 つ目の条件は、容量が一度も下がらないことです。`maxSurge 1` と `maxUnavailable 0` は、一時的に 5 になることはあっても 3 にはならないという意味なので、古いポッドを外す前に新しいポッドの分を必ず先に払います。数値より順序が重要です。起動し、待ち、それから止める、という順序です。逆にするとレプリカ 4 つ分のトラフィックが 3 つに届く区間ができ、それに気づくかどうかはデプロイではなく余裕容量の問題になります。

2 つ目の条件は、readiness が入るときも出るときも正直であることです。2 番目のステップが入る側を見せます。probe に失敗したポッドは endpoints に入れないので、壊れたビルドが払う代償は止まったロールアウトだけです。3 番目のステップが出る側を見せますが、忘れられがちなのはこちらです。消えるポッドは、聞くのをやめる前にまずそう伝えなければなりません。自分に仕事を送るルーティングテーブルは写しであり、写しの更新には時間がかかるからです。

3 つ目の条件は互換性で、デプロイ基盤が強制できないのがこれです。ロールアウト中、2 つのバージョンは同じデータベースと同じ API に対して同時に生きているので、どちらかが理解できないものは、マニフェストからは見えない失敗になります。4 番目のステップの 2 つの ✕ がそれで、直し方はデプロイ設定ではなく規律です。拡張し、移し、縮小するという規律で、しかも複数のリリースに分けて行います。

ここにあるもので Kubernetes に固有のものはありません。ターゲットグループを空にするロードバランサー、リバースプロキシの後ろの Windows サービス、メッセージを受けるのをやめて手元のものを終えるキューのコンシューマー、どれも同じ 3 つを必要とします。Kubernetes はその 3 つに名前が付いている場所にすぎません。

本当に効いたのかを測っておく価値はあります。デプロイは予定を立てられる唯一の障害なので、ロールアウトのたびにダッシュボードに印を残し、その区間のエラー率と p99 を見てください。マニフェスト上は無停止なのにテールには見えているデプロイは、3 つの条件のどれかが欠けたデプロイであり、それが最初に現れる場所はたいていテールです。
