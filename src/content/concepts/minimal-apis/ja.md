---
title: "Minimal APIs"
summary: "Minimal APIs は ASP.NET Core の儀式を削ったエンドポイントのモデルです。ルートとハンドラーが呼び出しひとつで結ばれ、その間にコントローラーのクラスがないので、読むエンドポイントがそのまま動くコードになります。"
category: ".NET ランタイムとホスティング"
related:
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: REST
    slug: rest
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
  - title: Minimal APIs quick reference
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis?view=aspnetcore-10.0
---

## いつ使うか

- 表面の小さいサービスやマイクロサービスでは既定にします。儀式の重さが機能の重さを上回る場所だからです。`MapGet` と `MapPost` の呼び出しで書いたエンドポイントの数個は一画面に収まり、ルートから動作をたどってきた人は、クラス名と属性と基底の型を先に解きほぐす代わりに、答えを返すラムダへ直接たどり着きます。
- ひとつのリソースに置き場所をひとつ与えたいときは `MapGroup` を使います。グループはルートの接頭辞に加えて、その下のすべてのエンドポイントに掛かるメタデータ、承認のポリシー、フィルターを一緒に運びます。`/orders` とその下のルートが、アクションごとに属性を繰り返す代わりに宣言をひとつ共有することになります。
- 横断的な関心事がアプリケーション全体ではなく一部のエンドポイントのものであるときに、エンドポイントフィルターを持ち出します。検証、テナントの判別、監査のログは、モデルバインドが終わったあとのルーティングされたエンドポイントの中で動きます。ミドルウェアはバインドされた引数を見られず、全体に掛けたフィルターは必要のないルートでも動く、その隙間がまさにここです。
- 起動の時間とトリミングが重要なワークロードで選びます。このモデルは Native AOT とリクエストデリゲートの生成器と一緒に動き、それが数十ミリ秒で立ち上がるコンテナーを現実的な目標にしてくれます。コントローラーのアクションのリフレクション中心のバインドは、そこで前に立ちはだかる部分でもあります。

## 注意点

- `Program.cs` が千行のファイルへ育つのを止める仕掛けはなく、フレームワークが代わりに止めてくれることもありません。規律は自分たちのものです。リソースごとに拡張メソッドひとつ、その中に `MapGroup` ひとつ、起動のコードには `app.MapOrders()` の一行。この段を飛ばしたチームはたいてい一年ほどあとにコントローラーを再発見し、同じ教訓の代金を二度払います。
- 慣れていた規約のうち、既定では付いてこないものがあります。`[ApiController]` がモデル検証の失敗から作ってくれていた自動の `400` はコントローラーの動作です。ですから最小のエンドポイントでの検証は、自分で呼ぶか、フィルターとして載せるか、選んで有効にする組み込みの検証の支援から受け取るかの仕事になります。チームが頼っている規約が何かを先に確かめてから移ってください。
- エンドポイントフィルターは MVC のフィルターではなく別の体系です。`IEndpointFilter` は `EndpointFilterInvocationContext` に入ったバインド済みの引数と一緒に、ルーティングされたエンドポイントの中で動きます。アクションフィルターやリソースフィルターとその順序の規則はコントローラーのパイプラインのものです。片方に向けて書かれたサンプルやパッケージが、もう片方にそのまま当てはまるわけではありません。
- 表面が大きく規約が中心なら、正直な選択は controllers です。二つのモデルは同じルーティングと同じホストの上にあるので、決めるための基準はどちらが今風かではなく、エンドポイントが何個あり、規約にどれだけ働いてほしいかです。ひとつのアプリケーションで両方を混ぜることも支援されていて、育ってきたサービスではそのほうが正しい答えであることも多いです。

## .NET では

- グループとフィルターを一緒に使うと、ルーティングの表が読めるようになります。グループが接頭辞と共通の関心事を握り、拡張メソッドがリソースを握り、`Program.cs` はアプリケーションが何を公開しているかの目次として残ります。

```csharp
// OrderEndpoints.cs - one file per resource, one method to map it.
public static class OrderEndpoints
{
    public static RouteGroupBuilder MapOrders(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/orders")
            .RequireAuthorization()
            .WithTags("Orders")
            // The filter applies to every endpoint added to this group below.
            .AddEndpointFilter<ValidationFilter<OrderInput>>();

        group.MapGet("/{id:guid}", (Guid id, IOrderStore store) => store.FindAsync(id));
        group.MapPost("/", (OrderInput input, IOrderStore store) => store.CreateAsync(input));

        return group;
    }
}

public sealed class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        // Filters see the bound arguments; middleware runs before binding and cannot.
        if (context.Arguments.OfType<T>().FirstOrDefault() is not { } model)
            return Results.BadRequest();

        return Validate(model) is { Count: > 0 } errors
            ? Results.ValidationProblem(errors)
            : await next(context);
    }
}

// Program.cs stays a table of contents.
app.MapOrders();
```

- ハンドラーの引数はどこでも同じやり方で解決されます。ルートの値もクエリ文字列も本文もコンテナーのサービスも型と名前でバインドされるので、`Guid id` と `IOrderStore store` を受け取るハンドラーに属性は要りませんし、規約が読み違える場合のために `[FromKeyedServices]` や明示的な `[FromBody]` が用意されています。
- `AddOpenApi` と `MapOpenApi` は、すでに宣言してあるものからドキュメントを作ります。ルートのパターンも引数の型も `TypedResults` の戻り値の型も、生成されるスキーマへそのまま入りますし、グループに付けた `WithTags` と `WithName` と `Produces` が、ドキュメントを手書きせずに空欄を埋める方法です。
- フィルターのパイプラインは入れ子になります。グループに付けたフィルターが個々のエンドポイントに付けたフィルターを包み、どちらもルーティングされたエンドポイントの中で動き、そのすべてはミドルウェアのパイプラインがこのリクエストはここのものだと判断したあとで動きます。
