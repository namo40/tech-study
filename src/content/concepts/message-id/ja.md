---
title: "Message ID"
summary: "Message ID は、送る側がメッセージに一度だけ付けて二度と変えない識別子です。同じメッセージが 2 回届いても名前は 1 つなので、コンシューマーは 2 度目の到着を見分けのつかない新しい出来事ではなく、気づいて捨てられるものとして扱えます。"
category: "分散トランザクションとメッセージ整合性"
scene: transactional-outbox
sceneStep: 3
related:
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Idempotency Key
    slug: idempotency-key
  - label: Correlation ID
    slug: correlation-id
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Duplicate detection (Azure Service Bus)
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: ServiceBusMessage.MessageId
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.servicebus.servicebusmessage.messageid
---

シーンの 3 番目のステップが見せているものは、見落としやすい一点の上に立っています。リレーが戻ってきてメッセージをもう一度送るとき、そのメッセージは最初と同じ id を付けて出ていきます。重複と 2 つ目の出来事を分けるのはそれだけです。変わらない id がなければ、コンシューマーには同じ事柄を語るメッセージが 2 つ見えるだけで、1 つの注文が二度知らされたのか、まったく同じ注文が 1 秒差で 2 回入ったのかを見分ける手立てがなく、推測するしかありません。id があれば、2 度目の到着は確かめられる事実になります。42 はもう見た、と言えます。

id がどこから来るかが、それが持ちこたえるかどうかを決めます。id は発行するときではなくメッセージを作るときに割り当て、変更と同じトランザクションの中で outbox の行に書き込まなければなりません。リレーが発行時に作る id は再試行のたびに新しい id になりますが、それこそ id が存在する理由だったケースです。本文から計算した id は逆の壊れ方をします。内容の同じ別々の出来事が 1 つにつぶれます。うまくいくのは、書く側が一度だけ選んで保存する値です。たいていは GUID か outbox の連番で、コンシューマーまでのすべての区間をそのまま運ばれていきます。

費用がかかるのはコンシューマー側です。再来を見分けるには、すでに処理したものを覚えておく必要があり、そのためには見た id を入れるテーブルと、その id へのインデックスと、1 行をどれだけ残すかのポリシーが要ります。この期間は実際に決めるべき値です。短すぎれば再試行キューに 1 時間留まっていたメッセージが新しい顔で戻ってきますし、長すぎればテーブルは際限なく育ちます。ブローカーとリレーが合わせて生み出しうる最長の再配信を基準に決めます。そして見た id の行は、そのメッセージが引き起こした処理と同じトランザクションで書きます。その間で落ちれば、メッセージを二度処理する場所に戻ります。

ブローカーがこの仕事の一部を代わりにやってくれることもあります。Azure Service Bus は `MessageId` を受け取り、エンティティで重複検出を有効にしておくと、設定した期間内にすでに見た id を持つ 2 つ目のメッセージを捨てます。この期間は既定で 10 分、20 秒から 7 日まで設定できます。不安定な発行側が生む繰り返しは誰にも届く前に消えますが、送るつもりだったものまで消えることがあります。予約されたメッセージも検査されるので、元の id を保ったままの再試行の写しやデッドレターキューからの再送は、送信済みと報告されたうえで、期間内なら捨てられます。ただし、コンシューマーがメッセージを処理したあと ack（確認応答）を返す前に落ちて生じる繰り返しはそのまま残るので、id は自分のコードからも見えていなければなりません。correlation id とも区別しておきます。message id はこのメッセージの名前で、correlation id はこのメッセージが属する会話の名前です。片方をもう片方として使うと、1 つの流れのすべてのメッセージが最初のメッセージの重複のように見えてしまいます。
