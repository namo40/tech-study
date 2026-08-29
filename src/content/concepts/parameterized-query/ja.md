---
title: "Parameterized Query"
summary: "パラメーター化されたクエリは、文と値を別々の二つとして送るので、値はテキストがすでにパースされたあとに束縛されます。境界は気をつけるべき文字の一覧ではなく、構造です。"
category: ".NET データアクセス"
scene: prepared-statement
sceneStep: 2
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Query Plan
    slug: query-plan
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Materialized View
    slug: materialized-view
references:
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.sqlclient.sqlcommand.prepare
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

シーンの二つめのステップを見ながら、実際に変わったものがどれだけ少ないかを確かめてみてください。同じ入力で、色も赤のままで、同じデータベースに届きます。ろ過したものも削り取ったものもありません。変わったのは App から出て行ったものの形です。一つめのステップでは入力が文の末尾に溶接され、全体が一つのかたまりとして移動していました。二つめでは、値があった場所にプレースホルダーがあり、値は文の横を自分だけの板として移動します。二つのあいだの隙間を隙間として描いているのは、その隙間こそが仕組みだからです。

この隙間が買ってくるのは順序です。サーバーは文のテキストを受け取り、木にパースして意味を確定し、そのあとで、木がすでに持っている穴に値を束縛します。パーサーにとって入力が存在し始めるころには、パースはもう終わっています。値の中の引用符が文字列リテラルを終わらせることはできません。その値は文字列リテラルの中にはなく、文法がすでに閉じた場所に置かれた引数だからです。二つめのステップの同じ攻撃文字列が危険でもなく、消毒されたわけでもない理由がこれです。それはただ、誰もそう呼ばれていない名前にすぎません。

このやり方はエスケープより強く、その違いは正確に押さえておく値打ちがあります。エスケープは方言についての主張です。すべての引用規則と、すべてのエスケープシーケンスと、検査を終えたあとでバイトが引用符に変わりうるすべてのエンコーディングと、値が置かれるすべての文脈を知っている、という主張です。数値はたいてい引用符で囲まないので、引用符だけを扱うエスケープ処理は文字列の列を守りながら整数の列を開けっ放しにします。パラメーター化はそういう主張をしません。値を文法の外へ完全に移してしまえば、賢く立ち回る余地そのものが残りません。

パラメーターが行けない場所があり、そここそ見ておく価値のある場所です。パラメーターは値なので、値が立てる場所に立ちます。比較式、`IN` リスト、`VALUES` 句がその場所です。テーブル名や列名、`ORDER BY` の `ASC` にはなれません。それらは文の中のデータではなく、文の一部だからです。並べ替えの列やテーブルが外から来なければならないときは、届いた文字列をこちらが提供する気のある一覧にマッピングし、それ以外は全部断ってください。このマッピングは小さく、試験しやすく、これをきちんとやったコードベースに残る唯一の文字列連結です。

隙間を越えていっしょに渡るもう一つは型です。パラメーターとして送った日付は日付であって、カルチャに左右されない書式に直してからまたパースし直す文字列ではありません。`decimal` は小数桁を保ち、null はそれを綴った四文字ではなく `DBNull.Value` です。どれもそもそも起きないバグの一群なのですが、起きなかったバグは痕跡を残さないので見落としやすいところです。

実務では、これらすべてが結局は習慣一つに落ち着きます。`FromSqlInterpolated` と `FromSqlRaw` は同じに見える文字列を受け取って正反対に扱いますし、`+` で作った `SqlCommand` はパラメーターで作ったものとほとんど同じ見た目です。安全なほうを指が先に打つ形にして、コードレビューには diff に出てくる SQL ごとに問いを一つだけ投げさせてください。値はどこから入ったのか。
