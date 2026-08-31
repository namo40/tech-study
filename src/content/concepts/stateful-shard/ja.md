---
title: "Stateful Shard"
summary: "状態を持つシャードは、Map の一行を別のノードに書き換えただけでは動きません。レプリカを満たし、満たしている間に起きた書き込みを再生し、そのあとでようやく所有がひっくり返ります。呼ぶ側が感じるのはコピーの長さではなく、切り替えの長さです。"
category: "データ分散と一貫性"
scene: rebalancing
sceneStep: 4
related:
  - label: Rebalancing
    slug: rebalancing
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: Partitioning and horizontal scaling in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/partitioning-overview
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Partition Service Fabric reliable services
    url: https://learn.microsoft.com/en-us/azure/service-fabric/service-fabric-concepts-partitioning
---

状態を持たないシャードは、Map の一行を直すだけで動きます。状態を持つシャードはバイトを所有しているので、動かすことはそのままデータ移行です。ただ単位が数か月ではなく数分だというだけです。だから面白い問いは、どれだけ時間がかかるかではなく、その時間のうちどれだけを呼ぶ側が見てしまうかです。この答えこそ、移動を一度で済ませずに三拍子に分ける理由です。コピーは長くて見えず、追い付きは短くて見えず、切り替えだけが誰にでも感じられる部分です。

コピーは、まだ営業中のシャードを相手に走ります。対象ノードのレプリカがスナップショットから満ちていく間、原本は読み取りに答え、書き込みを受け続けます。だからコピーの長さは可用性と関係がなくなります。100 ギガバイトでも 100 メガバイトでも、呼ぶ側が払う値は同じです。その間ずっと原本が応答しているからです。代わりに払うものがあります。レプリカは満ち終わる前からすでに古いのです。コピー中に原本が受けた書き込みの一つひとつが、レプリカの見たことのない変更だからです。この段階には意図して制限をかけます。同じディスクと同じネットワークを本番トラフィックと奪い合っており、いちばん速いコピーが障害を起こすコピーであることは珍しくありません。

追い付きがその隙間を詰めます。原本はスナップショットを取った時点から自分の書き込みを記録してきており、その記録をレプリカに再生します。残りを短い停止一回で掃ける程度に二つが近づくまで続けます。この「十分に近い」は感覚ではなく実際のしきい値です。再生が新しい変更の到着より速くなければならず、そうでなければ隙間は縮まず、移動も終わりません。収束しないなら、それはもっと強く押せという合図ではなく、いったんやめて静かな時間にやり直せという合図です。

コストがかかる瞬間は切り替えだけです。シャードへの書き込みを止めるか列に並べ、最後の数件の変更をレプリカへ流し、Map を新しい所有者の名前に書き換え、トラフィックを再開します。この手順のすべてが短くあるべきです。停止の長さは追い付きが残した遅れが決めており、前の段階がある理由がまさにそれです。呼ぶ側はこれを短いつかえや案内し直しとして経験します。古い Map の写しを持つ側は原本に着いて案内し直されるので、原本はデータを所有しなくなったあともしばらくその案内を生かしておく必要があります。

全体を安全にする規則は二つです。どの瞬間にも所有者はちょうど一つで、それが誰かを言うのは Map です。ノードではなく、クライアントが覚えているノードでもありません。そして失敗した移動とは、原本がシャードを持ったまま終わる移動であり、半分だけできたレプリカは捨てます。捨てられた写しは二つ目の意見ではなくゴミです。切り替えは何度適用しても結果が変わらないようにし、バージョンで柵を立てて、移動の前に出た遅れたメッセージが移動のあとで適用されないようにしてください。そうすれば、失敗した移行の最悪の結果は無駄になった帯域だけで済みます。
