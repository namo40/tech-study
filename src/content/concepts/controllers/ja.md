---
title: "Controllers"
summary: "Controllers は ASP.NET Core のクラスを基にした API のモデルです。アクションを 1 つの型にまとめ、同じエンドポイントルーティングの上に属性ルーティングを載せ、認証も検証もエラー処理も繰り返しのコードではなくフィルターのパイプラインの層にします。"
category: ".NET ランタイムとホスティング"
related:
  - label: Minimal APIs
    slug: minimal-apis
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: Create web APIs with ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-10.0
---

## いつ使うか

- 表面が大きくなり、規約が元を取り始めるときに持ち出します。いくつものリソースにまたがってアクションが数十個になると、属性ルーティングを使ったリソースごとのクラスがすべてのエンドポイントに同じ形を与えます。新しく入った人が URL だけを見て、それがどこにあるか見当を付けられるようになります。その見当の付けやすさが規約の売り物で、エンドポイントが多いほど値打ちが上がります。
- 認証と検証と監査とエラー処理が、ハンドラーごとに繰り返される行ではなく層であってほしいときに使います。承認フィルター、アクションフィルター、結果フィルター、例外フィルターが決まった順序でアクションを包み、全体にもコントローラー単位にもアクション単位にも掛かり、単体テストできる普通のクラスです。
- API の規約をひとまとめに有効にしたいときは `[ApiController]` に頼ります。属性ルーティングが必須になり、パラメーターのバインドが属性なしで出どころを推論し、モデルの検証に失敗したリクエストはアクションの本体が動く前に `400` で答えを受け取ります。
- チームがすでに MVC で考えているときに選びます。手元のフィルターもモデルバインダーも規約も、10 年ほど積み上がった慣れも、本物の資産です。大きな表面なら、誰も自信を持って歩き回れない新しい流儀より、チームがすでに読める流儀で書かれているほうがよい結果になります。

## 注意点

- アクションごとの仕掛けがあり、ホットパスではその値が計測に現れます。アクションの選択もモデルのバインドもフィルターの呼び出しも結果の実行もリクエストごとに費用を払うので、負荷の高いごく小さなサービスなら Minimal API はその層を丸ごと避けます。データベースとネットワークの時間が大半を占める普通の API では、その差は雑音の水準です。
- アクションが 40 個あるコントローラーは、ルーティングの属性が付いた巨大なクラスにすぎません。処方もいつもどおりです。動詞ではなくリソースで分け、ロジックはアクションが呼ぶサービスへ押し出し、コントローラーは HTTP とドメインの間の薄い翻訳として置きます。コントローラーを役に立たせるのも読みにくくするのも同じ成長で、分ける人がいるかどうかが分かれ道です。
- 自動の `400` は便利ですが、エラーの話の全部ではありません。`[ApiController]` はアクションが動く前に、妥当でない `ModelState` を `ValidationProblemDetails` の応答に変えてくれます。これはエラーの形式を統一するという約束より狭い約束です。処理されなかった例外や状態コードだけの応答も含めて、すべての失敗が `application/problem+json` で返ってくるようにするには、`AddProblemDetails` とその上に載せる例外処理の設定が要ります。
- 2 つのモデルの選択は、思想ではなく表面の大きさと規約がどれだけ要るかの問題です。どちらも同じエンドポイントルーティングの上に立ち、同じミドルウェアのパイプラインを通り、同じサーバーがホストするので、1 つのアプリケーションが Webhook には Minimal API のエンドポイントを割り当て、本体の API にはコントローラーを使っても、何の矛盾もありません。

## .NET では

- `[ApiController]` と属性ルーティングが標準の形で、自動の検証の応答は、アクションでなければ繰り返していた仕事を規約が代わりにしてくれる場所です。

```csharp
[ApiController]
[Route("api/[controller]")]                 // -> /api/orders
public class OrdersController(IOrderStore store) : ControllerBase
{
    // ActionResult<T> はペイロードの型とステータスコードの両方を見えるまま保ち、
    // OpenAPI の生成が読むのもこれです。CancellationToken のパラメーターは
    // HttpContext.RequestAborted にバインドされます。
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Order>> Get(Guid id, CancellationToken ct) =>
        await store.FindAsync(id, ct) is { } order ? Ok(order) : NotFound();

    // [ApiController] があると、不正なモデルはこの本体が動く前に
    // ValidationProblemDetails 付きの 400 で返されます。ここで ModelState を
    // 確認しても、到達しないコードにしかなりません。
    [HttpPost]
    public async Task<ActionResult<Order>> Create(OrderInput input, CancellationToken ct)
    {
        var created = await store.CreateAsync(input, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }
}
```

- フィルターは、その範囲のある場所に登録します。`builder.Services.AddControllers(o => o.Filters.Add<AuditFilter>())` はすべてのアクションに掛け、クラスに付けた属性はコントローラー 1 つへ範囲を狭め、`[ServiceFilter]` はフィルターをコンテナーから解決して依存を受け取れるようにします。
- 残りの失敗を 1 つにまとめるのは `AddProblemDetails` です。一度登録しておけば、状態コードだけの応答も処理されなかった例外も、自動の検証の応答と同じ `application/problem+json` の形で返り、クライアントは 3 種類のエラー形式ではなく 1 つだけを読めばよくなります。
- コントローラーと Minimal API のエンドポイントは 1 つのアプリケーションの中で共存します。`app.MapControllers()` と `app.MapGroup("/hooks")` は同じルーティングの表に加わり、その手前のミドルウェアのパイプラインは、どちらのモデルがそのエンドポイントを作ったのかを知りませんし気にもしません。
