---
title: "Prepared Statement"
summary: "プリペアドステートメントは、クエリを固定された骨格として、値を純粋なデータとして送ります。入力がもうコードになれないのでインジェクションは消え、テキスト一つが計画一つを意味するのでプランキャッシュは冷めません。安全と速度が同じ決定から生まれます。"
category: ".NET データアクセス"
scene: prepared-statement
steps:
  - title: "文字列連結は値をコードに変えます"
    text: "クエリはユーザー入力を SQL テキストに貼り付けて組み立てられ、入力は引用符をまとって届きます。名前のはずだったものが条件として実行され、すべての行が歩いて出ていきます。データベースは何も間違えていません。手渡された文をそのとおり実行しただけです。"
  - title: "パラメーターは文と値を分離します"
    text: "クエリはプレースホルダー付きの骨格として出て行き、入力はその横を純粋なデータとして移動します。同じ攻撃文字列が届きますが、誰とも一致しません。それは今や実行される SQL ではなく、比較される名前だからです。エスケープするものも消毒するものもありません。境界は構造的です。"
  - title: "同じ骨格は、同じ実行計画でもあります"
    text: "新しい SQL テキストは実行の前に parse と plan の代金を払います。貼り合わせたクエリは全部違うテキストなので、キャッシュは永遠に外れます。パラメーター化されたクエリは値だけが変わる一つのテキストです。計画一つを一度コンパイルして、呼び出しごとに再利用します。安全と速度が同じ決定から生まれます。"
  - title: "実務で Prepare を直接呼ぶことはまれです。ただ貼り合わせないだけです"
    text: "今どきのドライバーと EF Core は勝手にパラメーター化し、サーバーはテキスト単位で計画をキャッシュします。残る規律は、テキストを安定させ、値をパラメーターに入れることです。骨格一つ、計画一つ、冷めないキャッシュ。そして攻撃面は副作用として閉じました。"
related:
  - label: Parameterized Query
    slug: parameterized-query
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
  - title: "SqlCommand.Prepare Method"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.data.sqlclient.sqlcommand.prepare
  - title: "Configuring parameters and parameter data types"
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types
  - title: "SQL Queries (EF Core)"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## いつ使うか

- コードの外から来た値を含むすべてのクエリに使います。ユーザー入力が一番わかりやすい例ですが、メッセージのペイロード、設定、ファイルの中身、自分たちの別のサービスから届いた文字列も、どれもコードの外です。「信頼できる内部の文字列」という分類は、リファクタリング一回に耐えたためしがありません。パラメーター化は危なそうなクエリに足す防御ではなく、クエリの書き方そのものとして扱ってください。どれが危なかったかは、いつも後になってから見えます。
- プランキャッシュが実際に働くホットパスに使います。骨格一つで毎分数千回動く文は一度だけコンパイルされて再利用されます。同じ文を文字列連結で作れば数千回コンパイルされ、その代金はこちらのコードの遅延ではなくデータベースの CPU として現れます。
- 同じ文を値だけ変えて繰り返すバッチループに使います。一度用意して何度も実行するという形は、この API がもともと狙った形です。コマンドとパラメーターコレクションと型はループの外で組み立てておき、各回は値を入れて実行するだけにします。
- 値が省略可能だったり、null になりうるものだったり、日付だったりするときに使います。そういう値をテキストに組み立てるということは、引用符の扱いとエスケープ、カルチャに左右されない書式を自分で書くということで、そのどれもがアポストロフィ入りの名前や別のタイムゾーンの機械に当たって表に出るバグです。パラメーターは型をそのまま運ぶので、この問いは最初から生まれません。

## 注意点

- 境界はパラメーター化であり、検証とエスケープはその後ろを支える厚みです。入力を検証する理由は、それがもっともらしいメールアドレスであるべきだからで、引用符を捕まえたいからではありません。許可リストは良い考えですが、危険な文字の拒否リストはそうではありません。何が危険な文字かは、こちらが管理していない方言の性質だからです。
- 識別子はパラメーターになれません。テーブル名、列名、`ORDER BY` の向きは文の一部であり、プレースホルダーがありません。クエリ文字列から来た並べ替えの列は、並べ替えを許す列の一覧を通してマッピングする必要があります。それ以外のやり方は、名前を変えただけの文字列連結です。
- `IN` リストの長さがばらばらだとキャッシュが断片化します。パラメーターが三つのクエリと四つのクエリは違うテキストなので、長さが 1 から 1000 まで動けば計画も 1000 個できます。長さをいくつかの区切りに切り上げるか、集合をテーブル値パラメーターとして渡して、テキストを一つに保ってください。
- サーバーによっては、パラメーターの型と長さもテキストの一部です。SQL Server では同じ値を入れた `varchar(10)` と `varchar(4000)` が別々の計画を作ります。サイズを値に決めさせると、長さごとに新しい計画ができます。`DbType` と `Size` を明示すれば、一つの文は一つの文のままです。
- データが片寄っていると、計画の再利用が損になることもあります。最初の値でコンパイルされた計画が次の値にも使われるので、最初の顧客の注文が 10 件で次の顧客が 200 万件なら、10 件向けに選んだ計画を 200 万件に使うことになります。これがパラメータースニッフィングで、`OPTIMIZE FOR` や `RECOMPILE`、フィルター選択されたインデックスといったチューニングの答えがあるチューニングの問題です。文字列連結に戻る理由にはなりません。
- 補間はパラメーター化ではありません。ただし例外が一つあります。`FromSqlInterpolated` が安全なのは、EF Core が補間文字列の穴を一つずつパラメーターに変えるからです。同じに見える文字列を `FromSqlRaw` に渡せば、それがインジェクションです。EF が見る前に文字列の組み立てが終わっているからです。二つの呼び出しは単語一つの違いなので、安全なほうを習慣にしてください。

## .NET では

`DbParameter` がこの仕組みのすべてです。コマンドにパラメーターを足し、テキストの中で名前で呼べば、値が SQL に触れることはありません。ドライバーは文と値を回線の上で別のものとして送り、サーバーは値をパースする代わりに列と比較します。

```csharp
using var command = new SqlCommand(
    "SELECT Id, Email FROM Users WHERE Name = @name AND CreatedAt > @since",
    connection);

command.Parameters.Add("@name", SqlDbType.NVarChar, 100).Value = name;
command.Parameters.Add("@since", SqlDbType.DateTime2).Value = since;

using var reader = await command.ExecuteReaderAsync(ct);
```

型と長さを書くのは形式的な手続きではありません。`Parameters.AddWithValue` はどちらも値から推論するので、六文字の名前と二十文字の名前が別々の文と別々の計画を作ります。`decimal` が誰も意図しない小数桁で届くこともあります。宣言しておけば、一つの文は一つの文のままです。

`DbCommand.Prepare` は、文をコンパイルして保持しておくようサーバーに明示的に頼みます。同じコマンドをきついループで回すときには価値がありますが、それ以外の場所ではめったにありません。今どきのサーバーはすでにテキスト単位で計画をキャッシュするので、普通のパラメーター付きの呼び出しでも、往復を一つ増やさずに同じ再利用が得られます。

```csharp
using var command = new SqlCommand("INSERT INTO Events (Id, Body) VALUES (@id, @body)", connection);
var id = command.Parameters.Add("@id", SqlDbType.UniqueIdentifier);
var body = command.Parameters.Add("@body", SqlDbType.NVarChar, 4000);
await command.PrepareAsync(ct);

foreach (var e in events)
{
    id.Value = e.Id;
    body.Value = e.Body;
    await command.ExecuteNonQueryAsync(ct);
}
```

EF Core はこちらの代わりにパラメーター化します。LINQ クエリが捕捉した変数はパラメーターになるので、`name` が何であっても生成される SQL は同じテキストです。一方、式の中に直接書いた定数はテキストに畳み込まれるので、結果は正しいものの定数ごとにテキストが変わります。SQL に降りるときは、`FromSqlInterpolated` と `SqlQuery` のオーバーロードが補間の穴をパラメーターに変え、`FromSqlRaw` はこちらが組み立てた文字列をそのまま受け取ります。

```csharp
// パラメーター化されます。テキスト一つ、計画一つ
var users = await db.Users.Where(u => u.Name == name).ToListAsync(ct);

// こちらもパラメーター化されます。穴が @p0 と @p1 になります
var rows = await db.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Name = {name} AND CreatedAt > {since}")
    .ToListAsync(ct);
```

SQL Server では、これらすべての結果が `sp_executesql` になります。文のテキストとパラメーターの宣言と値が、三つの別々の引数として渡されます。これを知っておくとよいのは、トレースで目にするのがその姿だからです。そして文のテキストの中に値がそのまま埋まっているのを見つけた瞬間が、コードベースでまだ貼り合わせている一か所を探す一番速い道になります。
