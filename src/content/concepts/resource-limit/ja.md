---
title: "Resource Limit"
summary: "resource limit はコンテナーが押さえつけられる天井です。CPU limit を超えるとスロットリングされ、メモリー limit を超えると終了させられますが、2 つの壊れ方はまるで似ていません。一方は遅くなったサービスで、もう一方は消えたプロセスです。"
category: "コンテナーとオーケストレーション"
scene: horizontal-pod-autoscaler
sceneStep: 4
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Resource Request
    slug: resource-request
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Tail Latency
    slug: tail-latency
  - label: Garbage Collection
    slug: garbage-collection
  - label: Elasticity
    slug: elasticity
references:
  - title: "Kubernetes: resource management for pods and containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes: quality of service for pods"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
  - title: "Run .NET applications in containers"
    url: https://learn.microsoft.com/en-us/dotnet/core/docs/containers/
---

シーンの 4 番目のステップに出てくる request は、コンテナーに約束された下限です。limit はコンテナーが押さえつけられる天井で、2 つは同じコンテナーの同じブロックに書かれるため、それだけ混同されやすくもあります。request はスケジューラーが確保するもので、limit はランタイムが強制するものです。

CPU limit はスロットリングで強制されます。カーネルは 100 ミリ秒の周期ごとにコンテナーへ割り当てを与え、割り当てが尽きると次の周期が始まるまでスレッドを止めます。エラーにもならず、アプリケーションがログを書くこともないので、痕跡は遅延だけです。p50 は問題なさそうに見えるのに、p99 に 100 ミリ秒の段差ができます。瞬間的に混むサービスで CPU limit を request の近くに置くことは、誰も説明できない裾の、よくある原因の 1 つです。ダッシュボードが見せる平均使用率は、実際に害をなしている limit の近くまで届かないからです。

メモリー limit は終了で強制されます。プロセスをスロットリングしてメモリーを減らさせることはできないので、超えたコンテナーは終了させられ、pod には `OOMKilled` が記録され、再起動は遅延ではなく可用性の問題として現れます。この違いは身につけておく価値があります。低すぎる CPU limit はサービスを悪くし、低すぎるメモリー limit はサービスを消します。

2 つは request と合わせて QoS クラスも決めます。limit を request と等しくすると `Guaranteed` になり、遅延に敏感なワークロードが望むのはこちらです。確保した分より下にスロットリングされることがなく、追い出される順番も最後です。limit を request よりかなり高く置くと `Burstable` になり、瞬間的な混みが短くノードに本当に余裕があるときは効率的ですが、複数のコンテナーが同時に混むときは危険です。

.NET ではメモリー limit は柵にとどまらず、入力値でもあります。ランタイムは cgroup の limit を読み、それを基準に GC ヒープの大きさを決めます。既定で limit の 75% である `GCHeapHardLimitPercent` が、コレクターが予算の上限とみなす値です。したがってメモリー limit を上げると .NET は収集の回数を減らし、より多く使います。たいていはそれが望みですが、古い limit の下で取ったメモリーのグラフを見て選んだ limit は誤りになるということでもあります。サーバー GC はコンテナーから見える CPU を基準にヒープの数も決めるので、CPU limit が GC の形まで静かに変えます。

たいていのサービスに現実的な設定は、メモリー limit をメモリー request と等しくし、CPU limit は置かないか CPU request より十分高く置くことです。この組み合わせなら、pod を追い出し一覧から外してくれるメモリーの保証を得ながら、裾に段差を作るスロットリングは避けられます。どちらを選ぶにせよ、`container_cpu_cfs_throttled_seconds_total` と pod の再起動理由は必ず見るようにしてください。どちらの壊れ方もプロセスの中からは見えません。
