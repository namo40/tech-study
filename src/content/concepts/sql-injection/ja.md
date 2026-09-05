---
title: "SQL Injection"
summary: "SQL インジェクションは、ユーザーの入力がコードとして実行されてしまうときに起きることです。文字列を貼り合わせて作ったクエリは、キーボードを呼び出し側に渡してしまいます。対策は code と data を別々のチャネルに置き、検証は 2 枚目の層として扱い、盗まれたクエリが届く範囲をアカウントの大きさで縛ることです。"
category: "アプリケーションセキュリティ"
scene: sql-injection
steps:
  - title: "文字列を貼り合わせて作ったクエリは、キーボードを呼び出し側に渡してしまいます"
    text: "ゴーストは code トラックに溶け込んだ入力を見せます。クエリの形が変わり、データベースは書いた覚えのない質問に誠実に答えます。持っている行の全部をです。クエリを打ったのは呼び出し側で、こちらは場所を貸しただけです。解決は賢さではありません。code と data を別々のチャネルに置くことです。"
  - title: "パラメーターは入力を永遠にデータのままにします"
    text: "同じ尖った入力が届いて data スロットに収まり、code トラックは動きません。データベースはそのばかげた名前の顧客を探し、見つからないので 0 行を返します。攻撃が侵害ではなく間違った答えになるのです。これが主防御です。このシーンの残りはすべて 2 枚目の層です。"
  - title: "検証は入り口のフィルターであって、防弾チョッキではありません"
    text: "形式、長さ、範囲。明らかなごみはコストが掛かる前に断られ、正直な入力は通ります。しかし巧妙な攻撃は形式的には完璧でありえます。1 つが検査をすり抜けて、それでも data スロットに無害に収まるのを見てください。ノイズを締め出すために検証し、検証が見逃すからこそパラメーター化するのです。"
  - title: "クエリを盗まれても、届く範囲は正確にアカウントの分だけです"
    text: "アプリのデータベース role は自分のテーブルを読み書きできるだけで、それ以外は何もできません。危険な命令は運ではなく role に弾かれます。最小権限は注入を防いでくれません。注入がいくらの価値かを決めるのです。多層防御とはこのシーンを積み重ねたものです。分けたチャネル、ふるいにかける門、小さなアカウント。"
related:
  - label: Prepared Statement
    slug: prepared-statement
  - label: Input Validation
    slug: input-validation
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Output Encoding
    slug: output-encoding
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
  - label: Database Index
    slug: database-index
  - label: Repository
    slug: repository
references:
  - title: "SQL Injection"
    url: https://owasp.org/www-community/attacks/SQL_Injection
  - title: "SQL Injection Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
  - title: "SQL Queries - EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/querying/sql-queries
---

## いつ使うか

ここでの見出しは形式的なものです。これらの防御を使わないと決める場面はありません。変わるのは、道具がどこまで済ませてくれているかだけです。

- 自分で書いたのではない値が触れるすべての文をパラメーター化します。社内の管理画面、マイグレーションスクリプト、外から届かないレポート、UI が数字しか受け付けないようにしてある項目。どれも例外ではありません。事故はいつもその例外から出ます。誰もこの観点で読み返さないコードだからです。
- ORM に任せます。EF Core の LINQ 変換は構造上パラメーター化されます。`Where(c => c.Name == name)` はプレースホルダーとパラメーターを生み、貼り合わせたテキストになる書き方はありません。コードベースの大部分はこの防御を無料で受け取ります。だからこそ残った少数が重要になります。
- 生の SQL が本当に適切な場所では、補間版のオーバーロードを使います。`FromSql` と `ExecuteSql` は補間文字列を受け取り、`{value}` の穴をすべてパラメーターに変えます。`FromSqlRaw` と `ExecuteSqlRaw` はただの文字列を受け取り、こちらを全面的に信用します。名前そのものが警告で、その数文字の違いが安全性のすべてです。
- 境界で形式、長さ、範囲を検証します。注文 id は `Guid`、ページサイズは 1 から 100 の間、国コードは 2 文字。これはクエリではなくリクエストモデルの仕事です。その役目はパラメーターから SQL を締め出すことではなく、システムから筋の通らない値を締め出すことです。
- サービスごとに専用のデータベースアカウントを与え、実際に使う権限だけを持たせます。4 つのテーブルを読み書きするアプリに、テーブルを作る権限も、別スキーマを読む権限も、データベースの外へ出る命令を実行する権限も要りません。この判断は半日で済み、この先どんな間違いが起きてもその値打ちを恒久的に縛ります。
- 生の SQL の面積を小さく、1 か所にまとめます。リポジトリか少数のクエリクラスがあれば、この規律を守るべきファイルは短い一覧になります。すべての開発者がすべての呼び出し箇所で永遠に覚えておく性質にはしません。

## 注意点

- 文字列連結はパラメーターの届かない場所に隠れます。列名、テーブル名、`ORDER BY` の方向は値ではないので、どのドライバーもパラメーターにしてくれません。答えは許可リストです。呼び出し側の `sort=name` を自分で書いた定数文字列に対応付け、対応表にないものは断ります。エスケープしたかどうかに関わらず、呼び出し側のテキストをそのまま通さないでください。
- 動的な `IN` の一覧には、要素ごとにパラメーターが 1 つ必要です。連結した文字列 1 つではありません。配列の長さから `IN (@p0, @p1, @p2)` を組み立て、要素を個別にバインドするのが安全な形です。値をカンマでつなぐと、呼び出し側がまた文の中に入ってきます。テーブル値パラメーターや `WHERE id = ANY(@ids)` も、パラメーター 1 つで同じ仕事をします。
- ストアドプロシージャは自動的に安全ではありません。内部で文を組み立てて動的に実行するプロシージャは、一段下でまったく同じ問題を抱えていて、そちらのほうが見えにくいのです。プロシージャの中でもパラメーター化するか、組み立てた文字列ではなくパラメーターを取る `sp_executesql` を使います。
- 手作業のエスケープは戦略ではありません。チートシートがこれをレガシーコードの最後の手段としてだけ挙げているのには理由があります。文字集合と引用の扱いとあらゆる境界事例を、すべての分岐で、永遠に正しく当て続ける必要があるからです。パラメーターにはその失敗点が 1 つもありません。値がパーサーに入らないからです。
- エラーページに地図を渡させないでください。失敗した文が載ったスタックトレースは、初対面の相手にテーブル名と列の型、どの入力がデータベースまで届くのかを教えます。詳細は自分が読める場所に記録し、外へは味気ないメッセージを返します。呼び出し側が尋ねられないはずの質問に答えてしまう応答時間の差や行数の差にも、同じ規則が当てはまります。
- 検証は防御ではありません。防御として扱った瞬間に、シーンの 3 番目のステップは悪い終わり方をします。形式の規則は、こちらが想像した入力に合わせて書かれています。パラメーター化は、値が何を含んでいようと関係のない構造的な性質です。だからパラメーター化が先で、検証が 2 番目なのです。
- クライアント側の検証はユーザー体験のための機能です。往復を減らしてはくれますが、何も止めません。問題になるリクエストは、そもそもこちらのフォームを通っていないからです。

## .NET では

ADO.NET のパラメーターが、ほかのすべての土台です。値は文の中ではなく横を移動し、パラメーターに型を与えれば、データベースがインデックスを静かに台無しにする暗黙の変換も防げます。

```csharp
const string sql = "SELECT Id, Name FROM Customers WHERE Name = @name AND Region = @region";

await using var command = new SqlCommand(sql, connection);
command.Parameters.Add("@name", SqlDbType.NVarChar, 128).Value = name;
command.Parameters.Add("@region", SqlDbType.Char, 2).Value = region;

await using var reader = await command.ExecuteReaderAsync(ct);
```

Dapper は匿名オブジェクトを受け取って同じことをします。安全なほうが短くもある理由です。

```csharp
var customers = await connection.QueryAsync<Customer>(
    "SELECT Id, Name FROM Customers WHERE Region = @Region",
    new { Region = region });
```

EF Core では LINQ がすでに答えです。次の比較はプレースホルダーとパラメーターにコンパイルされ、貼り合わせた SQL になる書き方はありません。

```csharp
var customers = await db.Customers
    .Where(c => c.Name == name && c.Region == region)
    .ToListAsync(ct);
```

生の SQL が本当に必要なときに手を伸ばす先は、補間版のオーバーロードです。`FromSql` は文字列補間のように読めて、パラメーターバインドのように動きます。穴のひとつひとつがテキストではなく `DbParameter` になります。

```csharp
var customers = await db.Customers
    .FromSql($"SELECT * FROM Customers WHERE Region = {region}")
    .ToListAsync(ct);

await db.Database.ExecuteSqlAsync(
    $"UPDATE Customers SET Region = {region} WHERE Id = {id}");
```

文をテキストとして先に組み立てないでください。この 1 行がバグのすべてで、レビューで見つけるべき形です。

```csharp
// 禁止。値が文の一部になり、その文はもう呼び出し側のものです。
var sql = "SELECT * FROM Customers WHERE Name = '" + name + "'";
```

`Raw` 版はそれが必要な場合のためにあり、書式文字列と引数を取るので、そこでも値はパラメーターのままにできます。

```csharp
// 名前に反してパラメーター化されます。{0} は貼り付けではなくバインドです。
var customers = await db.Customers
    .FromSqlRaw("SELECT * FROM Customers WHERE Region = {0}", region)
    .ToListAsync(ct);
```

識別子は依然としてパラメーターにできないので、並び替えは文字列ではなく許可リストです。呼び出し側はキーを選び、SQL はこちらが選びます。

```csharp
static readonly Dictionary<string, string> SortColumns = new(StringComparer.OrdinalIgnoreCase)
{
    ["name"] = "Name",
    ["created"] = "CreatedUtc",
};

if (!SortColumns.TryGetValue(request.Sort ?? "name", out var column))
    return Results.BadRequest("unknown sort key");

var sql = $"SELECT * FROM Customers ORDER BY {column}";   // 呼び出し側ではなく対応表から来た列
```

検証は API の境界、リクエストモデルの中に置きます。ここまでのどれかが動く前に、筋の通らない値を断れる場所です。

```csharp
public sealed record CustomerQuery(
    [property: StringLength(128, MinimumLength = 1)] string Name,
    [property: RegularExpression("^[A-Z]{2}$")] string Region,
    [property: Range(1, 100)] int PageSize);
```

最後の部品はアカウントです。アプリは自分自身としてログインし、実際に使う権限だけを持ちます。上のどこかで間違いが起きても、このログインにできる範囲で収まるようにです。

```sql
CREATE USER app_orders WITH PASSWORD = '...';
GRANT SELECT, INSERT, UPDATE ON SCHEMA::orders TO app_orders;
-- DDL なし、他スキーマなし、サーバーレベルの権限なし
```

この一覧を順に読み直すと、そのままシーンになります。値は決して文の一部にならず、明らかなでたらめはそもそも入れず、それでも入ってきたものはログイン 1 つに許された分だけしか届きません。
