---
title: "Query Plan"
summary: "実行計画は、サーバーが文から作り上げるコンパイル済みのプログラムで、その文のテキストをそのまま鍵にしてキャッシュされます。速さは再利用から生まれ、テキストを安定させることがその入場料です。"
category: ".NET データアクセス"
scene: prepared-statement
sceneStep: 3
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Parameterized Query
    slug: parameterized-query
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Materialized View
    slug: materialized-view
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
references:
  - title: "Query processing architecture guide"
    url: https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

シーンの三つめのステップは、同じ決定を反対側から見たものです。中段のキャッシュは計画を三つ持ち、文のテキストを鍵にしています。だから貼り合わせていた世界の再生が始まると、値ごとに誰も見たことのないテキストができ、そのたびに二つのランプがまた点きます。その代金を見ておいてください。新しいテキストが三つなら、コンパイルが三回、スロットが三つ、そして場所を空けるためにキャッシュの一番古いものが毎回追い出されます。取っておく値打ちのあった計画が、二度と実行されないクエリたちに押し出されます。シーンがそう仕組んだのではなく、大きさのあるキャッシュから自然にそうなります。

コンパイルが実際に何を買っているのかを知っておくと、なぜ高いのかが説明できます。サーバーはテキストをパースし、名前をカタログに照らして解決し、その結果をオプティマイザーに渡します。オプティマイザーは実行の仕方を探します。どのインデックスを使うか、結合の順序をどうするか、ソートするか流すか、メモリをどれだけ要求するか。この探索は候補となる計画を非常に多く検討し、統計を使ってそれぞれに値段を付けます。高いのはパースではなくこの探索のほうです。再利用はそれを丸ごと飛ばします。ヒットは速いコンパイルではなく、コンパイルなしです。

キャッシュの鍵はテキストですが、多くの人が思うよりずっと文字どおりのテキストです。空白が一つ違う、キーワードの大文字小文字が違う、コメントが付いている、テーブルを `Users` と書いたか `dbo.Users` と書いたかが違う。それだけで二つのテキストであり、したがって二つの計画です。SQL Server ではセッションの `SET` オプションも鍵の一部なので、接続設定の違う二つのクライアントが同じ文を送ると二度コンパイルされることもあります。テキストがコードの一か所からしか出てこないなら、このどれも問題になりません。パラメーター化されたコードベースのキャッシュが小さくて冷めず、貼り合わせるコードベースのキャッシュが大きくて冷たいのは、たいていこの理由です。

現実のシステムでキャッシュを断片化させるものには、名前を付けておく値打ちがあります。どれも無害に見えるからです。長さがデータに従う `IN` リストは長さごとに計画を一つ作るので、サイズを区切りに切り上げるか、テーブル値パラメーターで渡してください。`AddWithValue` は文字列パラメーターの長さを値から推論するので、六文字の検索語と七文字の検索語が別々の文になります。サイズを宣言すれば直ります。レポートツールやその場かぎりのクエリが SQL の中に書き込むリテラルは一つにつき計画を一つ作り、一度きりの計画で埋まったサーバーは、二度と聞かれないことを覚えるためにメモリを使っています。

再利用には再利用なりの代金があり、それが正直な反対側の重りです。計画一つは先に届いた値でコンパイルされ、オプティマイザーはその値の統計を見て計画を選びました。最初の顧客の注文が 10 件で次の顧客が 200 万件なら、シークして繰り返すように選ばれた計画が、いま 200 万回繰り返しています。これがパラメータースニッフィングで、答えはチューニングの答えです。代表的な値で `OPTIMIZE FOR` を指定する、本当に二極化している文にだけ `RECOMPILE` を付ける、統計を良くする、クエリを二つに分ける。文字列連結に戻れば計画は直り、インジェクションがまた開きます。誰もしてはいけない取引です。

`Prepare` はこれらすべての上にあって、名前が匂わせるより少ないことをします。文をコンパイルしてハンドルの下に持っておくようサーバーに頼むので、一つのコマンドをきついループで回すときに検索を一回節約できます。普通のパラメーター付きの呼び出しは、それなしでもテキストを鍵にしたキャッシュから再利用を得ています。サーバーによってはリテラルを代わりにパラメーター化してくれるものもありますが、それは書き直さずに古いアプリケーションを救う逃げ道であって、設計ではありません。すべてを通り抜けて残る規則は、四つめのステップが締めくくるあの一文です。テキストを安定させて値をパラメーターに入れれば、キャッシュは勝手に回ります。
