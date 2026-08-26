---
title: "Bounded Staleness"
summary: "Bounded staleness は数字を添えた最終的な一貫性です。読み取りが primary より遅れることは許しますが、取り決めた時間や取り決めた書き込み数を超えて遅れることは許しません。終わりのなかった区間を、ルーターが判断に使える予算に変えます。"
category: "データ分散と一貫性"
scene: eventual-consistency
sceneStep: 4
related:
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Session Consistency
    slug: session-consistency
  - label: Replication Lag
    slug: replication-lag
  - label: Read Replica
    slug: read-replica
  - label: Health-Based Routing
    slug: health-based-routing
  - label: TTL
    slug: ttl
  - label: Cache Invalidation
    slug: cache-invalidation
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
---

最終的な一貫性で困るのは、読み取りが古くなることそのものではなく、どれだけ古くなるのかを誰も言わないことです。書き込みが集中すれば区間は止めるものなく伸び、50 ミリ秒遅れているうちは問題なかった設計が、いつのまにか 2 秒前のデータで答えます。遅延の上限はその数字を固定します。読み取りは遅れてよい、ただし何ミリ秒まで、あるいは何バージョンまでで、それ以上は許さない。上限を超えた瞬間から、それは運の問題ではなくシステムが手を打つべき問題になります。

その手立てはほぼ常にルーティングです。上限の内側にいる replica は読み取りに答え続け、外に出た replica は追いつくまでローテーションから外れ、その分のトラフィックはまだ内側にいるコピーへ回ります。HTTP のステータスの代わりに遅延を信号にするヘルスチェックと同じ形で、失敗の仕方も同じく 2 通りあります。上限を厳しくしすぎると、書き込みが集中するたびにローテーションが空になって primary に全部集まりますが、それこそ replica を用意して減らしたかった負荷です。緩くしすぎれば上限は飾りになります。一度も引っかからないので、誰も守りません。ヒステリシスも要ります。そうしないと境界の近くを行き来する replica がローテーションに出入りし、そのたびに読み取りがひとかたまり移動します。

数字を決めるのは、エンジニアリングの単位で書かれた製品上の判断です。読み手が何に気づくかを問います。価格表は 1 時間遅れても誰も気にせず、共同編集の文書は 1 秒も遅れてはならず、在庫数はその中間にあって、間違えたときに売り逃すのか売りすぎるのかで変わります。そのうえで、実際に観測される遅延と上限を突き合わせます。ふだんの遅延より低い上限は保証ではなく、忙しい午後を待っている障害です。

Azure Cosmos DB はこれを一貫性レベルとして直接提供しており、時間とバージョン数の両方で設定します。レプリケーションが守れない上限はアカウントが受け付けません。ほかの環境では自分で組み立てます。replica の位置か報告されている遅れを読み、予算と比べてルーティングし、条件を満たすコピーがなければ primary に回します。キャッシュも姿を変えた同じ発想です。TTL はルーティングを省いた遅延の上限であり、だからこそ強い読み取りを入れておいたキャッシュの複製も、有効期限のぶんだけしか新しくありません。
