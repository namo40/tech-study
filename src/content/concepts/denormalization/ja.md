---
title: "Denormalization"
summary: "Denormalization は、読み取りが欲しい形でデータの複製を持ち、書き込みのたびに少しずつ更新して、質問が複数の場所から組み立てられる代わりにひとつの場所へ落ちるようにすることです。そのあと管理するのは、複製の数と、どれだけ古くなることを許すかです。"
category: "データ分散と一貫性"
scene: cross-shard-query
sceneStep: 4
related:
  - label: Cross-Shard Query
    slug: cross-shard-query
  - label: Materialized View
    slug: materialized-view
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Transactional Outbox
    slug: transactional-outbox
  - label: Database Index
    slug: database-index
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: Modeling data in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/modeling-data
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
---

正規化されたスキーマは、すべての事実をちょうど一度だけ保存します。だから書き込みは単純で正しいのです。変える場所がひとつしかないので、自分自身と食い違いようがありません。その代金は読み取りが払います。プロダクトが実際に尋ねる質問は、事実が保存された形とほとんどの場合一致しないので、答えは読む時点で複数のテーブルから、分かれたストアなら複数のマシンから組み立てなければなりません。Denormalization は、その組み立てのコストを書き込みの時点で一度だけ払い、結果を取っておくという決定です。

単位は、質問の形をした複製です。顧客の注文合計、フォローしている人たちの最新二十件の投稿でできたフィード、外部キーの代わりに分類名そのものを持った商品の行といったものです。どれも正規化された事実から導けますし、存在する理由は、読むたびに導くほうが書くたびに保つよりも高くつくからです。その比が論拠のすべてであり、好みではなく計測の問題です。答えを変える書き込み一回につき質問が一万回来るなら複製が四桁の差で勝ち、一日一回しか来ないならそれは純粋な負債です。

シャーディングされたデータでこのやり方が効くのは、複製が元とは違うキーを持てるからです。事実は書き込みが必要とする基準で分かれ、複製は読み取りが尋ねる基準で分かれます。だから、シャードをまたぐ質問なら読み取りのたびに払っていたファンアウトが、書き込みのたびの小さな更新に変わります。これはセカンダリインデックスと同じ手を手作業で打つことであり、代わりに引き換えが目に見えます。何を複製するかを選び、どこに置くかを選び、それを最新に保つコストが見えます。

代金は、複製が間違いうることです。書き込みと更新のあいだの一瞬は間違っていて、これが古さであり、その機能がどれだけ許容するのかを口に出して決めておけばたいてい問題ありません。更新を失えば恒久的に間違っていて、これは問題であり、重要なのはこちらの壊れ方です。ですから更新の経路は、それが追いかける書き込みと同じだけ信頼できなければなりません。複製が同じストアにあるなら同じトランザクションの中で、そうでないなら outbox か change feed を通して更新します。そうすれば複製が、静かに消えたメッセージになることはありません。更新は繰り返しても安全にしておいてください。少なくとも一回の配信とは、ときどき二回当たるという意味であり、二回当たった増分は、放っておいて直ることの決してない間違った数字です。

複製の数を数えておきます。ひとつ増えるたびに書き込みの増幅がひとつ増え、形が変わったときに埋め直すものがひとつ増え、バグが長く残る不整合を置いていける場所がひとつ増えます。すべての複製を正規化された元から作り直す手段を用意し、実際に走らせてください。一度も走らせ直したことのない導出は、信頼できない導出です。そして、いまも正規化されている真実の元をひとつ残しておきます。複製が唯一の記録になった瞬間に、予期していなかった質問に答える力を失います。
