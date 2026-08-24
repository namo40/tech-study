---
title: "Read-Your-Writes"
summary: "Read-your-writes は、ほかの変更は見落としても、そのセッション自身の変更だけは必ず見えるという保証です。ユーザーが保存した直後でも replica を読ませてよくするのが、この保証です。"
category: "データ分散と一貫性"
scene: replication-lag
sceneStep: 3
related:
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Sticky Session
    slug: sticky-session
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

上がってくる報告はいつも同じ形をしています。ユーザーがプロフィールを直して保存し、画面に戻ってくると、置き換えたはずの古い名前が見えます。失敗したものは何もありません。書き込みは primary へ行き、再読み込みはまだそれを適用していない replica へ行っただけです。Read-your-writes は、複製が最新であるふりをせずに、この 1 つの場合だけを取り除く保証です。ほかの人の変更はこのセッションから見えないままかもしれませんが、自分の変更が見えないことはありません。

保ち方は 2 つあり、何を支払うかが違います。1 つ目は振り分けです。このセッションが何かを書いたことを覚えておき、その後の数秒はそのセッションの読み取りを primary へ送ります。cookie や分散キャッシュの項目で簡単に実装でき、外したはずの読み取りの一部を primary が引き受ける代償があり、その数秒が遅れより短いと保証は静かに成り立たなくなります。2 つ目は待つことです。書き込みが受け取った位置を持っておき、replica がその位置に達してから読み取りを送ります。primary には何も乗らず、代償は読み取りの遅延に移るので、この方式には制限時間と primary への逃げ道が要ります。

どちらが合うかはエンドポイント次第です。保存の直後にユーザーが着く画面なら振り分けが既定として適しています。範囲がはっきりしていて、目に見えて、考えやすいからです。数百ミリ秒なら待てるが primary には触りたくないバッチ処理や API クライアントなら待つほうが向きます。データベースが直接用意していることもあります。Azure Cosmos DB のセッション整合性レベルがまさに 2 つ目の方式で、クライアントごとにセッショントークンを持ち回ります。ほかのマネージドサービスも replica の位置を公開しており、比べられるようになっています。

実際に保証が保たれるかは 2 点で決まります。1 つは、書き込みと読み取りをまたいでセッションを見分けられることです。1 台のサーバー上の変数ではなく、cookie、クレーム、ヘッダーである必要があります。そうでないと 2 番目の要求は 1 番目を知らない場所に着きます。もう 1 つは、その範囲を当てずに測ることです。遅れが決めておいた数秒を越えて伸びると、そもそも replica を置きたくさせたその負荷のさなかに、保証は消えています。
