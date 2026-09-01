---
title: "Roll-Forward"
summary: "前へ直すとは、古いリリースではなく新しいリリースで直すことです。損傷がすでにプロセスの外へ出てしまったとき、前のリビジョンが悪い版の書いたものを読めないとき、スキーマがもう先へ進んでいて戻り道がもはや戻り道ではないときの答えです。"
category: "コンテナーとオーケストレーション"
scene: rollback
sceneStep: 4
related:
  - label: Rollback
    slug: rollback
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Feature Flag
    slug: feature-flag
  - label: Database Migration
    slug: database-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Idempotency-Key
    slug: idempotency-key
references:
  - title: Safe deployment practices
    url: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
  - title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Applying Migrations - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
---

前へ直すことは、同じ技術のもう半分です。ロールバックはまだ立っているリビジョンへポインターを戻すことで、前へ直すことは直したリリースを作ってそちらを指すことです。前者のほうが速く、まず出るべき反射なので、前へ直すことが勇気ある選択でも玄人の選択でもありません。戻っても実際には助けにならないときに残る選択であり、技術のすべては障害が動いている最中にその 2 つの状況を見分けるところにあります。

前へ押し出す理由は 3 つです。1 つ目は、すでにプロセスの外へ出てしまった損傷です。確認メールは出て行き、カードは決済され、Webhook は発射されて相手のシステムがそれを処理しました。どれにもデプロイは届きません。ここに答えるのは補償です。なかったことにする取り消しではなく、先の行為を打ち消す新しい行為であり、補償はリリースに乗って出ていくので、リリースは前へ動かなければなりません。2 つ目は、古いコードが読めないデータです。悪いリビジョンが自分で決めた形式でレコードを書いたのに、前のリビジョンが読めるだけスキーマを広く保っていなかったなら、ポインターを戻した瞬間に 1 つ目の障害の上へ 2 つ目が重なります。3 つ目は、すでに走ってしまって正直には戻せないマイグレーションです。このとき戻り道は復元になり、小さな前向きの修正のほうが安い決定になります。

前へ直すことが 2 つ目の障害にならないようにするのは規律です。変更の範囲を欠陥に合わせて絞ってください。障害中の修正リリースは、来週入る予定のリファクタリングを一緒に乗せる場ではなく、2 人が確認した 1 行の修正のほうが、誰も読んでいないきれいな書き直しより優れています。悪いリリースが通ったのと同じ関門を、迂回せずにそのまま通します。修正を信じる根拠が、まさにそのパイプラインだからです。補償の動作は 2 回実行しても安全にします。実際に 2 回実行することになるからです。返金には、同じ要求を 2 回送っても結果が変わらないようにする鍵を付け、すでに直したレコードには印を残し、悪かった区間で触れられた対象が正確に何かを一覧にします。そしてその区間そのものを書き留めます。デプロイからポインターの移動までが区間で、補償が覆うべきものはすべてその中で作られました。

そうすれば判断は短くなります。コードが悪く、前のリビジョンが今日のデータをまだ扱えるなら、後ろへ行きます。できるいちばん速いことであり、本番にいたという事実そのものがすでに試験です。プロセスの外の世界が変わったか、データが古いコードの理解を追い越したなら、前へ行き、補償を一緒に持っていきます。迷っていて戻り道が開いているなら、とりあえず後ろへ行きます。出血を止められますし、1 時間後にもう壊れていないシステムから前向きの修正に使い直せるもの以外、何も失いません。
