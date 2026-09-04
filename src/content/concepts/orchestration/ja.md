---
title: "Orchestration"
summary: "Orchestration はコーディネーターのいる saga です。ひとつの部品がすべてのコマンドを送り、答えが返るたびに saga がどの状態へ移ったかを記録し、ステップが失敗したときは補償まで自分で指示します。"
category: "分散トランザクションとメッセージ一貫性"
scene: saga
sceneStep: 3
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: State Machine
    slug: state-machine
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Correlation ID
    slug: correlation-id
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: MassTransit
    slug: masstransit
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: MassTransit sagas
    url: https://masstransit.massient.com/concepts/saga-state-machines
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
---

順序はコーディネーターが握ります。Payment に `Charge` を送り、答えを待ち、saga はいま `Paid` だと書き、Inventory に `Reserve` を送る、という具合です。サービス同士は互いを購読せず、コマンドを受けて答えるだけになるので、Choreography のときより単純でいられます。次に何が来るかも、失敗したとき誰に伝えるかも知らなくてよいからです。

要は状態です。ひとつの行がすべての注文の到達点を示すので、「12 番の注文はなぜまだ出荷されていないのか」が調査ではなく問い合わせになります。順序が一か所にあるので順序の変更は一度の修正で済み、失敗処理も同じ場所にあるので、どのステップが完了したかを実際に知っている部品が補償を指示します。タイムアウトもコーディネーターの担当です。40 秒前に送ったステップがまだ答えていないと気づけるのは、そこだけです。

代償は依存と誘惑です。コーディネーターが止まれば何も動かないので、ストアは堅牢でなければならず、再起動時は最初からではなく記録された状態から続ける必要があります。誘惑はコーディネーターを太らせる方向に来ます。コーディネーターはステップを順に並べるだけにして、ドメインのルールはサービス側に置きます。そうしないと、機能を足すたびに必ず手を入れる唯一の部品へと少しずつ変わっていきます。

.NET では通常、手続きではなくステートマシンとして書きます。MassTransit、Dapr Workflow、Durable Functions、Temporal はどれも同じ三つを行います。インスタンスを永続化し、障害のあとに再開し、答えのひとつひとつを遷移に変えます。状態の保存と次のコマンドの発行を outbox 経由で同じトランザクションにまとめ、すべてのハンドラーで correlation id により重複を弾き、状態ごとにタイムアウトを設定します。そうすれば、答えないステップは一週間 `Paid` のまま残る行ではなく、警報として現れます。
