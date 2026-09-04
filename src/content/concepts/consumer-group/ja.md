---
title: "Consumer Group"
summary: "consumer group は Kafka における競合するコンシューマーの形で、競う単位がメッセージではなくパーティションです。1 つのパーティションはグループ内のちょうど 1 人に割り当てられるので、キーの中の順序は保たれ、並列度はパーティション数で頭打ちになります。"
category: "メッセージングとイベント処理"
scene: competing-consumers
sceneStep: 4
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Partition
    slug: partition
  - label: Message Key
    slug: message-key
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
references:
  - title: Kafka consumer group protocol
    url: https://kafka.apache.org/documentation/#consumer_rebalance_protocol
  - title: Confluent consumer group basics
    url: https://developer.confluent.io/courses/architecture/consumer-group-protocol/
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

Kafka のトピックは固定されたパーティションの集合で、consumer group は同じ `group.id` を共有し、それらを分担して読むプロセスの集まりです。ブローカーは 1 つのパーティションをグループ内のちょうど 1 人に割り当てるので、キューのメッセージが 1 度だけ処理されるのと同じように、メッセージはグループごとに 1 度だけ処理されます。ただし配られるのはメッセージではなくパーティションです。ここから 2 つのことがすぐに出てきます。同じキーのメッセージは同じパーティションにあるので、同じメンバーへ順番どおりに渡ります。これが競合するコンシューマーが本来手放すキーごとの順序です。そしてグループの役に立つメンバー数はトピックのパーティション数を超えられません。10 個のパーティションを読むグループの 11 人目は何も受け取らず待つだけです。

割り当ては恒久的ではありません。メンバーが加わる、抜ける、heartbeat を止めると、グループはリバランスしてパーティションを配り直し、受け継いだ側はそのグループの最後のコミットオフセットから読み直します。この設計ではそのオフセットが確認応答にあたります。だから作業の前にコミットすればメッセージを失い、作業のあとにコミットすれば読み直します。経路が違うだけで、結論は少なくとも 1 回です。リバランスは停止でもあるので、それがどれだけ邪魔になるかを決める設定は知っておく価値があります。`max.poll.interval.ms` は 1 人のメンバーが 1 バッチに留まれる時間で、これを超えるとグループはそのメンバーが消えたとみなします。静的メンバーシップは再起動したポッドの割り当てをそのまま返し、全体が入れ替わるのを防ぎます。協調的なアサイナーは動かす必要があるパーティションだけを動かします。

グループが何をもたらすかは、ほとんどキーが決めます。キーがパーティションを選び、パーティションがメンバーを選ぶので、結局キーが順序の保証と負荷の配分の両方を決めます。顧客 id で分けたトピックでは、忙しい顧客 1 人が熱いパーティション 1 つであり飽和したコンシューマー 1 つであって、残りは遊びます。パーティションは増やせても減らせず、増やすと既存のキーの割り当てが計算し直されます。ですからパーティション数は事実上取り消しにくい決定で、たいていは今の流量に必要な数より多めに置きます。グループ同士は互いに独立でもあります。同じトピックに付いた 2 つ目のグループは自分のオフセットですべてのメッセージを読み直し、これによって 1 本のイベントストリームが、互いに競合しない複数のサービスを支えます。
