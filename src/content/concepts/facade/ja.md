---
title: "Facade"
summary: "facade は、移行が古いシステムの前に置く唯一の正面玄関です。実際にどちらが応答するかは、呼び出し側に見える変更ではなくルーティングの判断になります。"
category: "アプリケーションアーキテクチャ"
scene: strangler-fig
sceneStep: 1
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Adapter
    slug: adapter
  - label: Endpoint Routing
    slug: endpoint-routing
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Gateway Routing pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-routing
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

facade は入れた日には何もしません。すべての経路がまだ古いシステムを指し、応答はバイト単位で以前と同じで、呼び出し側に伝えることもありません。それこそが狙いです。移行の第一歩は、火曜の午後に出して 1 分で戻せる種類のものであるべきです。そのあとのすべてが、facade が退屈であることの上に立っているからです。代わりに手に入るのは継ぎ目です。すべてのリクエストが 1 か所から入るようになると、「これはどちらが答えるのか」という問いの答えが設定に書かれます。そして設定は、この建物でいちばん安く変えられるものです。

守るべき規律は、facade は経路を決めるだけでほかは何もしない、ということです。新システムにまだない項目 1 つ、古いシステムが必要とする再試行、ついに更新されなかったクライアント 1 つのためのヘッダー書き換え。それらを facade に置きたくなる気持ちはとても強いものです。1 つずつは小さくても、集まればルーティング層は、自分のデプロイリスクと自分のバグを持ち、しかし持ち主のいない 2 つ目のシステムになります。ビジネスロジックの形をしたものは、facade の後ろ、その機能を所有するシステムに置きます。2 つのシステムがモデルについて本当に食い違うなら、それは翻訳であり、翻訳は正面玄関ではなく新システム側の anti-corruption layer が引き受けます。

facade はリクエストの行き先を決めるので、移行が進むようすを見られる唯一の場所でもあります。切り替えた経路は、古い経路を止めるまで両側を計測しておきます。経路ごと宛先ごとのリクエスト数、エラー率、レイテンシーを見れば、「新しい customers のコードのほうが遅い」をユーザーから聞くのではなくグラフから読み取れます。そしてルーティング表は読める大きさに保ちます。機能ごとに 1 行の表は移行がどこまで進んだかを一目で伝えますが、規則が 400 個ある表は何も伝えません。それは、facade が置き換えようとしていたものそのものになりつつある最初の兆候です。
