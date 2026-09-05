---
title: "Unique Constraint"
summary: "ソート済みインデックスに掛けておく規則です。挿し込むときにこの値が入るべき位置がすでに埋まっていたら、拒否します。検査と占有が 1 つの構造の中の一点で起きるので、競争する 2 つの挿入が両方勝つことはできません。"
category: ".NET データアクセス"
scene: database-index
sceneStep: 3
related:
  - label: Database Index
    slug: database-index
  - label: Idempotency Key
    slug: idempotency-key
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Prepared Statement
    slug: prepared-statement
  - label: Database Migration
    slug: database-migration
  - label: Materialized View
    slug: materialized-view
  - label: No-Tracking Query
    slug: no-tracking-query
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
references:
  - title: Unique constraints and check constraints
    url: https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints
  - title: Indexes (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/modeling/indexes
  - title: CREATE INDEX (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/statements/create-index-transact-sql
---

一意制約はほとんど無料であり、その理由がシーンの 3 番目のステップです。インデックスはすでにソートされているので、挿入は値を置く前にその値が入るべき位置をどのみち探さなければなりません。そこに「その位置にすでに何かが座っていたら拒否せよ」を加えても、余分な探索も、余分な読み取りも、別の構造も要りません。データベースがこの制約を別の規則集ではなくインデックスとして実装するのはそのためです。制約を守る仕事は、書き込みがもともとやっていた仕事なのです。

その見返りに得られるのは、アプリケーションのコードが自力では作れない唯一のものです。「重複を許さない」の当たり前の実装は、先に検索して何も返ってこなければ挿入する、というものですが、これは世界中のどのデータベースでも誤りです。2 つのリクエストが両方とも検索し、両方とも何も見つけず、両方とも挿入できるからです。検査と書き込みのあいだのその隙間で重複が生まれます。一意インデックスは、隙間を持たないという方法でそれを閉じます。位置を見つける探索とその位置を占める書き込みが一点の一歩なので、同じ値で到着した 2 つのうち、ちょうど 1 つだけがその値を持って出ていきます。シーンではテーブルに触れることさえありません。行が 1 つも書かれる前に、インデックスが自分で答えます。

ですからコードの正しい形は、跳ぶ前に見ることではありません。まず挿入し、失敗を答えとして受け取ることです。`SaveChangesAsync` は `DbUpdateException` を投げ、その下には「一意違反」だと名指しするプロバイダーのエラー番号があります。SQL Server なら 2601 か 2627、PostgreSQL なら `23505` です。それが `409 Conflict` を返すか、すでにある行を読んでそのまま進めという合図になります。よくある間違いは、すべての `DbUpdateException` を同じように捕まえることです。外部キー違反もタイムアウトも同じ外套を着てやって来るので、それらまで「すでにある」として飲み込むと、本物のバグが隠れます。外側の例外ではなく、内側の例外で判断してください。

宣言する前に知っておきたい点が 3 つあります。`NULL` は自分自身と等しくないので、PostgreSQL、MySQL、SQLite では一意列に `NULL` を持つ行が複数存在できますが、SQL Server は 2 つの `NULL` を等しいものとして扱い、ちょうど 1 つだけを許します。SQL Server でもう一方の振る舞いにするにはフィルター付き一意インデックス (`HasFilter("[Email] IS NOT NULL")`) を使い、どちらも望みでないなら、その列は NULL を許してはいけません。複数列をまとめた一意性は、それぞれの一意性とは別の規則です。`HasIndex(x => new { x.TenantId, x.Email }).IsUnique()` はテナントごとにメールアドレス 1 つという意味であり、全体のメールアドレスについては何も言っていません。そして比較を決めるのは列であって、こちら側ではありません。`Ann@example.com` が `ann@example.com` と衝突するかは照合順序が決めるので、期待するのではなく入口で値を正規化してください。行をソフト削除するなら、フィルター (`HasFilter("[DeletedAt] IS NULL")`) を付けて、削除された行がその値を永久に押さえ続けないようにしてください。
