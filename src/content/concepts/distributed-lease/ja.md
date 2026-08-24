---
title: "Distributed Lease"
summary: "分散 lease は有効期限が付いたロックです。保持者は決まった時間だけキーを持ち、延長を要求し続けなければなりません。理由が何であれ要求が途切れれば、キーは次に待っている側へ戻ります。"
category: "分散協調"
scene: distributed-lock
sceneStep: 2
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Split Brain
    slug: split-brain
  - label: Lock
    slug: lock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
---

単一プロセス内のロックはコードが解放するまで保持され、スレッドが死ねばランタイムが後片付けをします。ネットワークの向こう側にはそれをしてくれる存在がいません。あるインスタンスがキーを取ったあとに電源が落ちれば、キーは永遠に取られたままになり、ほかのインスタンスも永遠に待ち続けます。有効期限はその問題への答えであり、分散ロックが実は lease である理由でもあります。キーは作業が終わるまでではなく、決まった時間だけ与えられます。

だからこそ TTL は既定値を写せば済む設定ではなく、実際の設計判断になります。短すぎれば、ただ遅いだけの保持者が作業の途中でキーを失います。長すぎれば、落ちた保持者がその時間ぶん全員を塞ぎます。ふつうは臨界区間の所要時間の p99 より十分に長く TTL を取り、その一部の地点ごとに更新して、本当に危うくなる前に更新が何度か失敗できる余裕を残します。シーンでは TTL は減っていく円弧として描かれ、更新がそれを満たし直します。TTL の 60% ごとに更新すれば、キーが危うくなるまでに 2 回分の更新を落とす必要があります。

更新は条件付きでなければなりません。「このキーの期限を延ばせ」は誤った操作です。要求が届くころにはキーがすでに別の相手のものになっているかもしれず、そのとき他人の lease を延ばすのは何もしないより悪いからです。正しい操作は「値がまだ自分の所有者 id であるときだけこのキーを延長する」であり、Redis では小さな Lua スクリプトとして、Kubernetes では Lease オブジェクトの resource version として表現されます。解放も同じ形で、まだ自分のものであるときだけ削除します。

本当に重要な失敗は、更新の応答が返ってこない場合です。それは lease が消えたと教えてくれるわけではなく、まだ握っていることを証明できないと告げているだけです。しかしリソースから見れば、その 2 つは同じことです。安全な対応は直ちに作業を止め、その時点以降をすべて所有していない状態として扱うことです。更新の失敗をログに残して作業を続けるコードこそが、書き手を 2 つにするコードです。lease は数秒前にすでに切れているかもしれず、別の相手がもう働いているかもしれません。

これだけで lease が安全になるわけではありません。有効期限は、死んだ保持者がシステムを塞げる時間の上限を決める活性の性質にすぎず、生きていながら自分がキーを持っていると取り違えている保持者については何もしません。その隙間を埋めるのが fencing token であり、トークンのない lease は書き手が 2 つになる確率を下げるだけで、なくしてはくれません。
