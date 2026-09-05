---
title: "Hot Partition"
summary: "シャード 1 つがトラフィックの大半を受け、隣は遊んでいる状態です。上限を決めるのはクラスターの大きさではなくキーの分布であり、そのキーが順序まで保証しているなら、遅れているレーンにはコンシューマーをいくら足しても効きません。"
category: "メッセージングとイベント処理"
scene: ordering
sceneStep: 3
related:
  - label: Ordering
    slug: ordering
  - label: Event Stream
    slug: event-stream
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: Competing Consumers
    slug: competing-consumers
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Offset
    slug: offset
  - label: Backpressure
    slug: backpressure
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Load Balancer
    slug: load-balancer
references:
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

ホットパーティションとは、偏ったキー分布を内側から見た姿であり、シーンの 3 番目のステップがそのすべてです。`acct 7` のイベントが 6 つ 1 秒のうちに届き、P0 のバックログはゲージの最終段を越え、その間 P1 は空の行のまま座っています。壊れているものはありません。ルーティング規則は言われたとおりに動き、コンシューマーたちは 2 番目のステップと同じ速度で回り、システムは依然として半分しか働いていません。ボトルネックは容量ではなく、トラフィックの形です。

普通の過負荷と違うのは、いつもの処方が効かないことです。キューを空けるにはコンシューマーを増やしますが、パーティションは一度に 1 つのコンシューマーが所有します。その所有こそが順序保証です。ですから P0 にコンシューマーをもう 1 つ足しても、何も起きないか、パーティションに分けた理由だったその性質が壊れるかのどちらかです。キーが同じままならパーティションを増やしても同じです。1 つのキーのハッシュは、レーンが何本あろうと 1 本のレーンに落ちるからです。シーンは 2 つの事実を一画面で見せます。P1 は空いていて、それでも使えません。約束が `acct 7` を P0 に釘付けにしているからです。

原因はほとんどの場合、テールの長いキーです。1 つのテナントが他の 10 倍あるテナント id、1 つの地域が本拠地であるリージョン、大半が一機種であるデバイス種別、そして典型例として、もともと偏っているエンティティがあります。有名人のアカウント、看板商品、すべての出荷が出る倉庫 1 つです。均一なハッシュは、均一でないキーを直してくれません。ハッシュはキーをパーティションへ均等にまくだけで、キー 1 つがイベントの大半を背負っているという事実には何もしません。

ですから解決はインフラより上、キーが何であるかにあります。順序の要求が口座単位なら、キーは口座であり、忙しい口座は前もって織り込むべき忙しいレーンです。要求が思ったより弱いなら、つまりストリームのイベントの大半が実は互いの順序を必要としていないなら、トラフィックが散るまでキーを狭めれば済みます。シーンの 4 番目のステップがそれです。本当に口座単位で、本当に 1 つの口座が大きすぎるなら、残る手は 2 つです。ホットなキーを下位のレーンへ割る複合キーを使って後段で直列化し直すか、そのキーの上限を低いものとして受け入れて隔離し、そのバックログが他全員のレイテンシにならないようにするかです。どれもスライダーではありません。偏りは一級の指標として見てください。合計ではなく、パーティションごとの遅延とパーティションごとのスループットです。平均は、このページが語る失敗をちょうど覆い隠します。
