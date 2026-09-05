---
title: "Compensating Transaction"
summary: "Compensating Transaction は、すでに commit されたステップを取り消すための業務アクションです。rollback ではありません。最初の効果は実際に起きて外から見えており、補償はその上に記録される 2 つ目の事実です。"
category: "分散トランザクションとメッセージ整合性"
scene: saga
sceneStep: 2
related:
  - label: Saga
    slug: saga
  - label: Pivot Transaction
    slug: pivot-transaction
  - label: Orchestration
    slug: orchestration
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Idempotency
    slug: idempotency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: Compensating Transaction pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
---

ローカルトランザクションが commit された時点で、その効果はすでに公になっています。カードから金額が引かれ、行には在庫を確保したと書かれ、顧客にはメールが届いています。どのデータベースもそれを取り戻せません。そもそも他の 2 つのサービスを同じトランザクションの中に抱えていなかったからです。だから取り消しは技術的な操作ではなく業務の動作になります。返金、キャンセル、在庫の解放は、それぞれ自分の行を残す新しいローカルトランザクションです。

順序が重要です。補償は逆順に、いちばん新しいステップから実行され、それぞれ自分のステップだけを取り消せば済みます。おかげで補償は小さく、テストしやすいままでいられます。返金ハンドラーは決済だけを知っていればよいのです。同時に saga は、実際に完了したステップがどれかを覚えていなければなりません。実行されていないステップを補償した瞬間、受け取っていないお金を返すシステムになってしまいます。

補償は意味の取り消しであって、物理的な取り消しではありません。返金のあと口座には決済と返金の 2 行が残り、行が消えてゼロになるわけではありません。多くの場合、業務が望むのもそちらです。跡形もない空白ではなく、何が起きたかを語る記録です。途中の状態がそれ自体で正当であるようにドメインを設計します。`reserved` から `released` に移れる行はきれいに補償できますが、いきなり `shipped` へ飛んだ行はそうはいきません。

補償を壊すものが 2 つあるので、両方に備えます。そもそも補償が存在しないステップがあり、それが pivot です。その先は前に進む道しかありません。そして補償も他と同じように失敗しますが、補償のための補償はないので、成功するまで再試行するしかありません。だから繰り返し実行できることは譲れない条件です。すべての補償を saga id でキー付けし、二度実行しても一度と同じ結果にし、試行回数が尽きたら saga を半分だけ戻した状態で放置せず、警報を上げます。
