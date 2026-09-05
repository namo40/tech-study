---
title: "Vertical Pod Autoscaler"
summary: "Vertical Pod Autoscaler はコンテナーが実際に使う量を見て、CPU とメモリーのリクエスト値を書き直します。正確さの代価は再起動であり、そうして得た正直な数字がスケジューラーとクラスターオートスケーラーの計画の土台になります。"
category: "コンテナーとオーケストレーション"
scene: elasticity
sceneStep: 3
related:
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
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
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "Vertical Pod Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
---

シーンの 3 番目のステップで変わらないものを見てください。カプセルの数です。代わりに 2 つの形が変わります。1 つはずっと低く描かれていました。与えられた箱が、いましている仕事より小さいからです。もう 1 つはずっと高く描かれていました。一度も触ったことのない広さを与えられているからです。2 つは同じ欠陥を両端から見たものであり、どちらもポッドを 1 つ足して直るものではありません。

リクエスト値は 2 つの方向への約束です。スケジューラーには、このコンテナーのためにノードをどれだけ空けておくかを伝え、kubelet には、ノードが混んでいるときにこのコンテナーが CPU をどれだけ受け取る資格があるかを伝えます。その約束が現実と合っているかは誰も確かめません。1 年前にマニフェストへ書き込んだ数字はその後のすべてのデプロイをそのまま通り抜け、その下のワークロードは少しずつずれていきます。シリアライザーが変わり、ペイロードが大きくなり、キャッシュが育ち、依存先が速くなります。垂直オートスケーラーはその輪を閉じる部品です。ワークロードに属するコンテナーの実際の使用履歴を読み、直近 5 分ではなく分布から推奨値を計算し、それを適用することもできます。

高くつくのは適用のほうです。Kubernetes の歴史の大半において、ポッドのリソースはいったん受け入れられたら変更できませんでした。だからリクエスト値を変えるとは、ポッドを退避させ、コントローラーに新しい数字で代わりを作らせることでした。シーンが是正に再起動という代価を課すのはそのためです。カプセルが下がり、戻ってきて、戻ってきたときに正しいサイズになっています。その後にインプレースのリサイズが入りました。Kubernetes 1.35 で安定版になり、1.33 以降のクラスターでは VPA 1.4 の `InPlaceOrRecreate` モードからオートスケーラー経由で使えます。多くの場合で再起動をなくしてくれますが、どこでも使えるわけではありません。リサイズポリシー、リソース、コンテナーランタイムによって変わりますし、インプレースでリサイズできないときは、オートスケーラーがポッドの再作成に戻ります。退避を前提に計画し、インプレースは前提ではなく改善として扱ってください。

推奨値は、何も適用させないとしても持つ価値があります。更新モードを `Off` にして動かすと、推奨オブジェクトだけを作り、何も変えません。測定の道具になるわけです。この 1 週間、コンテナーごとのメモリーの 90 パーセンタイルが実際にいくつだったかを教えてくれます。リクエスト値の半分が必要量の 2 倍で、いくつかは危ういほど足りない、という事実をここで初めて見つけるチームは珍しくありません。信頼できるコントローラーである前に、読む価値のあるレポートです。

残りより重い注意点が 2 つあります。1 つ目は、垂直オートスケーラーと水平オートスケーラーを同じ信号に向けてはいけないということです。片方が CPU が高いからとレプリカを足し、もう片方が使用量が高いからと CPU のリクエスト値を上げるなら、2 つは同じ数字に反応しながら互いの入力を変えていることになります。よくある分担は、水平を CPU か別の負荷指標に、垂直をメモリーだけに向けるか、垂直を推奨モードで回すことです。2 つ目は、退避は他の中断と同じ中断だということです。レプリカが 1 つしかなく中断予算もないワークロードは、リクエスト値が是正される瞬間にただ少しのあいだ消えます。是正もドレインと同じ保護の後ろに置くべきです。

これが脚注ではなく真ん中のステップである理由は、是正された数字がこの次にどこへ行くかにあります。他のすべての層はリクエスト値から計画します。スケジューラーは使用量ではなくリクエスト値でノードに何が収まるかを決め、クラスターオートスケーラーは使用量ではなくリクエスト値で機械を何台買うかを決めます。リクエスト値が膨らんだワークロードは要らない機械を買い、リクエスト値が足りないワークロードは余裕がありそうに見えたノードの上で絞られたり殺されたりするポッドを抱えます。サイズの是正は片づけの作業ではありません。他の 2 つのオートスケーラーが計算に使う入力です。
