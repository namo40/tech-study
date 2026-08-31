---
title: "PACELC"
summary: "PACELC は CAP 定理に、毎日出会うほうの半分を加えます。分断(Partition)があれば可用性と一貫性のあいだで、さもなくば(Else)遅延と一貫性のあいだで選ぶ、という文です。ほとんどの日には分断がないので、システムの本当の性格は Else の枝にあります。"
category: "データ分散と一貫性"
scene: cap-theorem
sceneStep: 4
related:
  - label: CAP Theorem
    slug: cap-theorem
  - label: Strong Consistency
    slug: strong-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Linearizability
    slug: linearizability
  - label: Consistent Prefix
    slug: consistent-prefix
  - label: Replication Lag
    slug: replication-lag
  - label: Replication
    slug: replication
  - label: Quorum
    slug: quorum
  - label: Conflict Resolution
    slug: conflict-resolution
  - label: Failover
    slug: failover
references:
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data partitioning guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning
---

PACELC は枝が二つある一つの文として読めます。分断(Partition)があれば可用性と一貫性のあいだで選び、さもなくば(Else)遅延と一貫性のあいだで選ぶ、というものです。Daniel Abadi がこの名前を出したのは、CAP 定理だけでは稀な非常事態を説明するにとどまり、システムの寿命の残りを埋める平凡な火曜日の午後について何も言わないからです。後半のほうが役に立つ理由は、まさにそれが常に動いているという点にあります。複製されたデータストアは、分断があってもなくても、すべての読み取りで遅延対一貫性の交換をしていて、利用者が実際に体験するのはその交換です。

場面の第四段階は、非常事態を取り除いたその文です。link は無傷で切れたところもないのに、二つの読み取りの値段が違います。強い一貫性の読み取りは答える前にほかのレプリカまで行って戻らなければならないので、メーターは ms 150 と読みます。緩い読み取りは呼び出し元にいちばん近い写しから答えるので、ms 90 と読みます。何も失敗していないし、危機のなかで何かを選んだ人もいません。違いはただ、合意がネットワークを越えなければならないときに合意へ付く値段であり、それを求めるすべての読み取りに請求されます。

書き下すと、システムには二文字の説明が付きます。PC/EC は両方の枝で一貫性の代金を払い、PA/EL は両方で手放し、PC/EL はネットワークが壊れれば一貫し、残りの時間は速いほうです。既定のまま動いている定足数のデータストアの多くを含め、実際の配備のかなりの数が PC/EL に当たります。この記法の目的は製品を箱に仕分けることではなく、Else の枝を声に出して言わせることです。二つのチームが分断中に起きることについて完全に合意していても、違う製品を作っていることがあります。片方はすべての読み取りでリージョン間の往復を払い、もう片方は払っていないからです。

PACELC の居心地の悪いところは、あなたがもう答えを出しているという事実です。スタックのすべての既定値がこの線の上の位置です。Session に設定された Cosmos DB のアカウント、secondaryPreferred にした Mongo の readPreference、非同期コミットで動いている可用性グループ、無効化の筋書きなしに問い合わせの前へ置かれたキャッシュがそれです。どれ一つ設計会議を経ていませんが、すべて、どれだけ速い答えを得る代わりに答えがどれだけ古くてよいかについての選択です。PACELC をきちんと読むとは、それらの既定値をもう一度見直し、どのデータ集合を動かす価値があるかを決め、残りがその場所にとどまる理由を書き留めることです。
