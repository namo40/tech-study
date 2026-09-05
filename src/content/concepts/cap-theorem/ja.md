---
title: "CAP Theorem"
summary: "CAP 定理は、ネットワーク分断がレプリカを引き離したとき、2 つのうち 1 つを選ばなければならないと言います。最新でないかもしれない値で答え続けるか、合意が戻るまで答えを断るかです。PACELC はそこに日常の半分を加えます。どこにも分断がなくても、すべての読み取りでレイテンシと整合性を交換しているからです。"
category: "データ分散と整合性"
scene: cap-theorem
steps:
  - title: "分断は起こります。選ばなければ 2 つに割れます"
    text: "仮定の分断がリンクを切り、2 つのレプリカは答え続けます。2 つの値は離れていき、1 つの質問に正直な答えが 2 つあります。分断は選択肢ではありません。来たときには整合性か可用性のどちらかを取ります。選ばないことは両方を選ぶことです。"
  - title: "整合性を選べば、一部は待ちます"
    text: "分断の下で、合意に届かない側は断ります。間違った答えより無回答のほうがましだからです。差し出した答えはすべて唯一の真の値で、代金はネットワークが癒えるまでシステムの一部が暗くなることです。銀行と在庫はこちらを選びます。断りのコストは再試行 1 回ですが、古い残高のコストは本物のお金だからです。"
  - title: "可用性を選べば、昨日の答えを聞きます"
    text: "同じ分断の下で、両側とも答え続けます。切られた側は最後に知っていたものを差し出すだけで、このシーンではその正直さが見えるように stale の印を付けました。ネットワークが癒えるとレプリカは収束します。フィードとカートとカウンターはこちらを選びます。少し古い答えのほうが、完璧に最新のローディング表示よりましだからです。"
  - title: "どこにも分断がなくても、取引は続いています"
    text: "強い整合性の読み取りは先にもう一方のレプリカに相談し、メーターがその往復を見せます。緩い読み取りはいちばん近い写しから答え、その写しと同じだけしか新しくありません。それが PACELC の Else の半分、レイテンシ対整合性です。"
related:
  - label: Strong Consistency
    slug: strong-consistency
  - label: PACELC
    slug: pacelc
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Session Consistency
    slug: session-consistency
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Failover
    slug: failover
  - label: Conflict Resolution
    slug: conflict-resolution
references:
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

## いつ使うか

- システム単位ではなく、データ集合の単位で当てはめます。注文台帳と商品フィードは同じ製品の中にいながら正反対の答えを求めます。台帳は嘘をつくくらいなら断り、フィードは持っているものを差し出します。システムが CP か AP かではなく、その中のデータ集合のそれぞれがそうなのです。
- 分断時の対応手順書を書くときに取り出します。その文書こそ、この定理を具体的に写したものだからです。どの呼び出しが断るのか、どの呼び出しがより古い値を差し出すのか、クライアントは断りを受けたら何をすべきか、ネットワークが戻ったあと何が調整されるのかを書くことになります。
- マネージドなデータストアで整合性レベルを選ぶときに取り出します。Cosmos DB の 5 つのレベルは名前の付いたこのダイヤルで、1 つを選ぶことは「すべての読み取りが最新の書き込みを見る」と「すべての読み取りが速い」のあいだの一点を選ぶことです。
- ベンダーの主張を読むときに取り出します。「CAP を超えた」はいつでも「線の上の一点を選んで名前を付けた」という意味です。分断のとき少数側の読み取りがどうなるかを尋ねれば、本当の答えが 1 文で返ってきます。
- 証明ではなく枠組みとして使います。この定理の価値は設計をそれだけで決めてくれることではなく、2 人がそれぞれ違う交換を前提にしたまま続いていた会話を止めることにあります。

## 注意点

- CAP の C は線形化可能性です。写しが 1 つしかないかのように、すべての読み取りが直近に完了した書き込みを見るという意味です。ACID の話で言う C、つまりトランザクションの中で制約が保たれるという意味よりはるかに強いものです。2 つを混ぜると、「ACID を守る」データベースがこの問いにすでに答えたかのように聞こえてしまいます。
- 可用性は一度に消えるのではなく、少しずつ削られます。CP のデータストアが分断に遭うと、定足数を握った側は答え続け、少数側だけが断ります。「整合性を選んだ」は製品が止まるという意味ではなく、製品の一部が一部の呼び出し元に対して、切れているあいだ止まるという意味です。
- 分断は切れたケーブルだけではありません。長い GC の停止、パケットの損失、過負荷の回線、タイムアウトまでに答えるにはただ遅すぎるノードが、外からは同じに見えます。時間内に合意できないレプリカたちです。掘削機に会うことよりこちらに会うことのほうがずっと多いので、一般的な場合を基準に設計します。
- AP を出す前に、収束の筋書きを先に作ります。最後の書き込み優先は、静かに書き込みを失う既定値です。編集が 2 つ、時計が 1 つ、生き残るのも 1 つで、エラーはどこにもありません。データに本当の衝突があるならバージョンベクターやフィールドごとのマージ、CRDT を使い、最後の書き込み優先を残すなら、どの書き込みを捨てる覚悟なのかを声に出して示してください。
- PACELC は毎日感じる半分です。ほとんどの日には分断がなく、実際にしている交換はすべての読み取りにおけるレイテンシ対整合性です。システムの本当の性格は Else の枝にあります。ほとんどのストアは PA/EL(Dynamo、Cassandra、既定のままの Cosmos DB)か PC/EC(Bigtable、HBase、読み取りがリーダーへ行くリレーショナルクラスター)に座り、混ざった組み合わせは名前を付ける価値があるほど珍しいものです。Else の枝は、分断のときの判断とは別の判断だからです。
- どちらの側も流行で選ばないでください。嘘をついてはいけないデータに AP を載せれば、数か月後に問い合わせとして現れる静かな破損がたまり、誰も読み返さないデータに CP を載せれば、経験しなくてよい障害を経験します。

## .NET では

このダイヤルはたいてい設計ではなくクライアントの設定です。Cosmos DB では `ConsistencyLevel` で、アカウントに既定値を置き、クライアントやリクエストの単位で狭めます。アカウントの既定値より下にあるレベルほど安く、速くなります。「狭める」が要の言葉です。`ConsistencyLevel` の上書きはアカウントの既定値を緩めることしかできないので、最新の書き込みを見なければならない読み取りが 1 つでもあるアカウントは `Strong` に設定し、それ以外の場所で緩めます。逆ではありません。

```csharp
// このアカウントは Strong に設定されている。ConsistencyLevel の上書きは既定値を
// 緩めることはできても強めることはできないので、クライアントは Session に下げ、
// 合意が要る読み取りだけが Strong を保つ。
var client = new CosmosClient(endpoint, credential, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,   // このアプリのふだんのレベル
    ApplicationRegion = Regions.WestEurope,        // 「いちばん近い写し」は実在する設定
});

// 判断に使う台帳の読み取りは合意の代金を払う。アカウント自体が Strong だからこそ、
// それを求められる。
var balance = await accounts.ReadItemAsync<Account>(
    id, new PartitionKey(customerId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });

// フィードの読み取りは払わず、そう書いておく。
var feed = await articles.ReadItemAsync<Article>(
    id, new PartitionKey(feedId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Eventual });
```

同じダイヤルは別の名前でも現れます。SQL Server では `ApplicationIntent=ReadOnly` が接続を読み取り可能なセカンダリへ送り、同期コミットの可用性グループが CP の設定にいちばん近いものです。ただし、そう頼んだ場合に限ります。既定では、確認を返さなくなったセカンダリはセッションタイムアウト(10 秒)のあいだコミットを止めるだけで、そのあとプライマリはそのセカンダリを同期していないと見なし、単独でコミットを続けます。`REQUIRED_SYNCHRONIZED_SECONDARIES_TO_COMMIT` を 1 以上に設定して、はじめてコミットが本当に止まります。MongoDB では `readConcern` と `writeConcern` が対になり、線形化可能な端は `readConcern: "linearizable"` と `writeConcern: "majority"` の組み合わせです。両方を `majority` にしても、過半数にコミット済みのデータが返るだけで、それが最新であることは約束されません。

アプリケーションのコードでは、この選択が 2 つの形として現れます。CP の形は断りを再試行できる状態として扱います。タイムアウトや「レプリカが足りない」というエラーを捕まえ、間を置いてもう一度試します。ネットワークが癒えれば答えは存在するようになるからです。AP の形は古い答えを普通の答えとして扱います。あるものを読み、分かっている新しさとともに見せ、調整の過程をユーザーから見える場所に置きます。どちらの形も書くこと自体は難しくありません。高くつくのは、そのエンドポイントが間違った形で書かれていたと午前 3 時に知ることのほうです。
