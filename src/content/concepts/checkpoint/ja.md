---
title: "Checkpoint"
summary: "durable な場所に書き留めた offset なので、再起動はどこに降り立てばよいかが分かります。落ちた代償を失われた作業ではなく失われた時間に変えるもので、どれだけの間隔で書くかはストレージへの往復と処理し直す量の直接の取引です。"
category: "メッセージングとイベント処理"
scene: publish-subscribe
sceneStep: 3
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Event Stream
    slug: event-stream
  - label: At-Least-Once
    slug: at-least-once
  - label: Event Replay
    slug: event-replay
  - label: Ordering
    slug: ordering
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Balance partition load across multiple instances
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-processor-balance-partition-load
  - title: EventProcessorClient
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.eventprocessorclient
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
---

シーンの 3 番目のステップが、この概念のすべてを一つの動きで見せます。B は `checkpoint 5` を書き、落ち、イベントを二つ逃します。その二つは消えてもいないし、そもそも B の中にあったこともありません。もともとあるべき場所、つまりログにあります。B は戻ってきても、何を逃したのかを誰にも尋ねませんし、最初からやり直しもしません。自分の checkpoint を読んで位置を 5 に合わせ、6 と 7 と 8 を空けていきます。落ちたことが奪ったのは、止まっていた時間です。

だから checkpoint は、同じ数字を抱えていても offset とは別のものです。offset はプロセスの中に住み、プロセスとともに消えます。checkpoint はプロセスが所有しないストレージに住み、再起動が信じてよい唯一の値です。Event Hubs では `UpdateCheckpointAsync` が書く blob であり、Kafka では内部トピックにコミットされた offset であり、自作のコンシューマーなら自分のデータベースの 1 行です。どれでも規則は同じです。再起動のあとの位置がそれ以外のどこかから来たのなら、作ったのは checkpoint ではなく当て推量です。

逆にしやすいのが順序です。作業をして、その効果を durable にして、それから checkpoint を書きます。先に checkpoint を書けば、その隙間で落ちたときに作業がまるごと失われます。処理していないイベントを処理したと位置が言ってしまうからです。後に書けば、同じ事故はすでに処理したイベントを処理し直させます。穴ではなく重複です。少なくとも 1 回という言葉の実際はこの非対称であり、目を向けるかどうかにかかわらず、この選択はすでにしています。ですからハンドラーは二度走らせても安全にしておいてください。イベント id で作業をひもづけるか、もう一度やっても同じ結果に着く書き方にします。

残りの半分はどれだけの間隔で書くかで、好みではなく算術です。checkpoint 一回はストレージへの往復一回なので、イベントごとに書けばストリームは書き込み中心の仕事に変わり、スループットはストレージ層で頭打ちになります。逆に飛ばした checkpoint の一つ一つは、事故のあとにもう一度届くイベントです。間隔は二つ目の数字から選びます。100 件ごと、あるいは数秒ごとに書くというのは、再起動がそこまで処理し直しうるという意味です。決める前に仕事の性質も見ておくほうが無難です。安いプロジェクション 100 件と、外に出ていくメール 100 通は同じ賭けではありません。そしてハンドラーだけでなく checkpoint 自体も見張ります。ログは伸び続けているのに位置が止まったコンシューマーは静かに失敗していて、それを見せてくれる値は遅れだけです。
