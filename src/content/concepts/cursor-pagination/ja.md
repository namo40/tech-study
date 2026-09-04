---
title: "Cursor Pagination"
summary: "cursor は読み手が実際に最後に見た行を指すので、次のページはその行の次へのシークになります。深さがいくつでも費用は同じで、上に行が増えても揺れません。代わりに次へは行けても 57 ページ目へは行けません。"
category: ".NET データアクセス"
scene: pagination
sceneStep: 3
related:
  - label: Pagination
    slug: pagination
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: Batching
    slug: batching
  - label: Backpressure
    slug: backpressure
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Pagination in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/cosmos-db/query/pagination
---

cursor は数ではなく行で作ったしおりです。「4 ページ目をください」ではなく「最後に見た行の次をください」と言うと、データベースはそれを `WHERE key > @after ORDER BY key LIMIT 20` に訳します。並べ替え列にインデックスがあり比較が範囲なので、エンジンはその位置へまっすぐシークして二十行を読みます。ページの手前の行を作り出さないため、その分を払いません。2 ページ目でも 2000 ページ目でも費用は同じで、実行計画の形も同じです。この平らさが cursor を選ぶ一つ目の理由であり、深さに上限のないエンドポイントではこれだけで結論が出ます。

二つ目の理由は、しおりが動かないことです。結果の中の位置は、その上に何かが書かれた瞬間にずれます。だから番号で数えたページは、読み手がすでに見た行をもう一度返したり、誰も見ていない行を黙って飛ばしたりします。キーはずれません。読み手がページの間にいるうちに先頭へ十行が挿入されても、最後に見た行のキーはそのままなので、次のページは変わらずその直後から始まり、新しい十行は窓の上の本来の場所に収まります。エクスポート、同期エンドポイント、生きたテーブルをなめる処理を offset ではなく cursor で書くべき理由がここにあります。そうした読み手こそ、読んでいる間にテーブルが変わるほど遅い読み手です。

この二つの利点の請求書は、cursor が住所ではなく場所だということです。次へは行けますし、比較を逆にすれば前へも戻れますが、「57 ページ目」を表す式はありません。cursor は一つ手前のページが手渡してくれて初めて存在するからです。果てしないフィードはそれを惜しみませんし、任意のページ番号が本当に必要な利用者は offset が欲しいと言っているのと同じです。もう一つ静かな条件があります。並べ替えは全順序でなければなりません。一意でない列の上の cursor は、同点の行のどこで止まったかを言えないので、境界で行を繰り返すか失います。その列を主キーと組み合わせ、二つをタプルとして比較し、同じ順序でインデックスを張ります。

cursor はキーそのものではなく不透明なトークンとして返してください。小さな JSON か二進値を base64url で包む程度の符号化で三つのことが手に入ります。呼び出し側がいつか変えたくなる形式に依存しなくなり、見てはいけない行へ位置を偽造できなくなり、内部の識別子が URL やログやリファラーヘッダーへ漏れなくなります。トークンは入ってきたときに検証できる程度には自己記述的にしておき、今の並べ替え順と合わないトークンは別の基準で黙ってページを進めずに拒否します。そしてページより一行多く取ってくれば、「次のページがあるか」を二本目のクエリなしに同じクエリで答えられます。
