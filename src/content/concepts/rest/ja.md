---
title: "REST"
summary: "REST は HTTP そのものを契約として使うための制約の集まりです。リソースには住所があり、そのリソースに何をするのかは標準のメソッドが表し、ステータスコードもキャッシュヘッダーもコンテントネゴシエーションも、下に隠れた配管ではなく API の一部です。"
category: "API とリアルタイム通信"
related:
  - label: gRPC
    slug: grpc
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Pagination
    slug: pagination
  - label: CORS
    slug: cors
  - label: API Gateway
    slug: api-gateway
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: "RFC 9110: HTTP Semantics"
    url: https://www.rfc-editor.org/rfc/rfc9110.html
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

## いつ使うか

- チームや組織の境界を越える API の既定にします。利用側はすでに HTTP クライアントを持っていて、プロキシもゲートウェイもブラウザーもすでにメソッドとステータスコードを理解していて、キャッシュと条件付き要求の仕組みは使っても使わなくてもそこにあります。ほかを選ぶ側には理由が要り、REST を選ぶ側には要りません。
- ドメインが本当に名前を付けられるものの集まりであるときに使います。注文、請求書、ユーザーとその下のコレクションには自然な住所があります。`/orders/4417` が URL になった時点で「取ってくる」「置き換える」「消す」「似たものを並べる」は、こちらの文書ではなくプロトコルがすでに定めたものになります。
- ブラウザーや第三者が直接呼びに来るなら使います。REST のエンドポイントには、生成するものも入れるものもなしに `fetch` から、`curl` から、表計算から、取引先の連携基盤から届きます。開発中だけ便利という話ではなく、インターフェイスが実際に備えている性質です。
- 読み取りが大半なら、間に立つものたちに寄りかかります。`ETag` と `Cache-Control` の付いたキャッシュ可能な `GET` は、CDN もリバースプロキシもクライアント自身のキャッシュもこちらの代わりに答えさせますし、`304 Not Modified` は描画された応答ではなくヘッダーのやり取り 1 回分の費用です。ただしこのてこは、API が意味論を実際に使っているときにだけ生まれます。

## 注意点

- メソッドの意味論がそのまま契約であり、これを取り違えると自分と呼び出し元の間にあるすべての層を欺くことになります。`GET` は安全でなければなりません。ブラウザーもクローラーも先読みも勝手に呼ぶので、何も変えてはいけません。`PUT` と `DELETE` は、同じ要求をもう一度送っても 1 回送ったときとリソースの状態が変わらないように書く必要があり、それがタイムアウト後のクライアントの再送を無害にします。`POST` にはそのどちらの約束もなく、だからこそ `POST` の再送の話には Idempotency-Key が要ります。
- REST は「HTTP の上の JSON」ではなく、`POST` で JSON の本文だけをやり取りする API は利点をひとつも受け取れません。値打ちがあるのは、チームがよく飛ばすほうです。検証の失敗と障害をクライアントが見分けられる意味のあるステータスコード、同時に書く者どうしが上書きし合わないための条件付き要求、間に立つものが手伝えるようにするキャッシュヘッダー、表現をもうひとつ増やすためにエンドポイントを増やさずに済むコンテントネゴシエーションです。
- バージョニングの方針は、最初の外部利用者が現れる前に決めます。URL の区切りでも、メディアタイプのパラメーターでも、ヘッダーでも、どれも弁護できる選択で、高くつく失敗はフィールドの形を変える必要が出たときに答えがないことです。何が追加であり安全なのかという規則も一緒に置いてください。スキーマ変更で使う、広げてから縮める順序は、API の表面にもそのまま当てはまります。
- 様式を純粋に保つためだけに、操作を無理やりリソースへ変えないでください。ある種の処理は本当に動詞です。再計算、突合、送信、再試行がそうです。それを名詞の袋として設計すると、誰も名前を付けられないエンドポイントと、誰も推測できない契約ができあがります。動詞の形の経路に `POST` を置くのはまっとうな答えですし、表面がすべてそう見えるなら、正直な結論は、このインターフェイスが欲しかったのは gRPC かメッセージだったということです。

## .NET では

- Minimal API はリソースのルーティングを短く書けますし、結果のヘルパーはステータスコードをついでではなく明示的な選択として残します。

```csharp
var orders = app.MapGroup("/orders");

// The route is the resource, the method is the verb, and the return type is
// the full set of answers this endpoint can give.
orders.MapGet("/{id:guid}", async (Guid id, IOrderStore store) =>
    await store.FindAsync(id) is { } order
        ? Results.Ok(order)
        : Results.NotFound());

// PUT replaces at a client-chosen address: sending it twice leaves the same
// resource behind, so a client that timed out can simply send it again.
orders.MapPut("/{id:guid}", async (Guid id, OrderInput input, IOrderStore store) =>
{
    if (input.Total < 0)
    {
        // A machine-readable failure, not a string. Content type is
        // application/problem+json, which clients can branch on.
        return Results.Problem(
            title: "Total must not be negative",
            statusCode: StatusCodes.Status400BadRequest);
    }

    var created = await store.UpsertAsync(id, input);
    return created ? Results.Created($"/orders/{id}", input) : Results.NoContent();
});
```

- `AddProblemDetails` を入れると、エラーの形がただで揃います。一度登録しておけば、処理されなかった例外も、ステータスコードだけの応答も、同じフィールドを持つ `application/problem+json` で返ってきます。別々に育った失敗の形式が三つある代わりに、クライアントが見る形式はひとつになります。
- OpenAPI の生成は最初のエンドポイントからプロジェクトに入れておきます。`AddOpenApi` と `MapOpenApi` は、すでに宣言してあるルートと型から文書を作ります。契約が、ずれていく wiki のページではなく、利用側がクライアントを生成できるものになります。
- 公開する REST の表面の形は、フレームワークより隣のふたつが大きく左右します。手前に立つゲートウェイが認証とレート制限とバージョン別のルーティングを持ち、CORS がどのブラウザーのオリジンにそもそも呼ばせるかを決めます。ブラウザーから届かない REST API は、たいていエンドポイントが足りないのではなくポリシーが抜けています。
