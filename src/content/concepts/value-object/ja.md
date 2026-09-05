---
title: "Value Object"
summary: "内容で等しさが定義される不変オブジェクトです。id も履歴も repository もありません。直す代わりに新しい値へ置き換え、それを運ぶエンティティの列として保存されます。"
category: ".NET データアクセス"
scene: repository
sceneStep: 4
related:
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Aggregate
    slug: aggregate
  - label: Aggregate Root
    slug: aggregate-root
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
references:
  - title: "Implement value objects"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/implement-value-objects
  - title: "Complex types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/complex-types
  - title: "Owned entity types in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/owned-entities
  - title: "Value conversions in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/value-conversions
---

シーンの 4 番目のステップは、`10 USD` のチップ 2 枚を台に置き、判定は `same` です。続いて誰かが 1 枚を変えようとしますが、チップが編集される代わりに捨てられ、その場所に、やはり `10 USD` を持った新しいチップが現れ、判定は `same` のままです。この 2 つのビートが定義のすべてです。等しさは内容であり、変更は置き換えです。

違いを体感する一番やさしい道は、逆がなぜ奇妙なのかを問うことです。10 ドル 2 つは「たまたま等しい別々の 10 ドルが 2 つ」ではありません。どちらがどちらかという事実そのものがありません。値には、それが何であるかのほかに何もないからです。ある特定の 10 ドルの履歴を尋ねるのは範疇の誤りですが、ある特定の顧客の履歴を尋ねるのはそうではありません。値オブジェクトに id がないのはこのためです。id が指し示す相手がそもそもいません。

残りはすべてここから出てきます。値が内容そのものなら、内容を変えた時点で別の値になるので、その場で変えてはいけません。修正に見える操作は、代わりに新しいインスタンスを返します。この不変性は安全のために課した規律ではなく、概念がすでに意味していたことであり、安全はその副産物です。値は 2 つの集約で分け持ってもよく、フィールドに入れてもよく、辞書の鍵にしてもよく、スレッド境界を越えて渡しても誰も気にする必要がありません。テストも一緒に平らになります。値を受け取る関数には準備も後片付けもなく、表明は等しいかどうかを見るだけになります。

値オブジェクトは、小さなものについてのドメイン規則が住む場所でもあります。`Money`、`EmailAddress`、`DateRange`、`PostalCode` のそれぞれが、どんなコードからでも無意味な値を入れられたプリミティブを置き換え、それぞれが無意味な値を一度だけ、全員の代わりに拒むコンストラクターを持ちます。実務ではたいてい、こちらのほうが等値性の規則より大きな利得です。クラスのどこかに `decimal` の金額と `string` の通貨が別々に置かれていれば、それはいつか起きる加算のバグであり、`Money` はそれを不可能にする場所です。

.NET では `record` か `readonly record struct` が、構造的な等値性と妥当な `GetHashCode`、そして置き換えのための `with` をくれます。契約のすべてがキーワード 1 つに入っています。

```csharp
public readonly record struct Money(decimal Amount, string Currency)
{
    public static Money Of(decimal amount, string currency) =>
        currency.Length == 3 ? new(amount, currency.ToUpperInvariant())
                             : throw new ArgumentException("a currency is three letters");

    public Money Add(Money other) =>
        other.Currency == Currency
            ? this with { Amount = Amount + other.Amount }   // 変更ではなく新しい値
            : throw new InvalidOperationException("mixed currencies");
}
```

保存も同じ規則に従います。アイデンティティがないので値を掛けておく場所がなく、だからそれを運ぶエンティティの一部として保存されます。`ComplexProperty` は所有者のテーブルの列に収め、`Money` テーブルもなければ、それだけを読み込む方法もありません。「repository がない」をモデリングに移すと、この姿になります。隣にある道具 `OwnsOne` は、代わりに所有された*エンティティ*を対応付けます。キーを持ち、それ自体が追跡され、参照型でなければならないので、`readonly record struct` を所有型にはできません。

```csharp
model.Entity<Order>(order =>
{
    order.ComplexProperty(o => o.Total);   // Orders の Total_Amount と Total_Currency
    order.OwnsMany(o => o.Lines);          // 明細は注文の外では生きられません
});
```

値が本当に 1 列なら、複合型より値変換のほうが軽くなります。ドメインは型を保ち、データベースはプリミティブを保ちます。

```csharp
model.Entity<Customer>()
     .Property(c => c.Email)
     .HasConversion(email => email.Value, text => EmailAddress.Of(text));
```

持ち帰る注意が 2 つあります。1 つ目は、EF Core がその値を所有者を通して追跡するので、新しいインスタンスを丸ごと代入すること (`order.Total = order.Total.Add(line.Amount)`) がそのまま更新になることです。変えるものも、別に保存するものもありません。2 つ目は、`record` が値には正しく、エンティティには誤りだということです。2 つのページの境目はまさにそこにあります。エンティティに構造的な等値性を与えると、今日たまたま名前が同じ別々の顧客が同じ顧客になり、引っ越したあとの同じ顧客は他人になります。
