---
title: "Kubernetes Lease"
summary: "Lease は coordination.k8s.io という API グループに属するふつうの Kubernetes オブジェクトで、spec に誰が握っているかと最後にいつ更新したかを記録します。コントロールプレーン自身がノードの心拍とリーダー選出をこの上で回し、アプリケーションはクライアントライブラリで同じオブジェクトを借りて使います。"
category: "分散協調"
scene: leader-election
sceneStep: 2
related:
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Distributed Lock
    slug: distributed-lock
  - label: Singleton Worker
    slug: singleton-worker
references:
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

シーンの 2 番目の段階では、リーダーの座は肩書きではなくリースであり、Kubernetes ではこの文はそのままの意味です。リースは `kubectl get` で取り出せる実在のオブジェクトです。`Lease` は `coordination.k8s.io/v1` の API グループに属し、ほかのリソースと同じく名前空間の中にあり、spec に見どころのあるフィールドを 4 つ持ちます。握っている側が自分で選んだ文字列の `holderIdentity`、座をどれだけの長さ主張するかの `leaseDurationSeconds`、最後にそう言った時刻の `renewTime`、座が何度持ち主を替えたかを数える `leaseTransitions` です。この絵のどこにもロックのサービスはありません。安全性は API サーバーの楽観的同時実行から来ます。候補は自分が読んだ `resourceVersion` を添えてオブジェクトを書き、ほかが先に書いていればその更新は競合として拒まれるので、各回の書き込みはちょうど 1 つだけが勝ちます。更新と失効について lease TTL が述べていることは、ここでもそのまま当てはまります。このページは、その意味づけが収まっているオブジェクトの話です。

ロックのサービスを期待した人が驚く性質がひとつあるので、はっきり書いておきます。サーバー側で Lease を失効させるものは何もありません。`renewTime` に `leaseDurationSeconds` を足した時刻を過ぎてもオブジェクトは消えず、主張が古びた保持者からの書き込みだからといって API サーバーが拒むこともありません。失効は候補たちが下す判断です。それぞれがオブジェクトを読み、その 2 つのフィールドを現在時刻と比べ、保持者が期限を過ぎたように見えるときだけ座を取りにいきます。だから時計についての注意は、ここでは薄まるのではなく重くなり、リーダー自身の安全を、まだオブジェクトを握っているというメモリ上の思い込みに預けられない理由もそこにあります。

この仕組みが堅いという何よりの証拠は、Kubernetes 自身がその上で動いていることです。すべてのノードは `kube-node-lease` 名前空間に Lease をひとつ持ち、kubelet が短い間隔で更新します。ノードコントローラーはノードの状態全体を受け取る代わりにそのオブジェクトを読み、ノードがまだ居るかどうかを判断します。コントロールプレーン自身の単一実行者たちも同じやり方で自分を選びます。`kube-controller-manager` と `kube-scheduler` はそれぞれ `kube-system` の Lease を争い、だからレプリカが 3 つのコントロールプレーンでも判断を下すスケジューラーは 1 つです。どのクラスターでも `kubectl get leases -A` とすれば、アプリケーションが作ったものより先にこの 2 つが並びます。

アプリケーションは、この仕組みの写しではなく同じ仕組みを借りて使います。Go では client-go の `leaderelection` パッケージが Lease リソースの上で取得と更新のループを実装し、.NET では KubernetesClient のホスティングサービス統合が同じ仕事をします。`holderIdentity` に書かれる身元はふつうポッド名なので、障害のさなかに運用者がオブジェクトを見るだけで現在のリーダーを読み取れます。付いてくる実務上の要件が 3 つあります。ポッドのサービスアカウントには、自分の名前空間の lease を get、create、update する RBAC の権限が要り、更新のループは遅い仕事とスレッドを分け合ってはならず、ワークロードはいつ座を失っても耐えられなければなりません。Lease が与えるのは API サーバーの中の主張であって、別の場所のプロセスがまだ何を信じているかについての保証ではないからです。
