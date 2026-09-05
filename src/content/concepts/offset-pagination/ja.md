---
title: "Offset Pagination"
summary: "500 ページ目を求めると、データベースは捨てるために先頭から 5000 行を数えて通り過ぎます。返ってくるページは正しいのですが、費用は深さに比例して増え、ページのあいだで行が足元でずれることがあります。"
category: ".NET データアクセス"
scene: database-index
sceneStep: 4
related:
  - label: Database Index
    slug: database-index
  - label: Keyset Pagination
    slug: keyset-pagination
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
  - title: SELECT - ORDER BY clause (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql
  - title: Efficient querying (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying
---

SQL Server の `OFFSET 5000 ROWS FETCH NEXT 20 ROWS ONLY`、PostgreSQL の `OFFSET 5000 LIMIT 20` は「5000 件を飛ばして 20 件ください」と読めますが、この「飛ばす」という語がずいぶん多くを隠しています。データベースは、まだ作り出していない行を飛ばすことはできません。ある順序で 5001 番目の行がどれかを知るには、順序を先頭から歩き、5000 行を数え、そのすべてを捨て、それからようやく集め始めるほかありません。求めた 20 行は安いのです。求めてもいない 5000 行こそが請求書のすべてで、読み手が「次へ」を押すたびに増えていくのはその部分だけです。

だから offset のページネーションは、大丈夫だったのに急に大丈夫でなくなります。1 ページ目は無料、10 ページ目は気づきもせず、500 ページ目は 20 行を返すために 5020 行に触れるクエリです。そのあいだにコードは何も変わっておらず、実行プランも変わっていません。開発中にこの問題を見落としやすいのはそのためです。400 行のテスト用テーブルでは、費用が現れる深さまで到達できません。本番での症状は、p99 は問題ないのに p999 がひどいエンドポイントで、遅いリクエストはどれも `page` の値が大きいのです。

2 つ目の問題は速さとはまったく関係がありません。offset は結果の中の位置で行を指しますが、位置は動きます。読み手が 3 ページ目と 4 ページ目のあいだにいるうちに前のほうへ行が 1 つ挿入されると、すべての行が 1 つずつずれ、3 ページ目の最後だった行が 4 ページ目の先頭になります。読み手は同じ行を二度見ます。逆に行を消せば、1 行がまるごと飛ばされます。これはページを速くめくれば直るバグではありません。「この前に何行あるか」に頼る番地の付け方は、書き込みが起きた瞬間から不安定であり、生きているテーブルをめくり続けるエクスポート処理で、いちばん手痛く現れます。

それでも offset が正解になる場所が 2 つあり、そこははっきりさせておく価値があります。読み手が本当に任意のページ番号へ跳ぶ必要があるなら、それができるのは offset だけです。keyset は前のページのキーを必要としますが、500 ページ目には手元に前のページがありません。そして集合全体が小さく上限がはっきりしているなら、たとえば設定の一覧や数千行の管理用テーブルなら、深さが問題になるほど深くならないので、`Skip`/`Take` がいちばん単純に効きます。読み取り用のエンドポイントには `AsNoTracking()` を付け、総件数のクエリは習慣で計算せず、本当に必要なときだけ一緒に投げてください。そして `ORDER BY` が全順序になっているか確かめてください。同点があると、同じページを二度求めても違う行が返ることがあり、それは誤りではありません。
