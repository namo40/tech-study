---
title: "Bounded Staleness"
summary: "Bounded staleness は数字を添えた結果整合性です。読み取りがプライマリより遅れることは許しますが、取り決めた時間や取り決めた書き込み数を超えて遅れることは許しません。終わりのなかった区間を、ルーターが判断に使える予算に変えます。"
category: "データ分散と整合性"
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

結果整合性で困るのは、読み取りが古くなることそのものではなく、どれだけ古くなるのかを誰も言わないことです。書き込みが集中すれば区間は止めるものなく伸び、50 ミリ秒遅れているうちは問題なかった設計が、いつのまにか 2 秒前のデータで答えます。Bounded staleness はその数字を固定します。読み取りは遅れてよいが、何ミリ秒まで、あるいは何バージョンまでと決め、それ以上は許さない、というものです。上限を超えた瞬間から、それは運の問題ではなくシステムが手を打つべき問題になります。

その手立てはほぼ常にルーティングです。上限の内側にいるレプリカは読み取りに答え続け、外に出たレプリカは追いつくまでローテーションから外れ、その分のトラフィックはまだ内側にいるコピーへ回ります。HTTP のステータスの代わりに遅延を信号にするヘルスチェックと同じ形で、失敗の仕方も同じく 2 通りあります。上限を厳しくしすぎると、書き込みが集中するたびにローテーションが空になってプライマリに全部集まりますが、それこそレプリカを用意して減らしたかった負荷です。緩くしすぎれば上限は飾りになります。一度も引っかからないので、誰も守りません。ヒステリシスも要ります。そうしないと境界の近くを行き来するレプリカがローテーションに出入りし、そのたびに読み取りがひとかたまり移動します。

数字を決めるのは、エンジニアリングの単位で書かれた製品上の判断です。読み手が何に気づくかを問います。価格表は 1 時間遅れても誰も気にせず、共同編集の文書は 1 秒も遅れてはならず、在庫数はその中間にあって、間違えたときに売り逃すのか売りすぎるのかで変わります。そのうえで、実際に観測される遅延と上限を突き合わせます。ふだんの遅延より低い上限は保証ではなく、忙しい午後を待っている障害です。

Azure Cosmos DB はこれを整合性レベルとして直接提供しており、バージョン数 K と時間 T の両方で設定します。下限は単一リージョンのアカウントで 10 書き込みまたは 5 秒、複数リージョンのアカウントで 100,000 書き込みまたは 300 秒です。さらに、上のルーティングとは反対側からもこの上限を守らせます。古さはリージョン間でだけ確認され、あるパーティションの遅れが K か T を超えたリージョンは、追いつくまでそのパーティションへの書き込みがスロットリングされます。つまり払うのは読み手ではなく書き手です。ほかの環境では読み取り側で自分で組み立てます。レプリカの位置か報告されている遅れを読み、予算と比べてルーティングし、条件を満たすコピーがなければプライマリに回します。キャッシュも姿を変えた同じ発想です。TTL はルーティングを省いた遅延の上限であり、だからこそ強い読み取りを入れておいたキャッシュの複製も、有効期限のぶんだけしか新しくありません。
