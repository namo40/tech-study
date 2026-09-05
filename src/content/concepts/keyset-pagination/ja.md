---
title: "Keyset Pagination"
summary: "5001 番目の行をくださいと言う代わりに、最後に見たキーの次の行をくださいと言います。インデックスはそのキーへ直接シークして前へ読み進むので、どのページも同じ費用で、読み手の足元では何もずれません。"
category: ".NET データアクセス"
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Offset Pagination
    slug: offset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Unique Constraint
    slug: unique-constraint
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: SQL Server index architecture and design guide
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

keyset のページネーションは問いを変えます。そこが仕掛けのすべてです。offset は「5001 番目から 5020 番目の位置にある行は何か」と尋ねますが、この問いにはどんなインデックスも数えずには答えられません。keyset は「このキーの次に来る行は何か」と尋ねます。これはソート済みの構造が無料で答えてくれる、まさにその問いです。キーまで降り、そこから前へ読むだけです。読んだ行は 20、捨てた行は 0 で、読み手が 2 ページ目にいても 500 ページ目にいても同じ 20 です。シーンでは、インデックスのすべてのブロックに灯がともるか、1 つだけにともるかの違いになります。

実装は機能ではなく `WHERE` 句です。`.Where(o => o.Id > lastSeenId).OrderBy(o => o.Id).Take(20)` がそのすべてで、各ページの最後の行が、次のページの出発点になるキーを持っています。それがそのまま制約でもあります。すでに見たページの次のページへしか行けません。500 ページ目へ跳ぶことはできません。「500 ページ目」は位置であり、keyset は位置を扱わないからです。無限スクロール、「もっと見る」、バックグラウンドのエクスポート処理、そしてクライアントが前へ歩くだけの API では、この制約は何の代償にもなりません。ページ番号とジャンプ入力のある画面では致命的で、そこでは offset が正直な答えです。

並べ替えのキーは一意でなければなりません。そうでないと、シークが同点の行の連なりの真ん中を切ってしまい、行が消えます。`CreatedAt` だけで並べると、ページ境界と同じ時刻を持つ行がすべて危険になります。直し方は主キーを後ろに足して全順序にすることで、そうすると比較も、2 つの別々の条件ではなく、2 つの列を 1 つとして扱うものにしなければなりません。手書きの SQL では、行値 (row value) を扱えるデータベース (PostgreSQL、MySQL、SQLite は対応し、SQL Server は非対応) で `WHERE (CreatedAt, Id) > (@lastCreated, @lastId)` と書きます。LINQ では `.Where(o => o.CreatedAt > last.CreatedAt || (o.CreatedAt == last.CreatedAt && o.Id > last.Id))` になります。長くはありますが、境界の両側で正しい唯一の形です。降順はすべての比較を裏返すので、気の利いた 1 つのクエリにまとめず、2 つの向きを別々に書いて別々に試してください。

インデックスは並べ替えと厳密に一致していなければならず、向きまで一致していなければなりません。そうでなければシークは静かにテーブル全体の並べ替えに変わり、払った分は何も戻りません。`(CreatedAt, Id)` で並べるならインデックスも `(CreatedAt, Id)` です。付け加えたい点が 2 つあります。keyset は挿入や削除に揺らがないので、生きているテーブルをめくる読み手は各行を多くても一度しか見ません。遅くなくてもエクスポートや同期の処理が keyset を使うべき理由がそこにあります。そして、キーが何かを漏らすなら、生のままクライアントへ渡さないでください。同じ値を包んだ不透明な署名付きカーソルは、外側の形だけを整えた同じ仕組みであり、それがカーソルページネーションです。
