---
title: "Deserialization Security"
summary: "逆シリアル化は、自分が書いたのではないバイト列を生きたオブジェクトに戻す作業であり、その生成の瞬間が攻撃面です。防御は、ペイロード自身が型を名指しできる形式を断り、逆シリアル化のひとつひとつを信頼境界として扱うことです。"
category: "アプリケーションセキュリティ"
related:
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
  - label: SQL Injection
    slug: sql-injection
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Web Application Firewall
    slug: web-application-firewall
references:
  - title: Deserialization risks in use of BinaryFormatter and related types
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide
  - title: Deserialization Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
  - title: JSON serialization and deserialization in .NET
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
---

## いつ使うか

- 外部のバイト列がオブジェクトになる地点をすべて一覧にします。リクエストの本文だけではありません。キューのメッセージ、キャッシュの項目、アップロードされたファイル、Webhook のペイロード、別のサービスが書き込んだ行も逆シリアル化されますし、ひと目で「利用者の入力」に見えないほうこそ誰も見直していない側です。「自分たちで書いたデータだ」は、ほかの誰もそのストアに書けないあいだしか成り立ちません。共有の Redis やアクセス方針の広いキューなら、そのバイト列も信頼境界の外です。
- 古いバイナリフォーマッターの点検は常設の作業にします。`BinaryFormatter`、`SoapFormatter`、`NetDataContractSerializer`、`LosFormatter` はいずれも、ペイロードの中に書かれた型をそのまま復元します。ペイロードに何が入っているかによらず、この性質そのものが安全ではありません。見つけるのは検索一回、置き換えるのは移行作業なので、期限に追われる前に始めるほうが楽です。
- 型のメタデータを載せた JSON は別に見直します。CLR の型名が入ったフィールドのある文書は、何を作るかを逆シリアル化器に選ばせているのであり、その選択権は送ってきた側ではなくこちらの許可リストにあるべきです。
- 新しい連携の形式を選ぶ段階から設計の問題として扱います。スキーマの決まった契約優先の形式は、この種類の問題をまるごと消してくれます。最初に決めれば費用はゼロ、あとで変えれば書き直しです。

## 注意点

- `BinaryFormatter` は .NET 9 で削除されたので、移行はもう選択肢ではありません。API は非推奨になり、次に例外を投げるようになり、いまは実装そのものがランタイムから消えています。まだこれに頼っている部品は、アップグレードした瞬間に止まる部品です。互換パッケージを探すより、形式の変更を計画します。
- 型名の扱いは、データ形式をコード選択の仕組みに変えてしまいます。Newtonsoft.Json の `TypeNameHandling.Auto` と `TypeNameHandling.All` は、どの型を作るかを文書に決めさせます。自分たちが作ったデータなら受け入れられますが、受け取ったデータなら危険です。外から届きうる経路では `None` のままにしてください。
- 逆シリアル化したあとに検証するのは、すでに手遅れです。生成そのものがコードを走らせます。コンストラクター、プロパティのセッター、コールバック、ファイナライザーが、こちらの検査がオブジェクトを見る前に動いてしまいます。だから検査は、出てきたオブジェクトではなく、入力の形と許可された型の集合に対して行うものです。
- 深さと大きさは解析の前に制限します。深く入れ子になった文書や巨大な文書は、解析だけで CPU とメモリーを食います。型で細工する必要すらないサービス拒否です。最大の深さを決め、リクエスト本文の大きさに上限を置き、切り詰めずに拒否します。

## .NET では

- `System.Text.Json` は、文書が名指しした型を作らないので既定で安全です。多態は明示的に有効にし、閉じた一覧としてだけ使います。許可する派生型を `[JsonDerivedType]` で宣言すると、その一覧にない識別子は検索の失敗ではなく逆シリアル化の失敗になります。

```csharp
// The allow-list is in your code; the payload only picks from it.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(CardPayment), "card")]
[JsonDerivedType(typeof(BankTransfer), "transfer")]
public abstract class Payment;

var options = new JsonSerializerOptions
{
    // Parsing limit, applied before any object exists.
    MaxDepth = 32,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
};
```

- パーサーの上限は、エンドポイントの上限の隣に並べて置きます。`MaxDepth` が入れ子を止め、ASP.NET Core のリクエスト本文の大きさ制限がパーサーに届くバイト数を止めます。ふたつがそろって初めて、悪意ある文書の資源消費が遅くなることではなく拒否として終わります。
- `DataContractSerializer` の系統は型名ではなく契約に結び付いており、既知の型はコードで宣言します。だから XML 連携の行き先としては妥当です。ただし既知の型の一覧を閉じたままに保ち、XML リーダーが文書型定義と外部エンティティを無視するよう設定しておく必要があります。
- できるところでは移行を機械的にします。自分たちの部品どうしでバイナリにシリアル化していたペイロードは、たいてい同じフィールドを持つ JSON や protobuf の契約にそのまま移せます。契約を明示的に書き出すことが、次の部品が公開するつもりのなかったオブジェクトグラフをシリアル化するのを止めてくれます。
