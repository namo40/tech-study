---
title: "Strong Consistency"
summary: "Strong consistency は、写しが複数ではなく 1 つしかないかのように、すべての読み取りが直近に完了した書き込みを見るという約束です。この約束は二度支払われます。分断のとき少数側が断ることで一度、平常時のすべての読み取りに付く往復でもう一度です。"
category: "データ分散と整合性"
scene: cap-theorem
sceneStep: 2
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Linearizability
    slug: linearizability
  - label: PACELC
    slug: pacelc
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Relational vs. NoSQL data
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/relational-vs-nosql-data
---

Strong consistency は CAP の C であり、その正確な名前は線形化可能性です。すべての操作が、発行された時点と返った時点のあいだの 1 つの瞬間に効いたかのように見えるので、書き込みが終わったあとに始まった読み取りは必ずその書き込みを見ます。この性質の価値はすべて、分散したデータストアを変数 1 つのように考えさせてくれることにあります。現在の値は 1 つです。いま入れたならそのまま読み返し、少し前に誰かが入れたならその人の値を読み、その前の値は読みません。レプリカが何個あるかは、それを使うコードへ漏れてきません。

シーンの 2 番目のステップは、ネットワークが壊れたときその約束がいくらかを見せます。`link` が切れ、`R1` は書き込みを受け続け、`R2` に着いた読み取りは数字ではなく `wait` を受け取ります。`R2` は壊れていないし、写しが傷んでもいません。ただ自分が持っているものがまだ最新かどうかを確かめる手立てがないだけで、この規則の下では保証できない答えは無回答より悪いのです。起きないことも一緒に見てください。システムは止まりません。定足数を握った側はそのあいだずっと普段どおり答えます。「整合性を選んだ」の実際の姿がそれです。分断の反対側にいる一部の呼び出し元が、再試行すると期待されているエラーを受け取るということです。

はるかに頻繁に払う代金はもう一方で、4 番目のステップがそれを見せます。どこにも分断がなくても、強い整合性の読み取りは話す前にほかのレプリカと相談しなければならず、その合意は往復です。シーンではメーターが、相談した読み取りに `ms 150`、いちばん近い写しから答えた読み取りに `ms 90` と読みます。実際のシステムでは同じ形が、定足数に対する過半数の読み取り、いちばん近いフォロワーではなくリーダーへ送る読み取り、そして `Strong` に設定した Cosmos DB のアカウントで `Session` に緩めずそのレベルを保ったリクエストとして現れます。この費用を消す設定はありません。費用こそが合意であり、合意こそがその性質だからです。

だから役に立つ問いは「このシステムは強い整合性であるべきか」ではなく、いつでも「どの読み取りがそうであるべきか」です。引き落とし前の残高確認、予約前の在庫確認、挿入前の重複確認は、取り消せない決定につながるので代金を払う価値があります。プロフィールのページ、フィード、ダッシュボード、何かの個数は、読まれて忘れられるものなので、そこに線形化可能性を買ってもユーザーが感じ取れるものは何も手に入りません。遅いと同時に脆く感じられるシステムは、たいていこの線を誰も引かなかったせいで、既定のままにすべてが高いほうへ置かれたシステムです。
