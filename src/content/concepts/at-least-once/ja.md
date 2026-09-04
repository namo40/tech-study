---
title: "At-Least-Once"
summary: "少なくとも一回は、損失ではなく重複を選んだ配信の契約です。誰かが ack するまでブローカーはメッセージを渡し続けるので、クラッシュの代価は穴ではなく繰り返しになります。再配送は保証が壊れた跡ではなく、保証が働いている姿です。"
category: "メッセージングとイベント処理"
scene: dead-letter-queue
sceneStep: 1
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Group
    slug: consumer-group
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Message transfers, locks, and settlement
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: MassTransit exceptions, retries and redelivery
    url: https://masstransit.massient.com/concepts/exceptions
---

シーンの第一段階では、同じメッセージがコンシューマーへ三回渡ります。システムの誤動作のように読めますが、実際は逆です。ブローカーは約束を守っています。少なくとも一回とは、誰かが終わったと確認するまでメッセージを配信するという意味で、死ぬかもしれないコンシューマーを相手にその約束を守る方法は、確認が来ないときにもう一度渡すことしかありません。増えていく配信回数は、保証が人前で働いている姿です。

ほとんどのブローカーがこの契約を提供するのは、もう一方がもっと悪いからです。作業の前に ack すれば配信は最大一回になります。途中で落ちれば誰も二度と見ないメッセージが残り、そもそも書き留められなかったものはどれだけ監視しても取り戻せません。作業の後に ack すれば、途中で落ちたメッセージは戻ってきます。前者の失敗は備えられる重複で、後者の失敗は起きたことすら分からない穴です。一方、ちょうど一回はブローカー単体で手渡せるものではありません。ack と副作用が別々のシステムに住んでいる以上、片方が済んでもう片方が済んでいない瞬間が必ず存在します。

つまり選択は ack をどこに置くかという話に落ち着き、ack は作業とそこから続く永続化がすべて終わった後に置きます。実務ではメッセージは配信されるというより貸し出されます。ブローカーはロックと期限を付けて渡し、コンシューマーが期限までに完了も更新もしなければ、メッセージはまた取得できる状態に戻ります。だから単に遅いだけのコンシューマーも、落ちたコンシューマーと同じくらい確実に再配送を生みます。ロックより長く走るハンドラーが、思わぬ重複の最もありふれた出どころである理由がこれです。

この全部の請求書は重複で、支払うのはコンシューマーです。払い方は二つあります。安いほうは、二回目でも効果が同じハンドラーを書くことです。カウンターを増やす代わりに状態を決め、insert の代わりに upsert し、何を書くにもメッセージ自身の id を鍵にします。もう一つは、処理済みを覚えておくことです。プロデューサーが付けて再配送の間も変わらないメッセージ id を鍵にし、見覚えのあるものは飛ばします。多くのシステムは結局両方を持ちます。記憶には地平があり、その先から届いた重複を止めるのはハンドラーだからです。

契約に付いてくるのは重複だけではありません。再配送は順序を崩します。失敗して戻ったメッセージは、自分より後に届いたメッセージの後ろに並ぶので、順序を前提にしていたものは到着順ではなく本文の中の何かを鍵にする必要があります。そして再配送は、何かが上限を掛けない限り終わりません。配信回数の上限と dead-letter queue が入るのはここです。それらがなければ、いつも失敗するメッセージは永遠に再配送され、少なくとも一回は約束から回し車に変わります。

.NET ではこれが Azure Service Bus の受信モードの話になります。`ReceiveMode.PeekLock` が少なくとも一回の経路です。作業の後の `CompleteMessageAsync`、すぐ返すときの `AbandonMessageAsync`、ハンドラーが正当に長くかかるときの `RenewMessageLockAsync`、そしてプロセスが消えれば黙って切れるロックが一組になっています。`ReceiveMode.ReceiveAndDelete` は最大一回の経路で、メッセージを失う代価が二回処理する代価より安い場所でだけ正しい選択です。テレメトリーのストリームがその例です。RabbitMQ は同じ線を `autoAck` で引きます。切っておき、作業の後に ack し、意図して返したいときは requeue を付けた `basic.nack` を使います。
