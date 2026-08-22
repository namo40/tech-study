---
title: "Middleware Pipeline"
summary: "Middleware Pipeline は、各コンポーネントが入ってくるリクエストを一度、出ていくレスポンスを逆順で一度見る鎖です。どれもが鎖を断ち切ることができ、その順序がそのままアプリケーションの境界の設計になります。"
category: ".NET ランタイムとホスティング"
scene: middleware-pipeline
steps:
  - title: "入って、出る"
    text: "リクエストはすべてのミドルウェアを順に通って Endpoint に届き、レスポンスは同じミドルウェアを逆順にさかのぼります。各ミドルウェアは自分より下のすべてを包みます。"
  - title: "ショートサーキット"
    text: "ミドルウェアは次を呼ばずに自分で応答できます。Authentication の 401 や、Static files がそのまま返すファイルがそうです。その下の層はまったく実行されません。"
  - title: "例外はさかのぼる"
    text: "Endpoint で投げられた例外は、すべてのミドルウェアを逆向きに上っていきます。いちばん外側のものだけがそれを適切な 500 に変えられるので、例外ハンドラーは先頭に置きます。"
  - title: "順序が設計そのもの"
    text: "同じミドルウェアでも順序が違えば別のアプリケーションです。例外ハンドラーは先頭、安価な保護は高価な処理より前、Authentication は Authorization より前、Endpoint は最後です。"
related:
  - label: Endpoint Routing
    slug: endpoint-routing
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
  - label: Kestrel
    slug: kestrel
  - label: Rate Limiter
    slug: rate-limiter
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: CORS
    slug: cors
  - label: Application Lifetime
    slug: application-lifetime
references:
  - title: ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0
  - title: Write custom ASP.NET Core middleware
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/write?view=aspnetcore-10.0
  - title: ASP.NET Core APIs overview
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0
---

## いつ使うか

- すべてのリクエスト、あるいはすべてのレスポンスを必ず見る必要がある処理。エラー処理、HTTPS リダイレクト、静的ファイル、ルーティング、CORS、Authentication、Authorization、レート制限、圧縮、ロギングがそうです。
- エンドポイントごとに繰り返すべきでない横断的関心事

## 注意点

- 順序は見た目の問題ではありません。`UseExceptionHandler` を先頭に、`UseStaticFiles` は `UseRouting` より前に、`UseRouting` はどのエンドポイントが選ばれたかを知る必要があるすべてより前に、`UseAuthentication` は `UseAuthorization` より前に、エンドポイントは最後に置きます。
- `next` の呼び出しを忘れたミドルウェアは、黙って鎖を断ち切ります。断つなら意図して断ちます。
- `next` を呼ぶ前にレスポンス本文を書き、そのあとで後続のミドルウェアがヘッダーを変えてくれることを期待してはいけません。その時点でヘッダーはもう送り出されています。
- ミドルウェア内のリクエストごとの処理は軽く保ちます。後続のミドルウェアがどのみち拒否するリクエストも含め、すべてのリクエストで動くからです。

## .NET では

```csharp
var app = builder.Build();

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// A middleware sees the request on the way in and the response on the way out.
app.Use(async (context, next) =>
{
    var started = Stopwatch.GetTimestamp();
    await next(context);                       // everything below runs here
    var elapsed = Stopwatch.GetElapsedTime(started);
    context.Response.Headers["X-Elapsed-Ms"] = elapsed.TotalMilliseconds.ToString("F0");
});

app.MapGet("/orders/{id:int}", (int id) => Results.Ok(new { id }))
   .RequireAuthorization()
   .RequireRateLimiting("per-client");

app.Run();
```

`Map` はパスに応じてパイプラインを分岐させ、`Run` はつねに鎖を終わらせる終端ミドルウェアであり、`AddEndpointFilter` で登録するエンドポイントフィルターは、ルーティングがすでにエンドポイントを選んだあとに動く、より軽い選択肢です。
