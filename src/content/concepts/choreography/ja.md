---
title: "Choreography"
summary: "Choreography はコーディネーターのいない saga です。各サービスが自分のローカルトランザクションを commit してイベントを発行し、そのイベントを購読した側が次のステップを実行します。流れはどこにも書かれておらず、購読の合計としてだけ存在します。"
category: "分散トランザクションとメッセージ整合性"
scene: saga
sceneStep: 1
related:
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Correlation ID
    slug: correlation-id
references:
  - title: Saga distributed transactions pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
  - title: Event-driven architecture style
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven
  - title: MassTransit sagas
    url: https://masstransit.massient.com/concepts/saga-state-machines
---

Order が自分の行を commit して `OrderPlaced` を発行します。Payment はそのイベントを購読して決済を行い、`PaymentCompleted` を発行します。Inventory はそれを購読して在庫を確保します。全体の順序を知っているサービスは 1 つもなく、互いを直接呼ぶこともありません。どのイベントに反応し、どのイベントを出すかだけを知っています。ステップを増やす作業が購読者を 1 つ足すだけで済むので、始めのうちはとても安く感じられます。

得られるのは独立性です。流れを進めるために必ず生きていなければならない部品がなく、デプロイをまとめる必要もなく、片方を変えたらもう片方も直さねばならない箇所もありません。同じイベントに不正検知のステップを足すのも誰かに断る必要がなく、サービスはハンドラー 1 つと発行 1 つの小さなままでいられます。

失うのは流れそのものです。順序がコードのどこにも現れないので、「12 番の注文はどこまで進み、なぜ止まったのか」に答えるには 3 つのサービスのログを読み、鎖を手でつなぎ直すことになります。失敗処理も、イベントが流れる向きに散らばります。Inventory は `ReservationFailed` を発行するだけなので、それを購読して、確保の失敗が返金を意味すると知っていなければならないのは Payment のほうです。こうして Inventory の失敗の種類が、本来知らなくてよいサービスの中の知識になります。循環もうっかり作りやすく、ステップの順序を変える作業は複数の購読を同時に直す作業になります。

耐えられるようにする習慣が 3 つあります。行を commit するトランザクションの中で outbox を経由して発行し、イベントなしで commit だけされるステップをなくします。すべてのメッセージに correlation id を載せてどこでも一緒に記録し、あとから鎖を組み立て直せるようにします。ブローカーは at-least-once で届けるので、すべてのコンシューマーを冪等にします。流れがいくつかのステップを超えたり分岐が生まれ始めたら、購読をもう 1 つ足すのではなく、オーケストレーターに流れを移すときです。
