---
title: "CAP Theorem"
summary: "CAP 定理は、ネットワーク分断がレプリカを引き離したとき、二つのうち一つを選ばなければならないと言います。最新でないかもしれない値で答え続けるか、合意が戻るまで答えを断るかです。PACELC はそこに日常の半分を加えます。どこにも分断がなくても、すべての読み取りで遅延と一貫性を交換しているからです。"
category: "データ分散と一貫性"
scene: cap-theorem
steps:
  - title: "分断は起こります。選ばなければ二つに割れます"
    text: "ゴーストは link を切り、二つのレプリカに答え続けさせます。二つの値は互いに離れていき、同じ質問にいまや正直な答えが二つあります。それがこの定理の実際の内容です。ネットワーク分断は選択肢ではないので、分断が来たら、一貫性と可用性のどちらかをつかみます。選ばないことは、二つの答えを同時に選ぶことです。"
  - title: "一貫性を選べば、一部は待ちます"
    text: "分断の下で、合意に届かない側は断ります。間違った答えより無回答のほうがましだからです。差し出した答えはすべて唯一の真の値で、代金はネットワークが癒えるまでシステムの一部が暗くなることです。銀行と在庫がこの行を買います。断りのコストはリトライ一回ですが、古い残高のコストは本物のお金だからです。"
  - title: "可用性を選べば、昨日の答えを聞きます"
    text: "同じ分断の下で、両側とも答え続けます。切られた側は最後に知っていたものを差し出すだけで、この場面ではその正直さが見えるように stale の印を付けました。ネットワークが癒えるとレプリカは収束します。フィードとカートとカウンターがこの行を買います。少し古い答えのほうが、完璧に最新のローディング表示よりましだからです。"
  - title: "どこにも分断がなくても、取引は続いています"
    text: "強い一貫性の読み取りは、話す前にレプリカと相談しなければならず、その合意は往復で、メーターがそれを見せます。緩い読み取りはいちばん近い写しから、速く、ときどき古く答えます。それが PACELC の足した半分です。分断なら可用性対一貫性、なければ遅延対一貫性。この線の上の一点を、あなたの既定値がもう選んでいます。"
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

- システム単位ではなく、データ集合の単位で当てはめます。注文台帳と商品フィードは同じ製品の中にいながら正反対の答えを求めます。台帳は嘘をつくくらいなら断り、フィードは持っているものを差し出します。システムが CP か AP かではなく、その中のデータ集合の一つひとつがそうなのです。
- 分断時の対応手順書を書くときに取り出します。その文書こそ、この定理を具体的に写したものだからです。どの呼び出しが断るのか、どの呼び出しがより古い値を差し出すのか、クライアントは断りを受けたら何をすべきか、ネットワークが戻ったあと何が調整されるのかを書くことになります。
- マネージドなデータストアで一貫性レベルを選ぶときに取り出します。Cosmos DB の五つのレベルは名前の付いたこのダイヤルで、一つを選ぶことは「すべての読み取りが最新の書き込みを見る」と「すべての読み取りが速い」のあいだの一点を選ぶことです。
- ベンダーの主張を読むときに取り出します。「CAP を超えた」はいつでも「線の上の一点を選んで名前を付けた」という意味です。分断のとき少数側の読み取りがどうなるかを尋ねれば、本当の答えが一文で返ってきます。
- 証明ではなく枠組みとして使います。この定理の価値は設計を一人で決めてくれることではなく、二人がそれぞれ違う交換を前提にしたまま続いていた会話を止めることにあります。

## 注意点

- CAP の C は線形化可能性です。写しが一つしかないかのように、すべての読み取りが直近に完了した書き込みを見るという意味です。ACID の話で言う C、つまりトランザクションの中で制約が保たれるという意味よりはるかに強いものです。二つを混ぜると、「ACID を守る」データベースがこの問いにすでに答えたかのように聞こえてしまいます。
- 可用性は一度に消えるのではなく、少しずつ削られます。CP のデータストアが分断に遭うと、定足数を握った側は答え続け、少数側だけが断ります。「一貫性を選んだ」は製品が止まるという意味ではなく、製品の一部が一部の呼び出し元に対して、切れているあいだ止まるという意味です。
- 分断は切れたケーブルだけではありません。長い GC の停止、パケットの損失、過負荷の回線、制限時間内に答えるにはただ遅すぎるノードが、外からは同じに見えます。時間内に合意できないレプリカたちです。掘削機に会うことよりこちらに会うことのほうがずっと多いので、一般的な場合を基準に設計します。
- AP を出す前に、収束の筋書きを先に作ります。最後の書き込み優先は、静かに書き込みを失う既定値です。編集が二つ、時計が一つ、生き残るのも一つで、エラーはどこにもありません。データに本当の衝突があるならバージョンベクタやフィールドごとのマージ、CRDT を使い、最後の書き込み優先を残すなら、どの書き込みを捨てる覚悟なのかを声に出して示してください。
- PACELC は毎日感じる半分です。ほとんどの日には分断がなく、実際にしている交換はすべての読み取りにおける遅延対一貫性です。システムの本当の性格は Else の枝にあり、だから CP とだけ言うより PC/EL(分断なら一貫、さもなくば速い)のほうが実際の配備をはるかによく説明します。
- どちらの側も流行で選ばないでください。嘘をついてはいけないデータに AP を載せれば、数か月後に問い合わせとして現れる静かな破損がたまり、誰も読み返さないデータに CP を載せれば、経験しなくてよい障害を経験します。

## .NET では

このダイヤルはたいてい設計ではなくクライアントの設定です。Cosmos DB では `ConsistencyLevel` で、アカウントに既定値を置き、クライアントや要求の単位で狭めます。アカウントの既定値より下にあるレベルほど安く、速くなります。

```csharp
// アカウントに既定値があり、クライアントや個々のリクエストは緩めることしかできない。強めることはできない。
var client = new CosmosClient(endpoint, credential, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,   // ふだんの既定値
    ApplicationRegion = Regions.WestEurope,        // 「いちばん近い写し」は実在する設定
});

// 判断に使う台帳の読み取りは合意の代金を払う。
var balance = await accounts.ReadItemAsync<Account>(
    id, new PartitionKey(customerId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Strong });

// フィードの読み取りは払わず、そう書いておく。
var feed = await articles.ReadItemAsync<Article>(
    id, new PartitionKey(feedId),
    new ItemRequestOptions { ConsistencyLevel = ConsistencyLevel.Eventual });
```

同じダイヤルは別の名前でも現れます。SQL Server では `ApplicationIntent=ReadOnly` が接続を読み取り可能なセカンダリへ送り、同期コミットの可用性グループが CP の設定です。セカンダリが確認を止めるとプライマリのコミットも止まりうるからです。MongoDB では `readConcern` と `writeConcern` が対になり、両方を `majority` にすると線形化可能な端に届きます。

アプリケーションのコードでは、この選択が二つの形として現れます。CP の形は断りを再試行できる状態として扱います。制限時間の超過や「レプリカが足りない」というエラーを捕まえ、間を置いてもう一度試します。ネットワークが癒えれば答えは存在するようになるからです。AP の形は古い答えを普通の答えとして扱います。あるものを読み、分かっている新しさとともに見せ、調整の過程を利用者から見える場所に置きます。どちらの形も書くこと自体は難しくありません。高くつくのは、そのエンドポイントが間違った形で書かれていたと午前三時に知ることのほうです。
