---
title: "Entity"
summary: "属性ではなくアイデンティティで等しさが定義されるドメインオブジェクトです。id が同じ 2 つのエンティティは 1 つの存在の 2 つの時点であり、属性は今日の状態にすぎません。"
category: ".NET データアクセス"
scene: repository
sceneStep: 3
related:
  - label: Repository
    slug: repository
  - label: Value Object
    slug: value-object
  - label: Aggregate Root
    slug: aggregate-root
  - label: Aggregate
    slug: aggregate
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Unit of Work
    slug: unit-of-work
  - label: Change Tracking
    slug: change-tracking
  - label: Concurrency Token
    slug: concurrency-token
references:
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
  - title: "Change tracking in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/change-tracking/
  - title: "Design the infrastructure persistence layer"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design
---

シーンの 3 番目のステップは、2 枚のカードを台に置いて、この 2 つは同じものかと尋ねます。どちらも id 7 で、フィールドは目に見えて違うのに、判定は `same` です。続いてフィールドがそっくりで id だけが違う 2 枚が上がり、判定は `not same` です。これが定義のすべてです。わざわざはっきり書くのは、多くのコードベースでは既定がその逆だからです。ふつうオブジェクトは、中に何が入っているかを見て比較されます。

エンティティは生涯を持つ存在です。作られ、変わり、また変わるでしょうが、その全部を通り抜けても自分自身のままです。引っ越した顧客は同じ顧客です。明細が 1 つ増え、1 つ減り、割引が付いた注文も同じ注文です。ある瞬間の中身は、それをその注文にしてくれません。それをその注文にするのは、その id の下に綴じられているという事実です。2 つをフィールドで比較すれば、割引前の注文と割引後の注文は別の注文だと言うことになります。それは不便というより、ドメインについて間違っています。

この 1 つの決定が repository を可能にします。`FindAsync(id)` は、アイデンティティが尋ねられる対象であり、その答えが安定しているときにだけ意味を持ちます。追跡も、ストアが今返されたオブジェクトを自分が渡したものだと見分けられるときにだけ意味を持ちます。EF Core はまさにこの上に建っています。変更追跡器はエンティティ型と主キーで鍵を張った地図なので、1 つのコンテキストの中で同じ id を二度尋ねると、食い違う 2 つのオブジェクトではなく同じインスタンスが返ります。追跡中のエンティティを保存するときも、プロバイダーはオブジェクトグラフを値で突き合わせません。キーで引き当て、保っておいたスナップショットと現在値を比べ、動いた列だけを書きます。

.NET では一度書いておき、`Equals` を書くのをやめます。型と id を比べる小さな基底クラスが 1 つあれば、すべてのエンティティが正しくふるまい、そのふるまいが `Contains` にも `Distinct` にも `HashSet` にも、あらゆるテストの表明にも同時に効きます。代わりに見える、構造的な等値性を持つ `record` はここではまさに誤った道具です。record で作ったエンティティは、今日たまたま名前が同じだという理由で別々の顧客を等しいと言い、住所が変わったあとの同じ顧客を等しくないと言います。record は 1 ページ隣、値のための道具です。

```csharp
public abstract class Entity<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;

    public override bool Equals(object? other) =>
        other is Entity<TId> e && e.GetType() == GetType() && Id.Equals(e.Id);

    public override int GetHashCode() => Id.GetHashCode();
}
```

2 つの細部は正しく押さえてください。1 つ目は、id だけでなく実行時の型も比べることです。そうしないと id 7 の `Customer` と id 7 の `Order` が等しくなります。2 つ目は、まだ保存されていないエンティティが何なのかを決めることです。id をデータベースが生成するなら、作りたての 2 つのオブジェクトはどちらも既定の id を持ち、互いに等しいと出ます。その 2 つを集合に入れた瞬間、これは本物のバグになります。きれいな答えは id をドメインで生成することです。`Guid` を使うか、それを包んだ `OrderId` のような型を使えば、オブジェクトは存在した瞬間からアイデンティティを持ち、特別扱いが要らなくなります。

同時実行を語れるようにしているのもアイデンティティです。id で行を見つけ、バージョンを照らし合わせて、その間に誰かが動かしたかどうかを判断します。安定したアイデンティティがなければ、バージョンを照らす行そのものがありません。集約境界をまたぐ参照も同じです。そうした参照はオブジェクトではなく id を持ちますが、それが成り立つのは、id がエンティティについて変わらないと保証された唯一のものだからです。
