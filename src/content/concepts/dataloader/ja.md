---
title: "DataLoader"
summary: "DataLoader は、ひとつの要求の中に散らばって起きる個別の照会をまとめて一度に取りに行き、その答えを要求が終わるまで覚えておきます。GraphQL のリゾルバーの木が構造として生む N+1 に対する標準の処方です。"
category: "API とリアルタイム通信"
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Batching
    slug: batching
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Cache-Aside
    slug: cache-aside
  - label: REST
    slug: rest
  - label: gRPC
    slug: grpc
references:
  - title: DataLoader
    url: https://chillicream.com/docs/hotchocolate/fetching-data/batching/dataloader
  - title: graphql/dataloader
    url: https://github.com/graphql/dataloader
---

## いつ使うか

- 実行の仕組みが取得をフィールドの単位で撒き散らすときに使います。GraphQL がしているのはまさにそれです。リゾルバーはひとつのノードのために書かれ、兄弟については何も知らないので、注文明細を 50 行返すクエリは商品のリゾルバーを 50 回実行し、その一回一回は正しく孤立した一行の照会です。そのコードに誤りはひとつもなく、合計はやはり往復 50 回です。DataLoader は、リゾルバーがひとつずつ尋ねるやり方をそのままにしながら、通信の側には 50 件ぶんの要求ひとつだけを見せる部品です。
- 読み取りの層が一覧の上へ広がり、項目ごとに同じ種類の親や子を要するときに使います。この形は GraphQL だけのものではありません。複数のサービスから画面をひとつ組み立てる端点も、参照表で行を飾る射影も、コレクションの上を回りながら中でリポジトリーを呼ぶコードも、同じ形であり処方も同じです。
- ひとつの要求の中で同じキーを何度も尋ねるときに使います。同じ商品を指す明細が 10 行あれば同一の照会が 10 回できますが、ローダーの要求のあいだの記憶はそれを取得ひとつとメモリーの読み取り 9 回に変えます。誰かが重複に気づいたり、要求の冒頭で辞書を手作りしたりする必要はありません。

## 注意点

- このキャッシュは要求の範囲のもので、共有のキャッシュではありません。ひとつの実行が同じものを二度尋ねないために存在し、応答が書き出された時点で消えます。安全な理由はまさにそこで、読み取った取引より長く生きるものがないので、無効化という問題そのものがありません。要求と要求のあいだのデータベースの負荷を減らすためにここへ手を伸ばさないでください。それは期限と無効化の問いが付いてくる cache-aside の仕事であり、もっとキャッシュを効かせようとローダーを単一のインスタンスとして登録した瞬間に、安全だった補助が古い値をテナントの境を越えて漏らす代物になります。
- 束ねはひとつの実行の刻みで起こり、それは時間ではなく実際の境目です。エンジンがいまの階層を解いているあいだに集まったキーがまとめて送られます。その送り出しのあとに出た照会や、別の何かを待つ `await` の陰に隠れていた照会は、次の束か、自分だけの束に落ちます。原文で隣り合って見える呼び出しが二つのクエリを生むことがあるのはこのためで、収集の窓がどこで閉じるかを知っているかどうかが、追跡と当て推量を分けます。
- キーの一覧が大きくなると、それを移し替えた先の限界に当たります。`IN` 句には引数の上限があり、計画のキャッシュは一覧の長さごとに項目ひとつずつで埋まり、キーが一万個の束は誰も実体化したくなかった結果の集合を返します。束の大きさに上限を置き、ローダーに要求を何度かに分けさせてください。batching の側が述べている規律と同じです。そして大きすぎる束がひとつ失敗すれば、それを待っていた呼び出し側がまとめて失敗することも覚えておいてください。
- 読み取りの側だけの道具です。書き込みには順序と取引の問題があり、同じ要求を二度送ったときに結果が変わってしまう問題も付いてきますが、照会をまとめる仕掛けはそのどれも扱いません。しかも結果を要求のあいだ覚えておくことは、その結果を変える更新の前では積極的に誤りです。同じ要求の中で更新が走るなら、影響を受けるエンティティのローダーが書き込み前の値をまだ抱えていないかを確かめてください。

## .NET では

- Hot Chocolate は束ねのメソッドからローダーを生成してくれます。こちらは集まったキーを受け取って辞書を返し、リゾルバーは変わらずひとつだけを尋ねます。

```csharp
internal static class ProductDataLoaders
{
    // One call per tick, with every key the resolvers asked for in that tick.
    [DataLoader]
    internal static async Task<Dictionary<int, Product>> GetProductByIdAsync(
        IReadOnlyList<int> ids,
        ShopDbContext db,
        CancellationToken ct) =>
        await db.Products
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);
}

// The resolver knows about one line and one product. The batching is not its problem.
public async Task<Product?> GetProductAsync(
    [Parent] OrderLine line,
    IProductByIdDataLoader productById,
    CancellationToken ct) =>
    await productById.LoadAsync(line.ProductId, ct);
```

- `Where(p => ids.Contains(p.Id))` がキーの一覧をひとつの `IN` のクエリに変える EF Core 側の形で、要求と同じ型をキーにした辞書を返すことが、ローダーが待っている呼び出し側それぞれへ自分の行を手渡せるようにしている部分です。行のないキーはただ項目がないだけで、ローダーはそれを誤りではなく `null` として報告します。
- 一対多の側の双子はグループのローダーです。キーひとつが一行ではなく一覧に対応する場所では、束ねのメソッドが辞書ではなく参照の集まりを返し、呼び出し側を何ひとつ変えずに、この注文それぞれの明細という問いを引き受けます。
- ローダーは要求ごとに登録します。Hot Chocolate の統合が代わりにしてくれることでもあります。REST や gRPC の組み立ての層のために同じ型を手で書くなら、寿命も同じに保ってください。辞書ひとつと束ねの通り道ひとつを抱えた範囲付きのサービスが要求とともに破棄される、それが型のすべてです。
