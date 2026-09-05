---
title: "Cluster Autoscaler"
summary: "Cluster Autoscaler はスケジュールできないポッドを見つけて機械を足し、もう誰も必要としないノードはドレインして返します。使用量ではなくリクエスト値から計画するので、買ってくる規模はポッドに書かれた数字と同じだけしか正直になりません。"
category: "コンテナーとオーケストレーション"
scene: elasticity
sceneStep: 4
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Rolling Update
    slug: rolling-update
  - label: Load Balancer
    slug: load-balancer
  - label: Backpressure
    slug: backpressure
  - label: Throughput
    slug: throughput
references:
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Cluster Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler
  - title: "Use the cluster autoscaler in Azure Kubernetes Service"
    url: https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler
---

4 番目のステップは、絵がソフトウェアの話であることをやめる場所です。レプリカ 3 つが 5 つになり、下の機械 2 つはすでに満杯で、5 つ目のポッドには立つ場所がありませんでした。失敗したのでも、断られたのでもありません。`pending` になりました。Kubernetes がそのポッドを受け入れはしたが置き場所がない、と言っている状態です。クラスターオートスケーラーがすることはすべて、この 1 つの条件から始まります。

引き金はスケジューラーが収められなかったポッドであって、忙しそうに見えるノードではありません。この区別が設計のすべてです。リクエスト値の 90% まで埋まったノードは何の問題でもなく、何も起きません。スケジュールできないポッドが 1 つあれば問題であり、何かが起きます。オートスケーラーはその pending のポッドを持って、自分が管理するノードグループごとに、その形のノードを 1 つ足せばこのポッドを置けるかを尋ねます。置けるグループがあれば、滞りを解消できる最小の数だけそのグループのサイズを上げます。残りはクラウドプロバイダーがやり、1、2 分後にノードが登録され、スケジューラーがそれに気づき、ポッドが置かれます。シーンではその 2 つの出来事が、機械が現れる瞬間とポッドがその上に立つ瞬間です。

慎重でなければならないのは縮小のほうで、だからわざと遅くしてあります。ノードは、その上に乗ったリクエスト値の合計がしばらく閾値を下回って初めて候補になり、上のポッドをすべて別の場所へ動かせるときにだけ実際に取り除かれます。それを妨げるポッドはよくあり、たいていは理由があります。作り直してくれるコントローラーがないもの、ローカルストレージを使うもの、動かすと中断予算を破ってしまうもの、退避させてはいけないと運用者が印を付けたものです。ノードが実際に去るときは、まずコードンされ、手動のドレインが守るのと同じ予算を通してポッドが退避し、それから機械が返されます。シーンはそれを、空になり `drain` の印が付き、そして消えるセルとして描きます。

このページを前のページに結ぶ言葉はリクエスト値です。オートスケーラーはスケジューリングを真似てみるだけで、スケジューリングはリクエスト値を読みます。だから買ってくる容量は、ポッドが何をするかではなく、ポッドに書かれた数字の関数です。リクエスト値を膨らませたワークロードは要らないノードを抱え続け、縮小もしません。書類の上ではどのノードもゆったり埋まっているからです。リクエスト値が足りないワークロードは収まっているように見えて機械を買わなすぎ、スケジューラーが余裕があると思ったノードの上での絞りやメモリー不足による強制終了として真実を知ります。どちらもオートスケーラーの不具合には見えません。どちらも請求書か障害として見えます。

この仕組みがどれだけうまく回るかは、実務的な二点で決まります。1 つはノードグループの形です。とても大きな機械だけのグループは、拡張の最小単位を高くし、縮小の最小単位を稀にします。小さな機械だけのグループは、ノードごとにシステム側へ取られる割合が大きくなり、ノードあたりのポッド数の上限にも早く当たります。たいていは形の違うグループを 2 つほど用意して、オートスケーラーに選ばせます。もう 1 つは起動の経路です。ノードを 1 つ足すのは秒ではなく分の話なので、急増をすぐ吸収しなければならないワークロードには余裕容量が要るか、本当の仕事が押しのけられる低い優先度の場所取りポッドが要ります。すでに支払った容量を、どいてくれる何かに持たせておくわけです。

シーン全体を正直にまとめるとこうなります。弾力性は容量をただにも即座にもしてくれません。請求書の大きさを仕事の大きさの関数にしてくれるだけで、それも設計で受け止めるべき遅れを伴い、各層が互いに手渡す数字が本当であるときにかぎります。
