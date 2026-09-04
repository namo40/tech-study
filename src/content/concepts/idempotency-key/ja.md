---
title: "Idempotency Key"
summary: "Idempotency-Key は、何かを変えるリクエストを二重に変えることなく送り直せるようにするヘッダーです。サーバーはキーを覚えておき、作業は一度だけ行い、同じキーで来たリクエストには保存した応答をそのまま返します。"
category: "API とリアルタイム通信"
scene: idempotency-key
steps:
  - title: "キーのない再試行"
    text: "決済は通りましたが応答が失われ、クライアントはもう一度送ります。サーバーは再試行と新しい注文を区別できません。二重に課金されます。"
  - title: "キーを覚える"
    text: "クライアントは再試行のたびに同じキーを送ります。サーバーは最初にキーと結果を保存しておき、再試行には決済に触れずその応答をそのまま返します。"
  - title: "同時に 2 つ"
    text: "ダブルクリックで同じキーが 2 回送られます。先に来たほうがキーを確保し、2 つ目は結果を待つか、409 を受けて問い直します。どちらでも課金は 1 回です。"
  - title: "範囲と寿命"
    text: "キーは 1 つのクライアントと 1 つのリクエスト本文に属します。同じキーに別の本文は拒否されます。キーは期限切れになるのでストアは小さく保たれ、古いキーは新しいリクエストとして再利用できます。"
related:
  - label: Idempotency
    slug: idempotency
  - label: Deduplication
    slug: deduplication
  - label: Unique Constraint
    slug: unique-constraint
  - label: Retry
    slug: retry
  - label: Message ID
    slug: message-id
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: REST
    slug: rest
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
references:
  - title: The Idempotency-Key HTTP Header Field (IETF draft)
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Stripe idempotent requests
    url: https://docs.stripe.com/api/idempotent_requests
---

## いつ使うか

- 何かを作る、あるいはお金を動かす POST すべてに。決済、注文、メッセージ送信、リソースの払い出しが該当します。
- タイムアウトや失われた応答で再試行するクライアントすべてに。つまり事実上すべてのクライアントです。
- ボタンの二度押しや、止まったように見える画面の再読み込みで、同じ意図が 2 回送られうる場所すべてに。

## 注意点

- キーの範囲は認証されたクライアント単位に絞ります。キー空間が全体で 1 つだと、あるクライアントがキーを当てて別のクライアントのリクエストを再生させられます。
- リクエストの指紋をキーと一緒に保存し、同じキーに別の本文が来たら拒否します。これがないと、キーは見当違いの応答を受け取る経路になります。
- 作業を始める前にキーを原子的に確保します。一意制約や条件付き INSERT を使わないと、同時に届いた 2 つのリクエストが検査を並んで通り抜け、どちらも進んでしまいます。
- キーの寿命は現実的な再試行を覆う長さ (数時間から 1 日程度) にし、文書に書いておきます。短すぎれば遅れて来た再試行がもう一度課金し、無期限ならストアは増え続けます。
- そもそも繰り返しても結果が変わらない設計 (冪等な設計) を優先します。クライアントが決めた id で送る `PUT` や、カート 1 つに注文 1 つといった業務上の一意制約がそれにあたります。キーは、それ自体では繰り返しが安全にならない操作のための手段です。

## .NET では

ヘッダーの検査はそれを必要とするエンドポイントの手前 1 か所だけで行い、キーは作業が終わったあとではなく始める前に確保します。

```csharp
public sealed class IdempotencyFilter(IIdempotencyStore store) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!http.Request.Headers.TryGetValue("Idempotency-Key", out var key))
            return Results.BadRequest(new { error = "Idempotency-Key header is required" });

        var client = http.User.FindFirstValue("sub") ?? "anonymous";
        var fingerprint = await RequestFingerprint.ComputeAsync(http.Request);

        // Claim the key atomically: unique (client, key) row. Returns the existing row on conflict.
        var claim = await store.TryClaimAsync(client, key!, fingerprint, TimeSpan.FromHours(24), http.RequestAborted);
        switch (claim.State)
        {
            case ClaimState.Done:       return Results.Json(claim.Response, statusCode: claim.StatusCode); // replay
            case ClaimState.InProgress: return Results.StatusCode(StatusCodes.Status409Conflict);
            case ClaimState.Mismatch:   return Results.UnprocessableEntity(new { error = "Key reused with a different request" });
        }

        var result = await next(context);                       // first time: do the work
        await store.CompleteAsync(client, key!, result, http.RequestAborted);
        return result;
    }
}

app.MapPost("/payments", CreatePayment).AddEndpointFilter<IdempotencyFilter>();
```

保証が実際に生まれるのは `TryClaimAsync` なので、これは 1 回の原子的な操作でなければなりません。`(client, key)` に一意制約を張ったテーブルへ `INSERT` し、衝突したら既存の行を返す。あるいは Redis の `SET NX` で有効期限を同じ呼び出しに含める。保存するときは応答本文とステータスコードをキーと一緒に入れます。再生した応答が最初の応答と区別できてはいけないからです。指紋も一緒に入れます。同じキーに別の本文が来るのは再試行ではなく、呼び出す側のバグだからです。
