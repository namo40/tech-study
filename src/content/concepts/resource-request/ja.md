---
title: "Resource Request"
summary: "resource request はコンテナーが要求する取り分です。スケジューラーがノード上でそのコンテナーのために確保する CPU とメモリーであり、ポッドがどのノードに置かれるか、混んだノードでどれだけを保証されるか、オートスケーラーの CPU パーセントが何に対するパーセントかを決めます。"
category: "コンテナーとオーケストレーション"
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Readiness Probe
    slug: readiness-probe
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: assign CPU resources to containers"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
---

シーンの 4 番目のステップは CPU の数値の隣に `requests: 500m` を出します。このラベルは見た目より多くの仕事をしています。CPU 95% のポッドはノードの 95% を使っているのではありません。半コアの 95% を使っているのです。`500m` が半コアで、それがこのポッドの要求した取り分だからです。request を変えれば、ポッドのやることは同じままシーンのすべてのパーセントが一緒に変わります。

request は予約です。スケジューラーはノードにすでに載っているものの request を合計し、残りに収まる場所にだけポッドを置きます。つまり request が、ポッドがどのノードに置かれるか、そもそも置けるかを決めます。上限ではありません。ノードが空いていれば、コンテナーは要求した以上に使ってかまいません。request が保証するのは下限です。ノードが混み合うと CPU は request に比例して分けられるので、`500m` を要求したコンテナーは飽和した機械でも最低限それだけは受け取ります。

この下限があるために、数値は二度効いてきます。低く取りすぎればポッドは混んだノードに置かれ、隣人が忙しくなった瞬間に押されます。症状は、自分のトラフィックではなく他のチームが何をデプロイしたかで動くレイテンシです。高く取りすぎれば、スケジューラーは実際に使われるより大きな空きを探すことになり、誰も使わない予約でノードが埋まって、クラスターオートスケーラーは中身のない予約のために機械を買います。

メモリーでも request は同じ意味の予約ですが、間違えたときの結果はより鋭いものになります。CPU は圧縮できるので、取り分以上を欲しがるコンテナーは遅くなるだけです。メモリーはそうではないので、使い切ったノードはポッドを退避させ、request を超えて使っている量が大きいものから退避させます。実際のワーキングセットを正直に映したメモリー request が、ポッドをその一覧から外してくれます。

シーンが描く依存関係が、そのままオートスケーラー側の話です。`averageUtilization: 60` は request の 60 パーセントを指し、ポッドごとの値を合計してレプリカ数で割ったものです。CPU request のないコンテナーには分母がないので、この指標はそもそも存在せず、HorizontalPodAutoscaler は推奨値を計算できないと報告します。request と limit は合わせてポッドの QoS クラスも決めます。両方が等しければ `Guaranteed`、request だけで対になる limit がなければ `Burstable`、どちらもなければ `BestEffort` で、最後のものがノードの逼迫時に真っ先に退避させられます。

.NET では、この数値は当てずっぽうではなく測って決めます。本番に近い負荷でワークロードを回しながら、プロセスの CPU 時間（メトリクスなら `dotnet.process.cpu.time`、`dotnet-counters` なら `cpu-usage`）と GC のヒープサイズを見て、頂点ではなく定常状態の近くに request を合わせます。頂点を受け止めるためにあるのが余裕容量とオートスケーラーだからです。.NET では `ServerGarbageCollection` を変えるたびにメモリー request を見直しておくとよいでしょう。サーバー GC はコンテナーから見えるメモリーを基準にヒープの大きさを決め、その数の上限を CPU に置くからです。
