---
title: "Exactly-Once"
summary: "ちょうど一回はネットワークの性質ではなく境界の性質です。一つのトランザクション範囲の中ならブローカーは読み取りと書き込みと確認応答をひとかたまりにできますが、副作用がその範囲を出た瞬間に手元に残るのは最低一回配達と、二度実行されても壊れないハンドラーです。"
category: "メッセージングとイベント処理"
scene: poison-message
sceneStep: 2
related:
  - label: Poison Message
    slug: poison-message
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Retry Queue
    slug: retry-queue
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Service Bus duplicate detection
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Service Bus message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

場面の第二段は、ちょうど一回が存在しない世界の絵であり、その要点は、その世界が正しく動いているという点にあります。メッセージがコンシューマーへ降りて失敗し、そのままキューの先頭へ戻ります。誰も間違ったことはしていません。コンシューマーが確認応答をしなかった以上、ブローカーから見ればその配達は途中で失われたかもしれず、行方の分からないメッセージに対して安全な行動は、もう一度配達することだけです。再配達は故障ではありません。再配達は保証が働いている姿です。

最低一回とはそれがすべてで、ネットワークが無償でくれるのもそこまでです。くれないのは残りの半分です。確認応答もメッセージなので帰り道で失われることがあり、ブローカーは「コンシューマーが受け取らなかった」と「コンシューマーは仕事を終えたが応答が消えた」を最後まで区別できません。その二つを区別できるプロトコルはもう一往復を必要とし、その往復も同じ問題を抱えています。二人の将軍問題が帽子を変えただけであり、工学で消せる種類のものではありません。

では、ベンダーが売り続けるちょうど一回はどこから来るのでしょうか。境界から来ます。入ってきたメッセージと、それが起こした状態変更と、確認応答が一つのトランザクションでコミットされるなら、三つとも起きたか一つも起きなかったかのどちらかです。再配達が来ても状態はすでにコミット済みで位置も動いているので、重複が生まれようがありません。Kafka のトランザクションは Kafka の中で完結する読み取り、処理、書き込みのループに対してこれを実現し、ブローカーの重複検出ウィンドウはメッセージ id をしばらく覚えておく弱い版を実現します。どちらも本物です。そしてどちらも、それを実装したシステムの縁で止まります。ハンドラーがカードを切り、メールを送り、外部 API を呼んだ瞬間、副作用はトランザクションの外であり、保証も消えます。

実務での読み方は、ちょうど一回の配達を求めるのをやめて、ちょうど一回の結果を作る側へ移ることです。メッセージごとに変わらない id を与え、その id をそれが起こした作業と同じトランザクションに記録します。二度目の配達はその記録を見つけて、何もせずに帰ります。できるところでは書き込み自体を繰り返しても安全にし、盲目的な insert ではなくメッセージ id を鍵にした upsert にします。外の世界と話す面は狭く保ち、そこに idempotency キーを付けます。そうすれば再配達は無料になり、キューは約束を守れます。この話が一番効くのは、別の理由で戻り続けるメッセージです。毒メッセージも再配達されますし、繰り返しても結果が同じにならないハンドラーは、壊れたペイロード一つを半端に終わった副作用の連続に変えてしまいます。
