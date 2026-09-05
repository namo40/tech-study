---
title: "gRPC"
summary: "gRPC は protobuf のファイルがそのまま契約になる RPC フレームワークです。同じ定義からクライアントとサーバーのコードを生成し、小さなバイナリ形式へ直列化し、HTTP/2 の上で動くので、単項の呼び出しもストリームも 1 つの接続を分け合います。"
category: "API とリアルタイム通信"
related:
  - label: REST
    slug: rest
  - label: HTTP/2
    slug: http-2
  - label: Multiplexing
    slug: multiplexing
  - label: Streaming
    slug: streaming
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: gRPC Documentation
    url: https://grpc.io/docs/
  - title: Overview for gRPC on .NET
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/
---

## いつ使うか

- 両端とも自分たちのものであるサービス間の内部呼び出しで持ち出します。`.proto` ファイル 1 つが両側のビルドが参照する唯一の成果物なので、手書きの HTTP クライアントが呼び先のハンドラーとずれていくような形では、クライアントのスタブとサーバーの基底クラスはずれません。名前を変えたフィールドは、深夜 3 時ではなくビルドの時点でコンパイラが捕まえます。
- 呼び出しの形がリクエスト 1 つと応答 1 つではないときに使います。gRPC には 4 つあります。単項、サーバーストリーミング、クライアントストリーミング、双方向ストリーミングです。どれも片側に `IAsyncEnumerable` やストリームリーダーが付いた普通のメソッドです。進捗のフィードも、長いアップロードも、会話の形のやり取りも、ここでは最初のプロトコルの横に足した 2 つめのプロトコルではなく、メソッドのシグネチャです。
- 複数の言語が 1 つの契約に合意する必要があるときに使います。protobuf の定義 1 つから、C#、Go、Java、Python などそれぞれの言語らしいコードが生成されます。契約は、チームごとに少しずつ違う形で作り直される文書ではなく、リポジトリで共有される成果物になります。
- HTTP/1.1 の上の JSON が必要以上に高くつく内部のホットパスに向いています。バイナリの符号化は同じ内容の JSON より小さく解析も速く、HTTP/2 が呼び出しごとの接続準備をなくし、長く生きるチャネルが TLS の費用を分けて払います。1 日に数百万回という単位で数えるおしゃべりな経路なら、その差は微調整ではなく容量の判断です。

## 注意点

- ブラウザーは gRPC のサービスを直接呼べません。ブラウザーの JavaScript には、gRPC が必要とするフレーム単位の制御を与える API がありません。ですから公開側の入口には、変換するプロキシを置いた gRPC-Web か、同じサービスを REST の形の HTTP API として見せる JSON transcoding が要ります。最初の外部クライアントが付く前にどちらを使うか決めてください。入口を後から差し込むほうが、最初に選ぶより手間がかかります。
- 互換性の契約はフィールド名ではなくフィールド番号です。通信の形式が運ぶのは番号なので、フィールド名の変更は安全で、引退した番号の使い回しは静かなデータの汚染です。古い相手が新しいバイト列を古い意味で解釈するからです。消した番号は `reserved` にして決して回収せず、`.proto` ファイルはデータベースのマイグレーションと同じ重さで扱います。
- ロードバランシングは接続単位ではなく呼び出し単位である必要があります。gRPC は長く生きる HTTP/2 接続を 1 つ握り、すべての呼び出しをその上に流します。接続を配る L4 のバランサーを置くと、あるクライアントのトラフィックはすべて最初に当たったバックエンド 1 台に固定され、増えたばかりのレプリカには何も届きません。答えは呼び出しを理解するバランシングです。L7 のプロキシ、サービスメッシュのサイドカー、あるいはバックエンドの集合を知るリゾルバーを備えたクライアント側のロードバランシングです。
- エラーモデルは gRPC 独自のもので、HTTP のステータスコードときれいには対応しません。呼び出しは gRPC 自身の列挙型の `StatusCode` で失敗し、意味のある区別は転送の層ではなくそちらにあります。`DEADLINE_EXCEEDED` と `UNAVAILABLE` は再試行してよい組で、`FAILED_PRECONDITION` と `ABORTED` は再試行が助けになるかどうかで分かれます。HTTP のコードで分岐するクライアントのコードは、見る層を間違えています。

## .NET では

- サービスは ASP.NET Core のエンドポイントで、クライアントはファクトリから出てきます。`Grpc.AspNetCore` が `.proto` ファイルから基底クラスを生成し、`Grpc.Net.ClientFactory` パッケージが提供する `AddGrpcClient` は、`IHttpClientFactory` が `HttpClient` に与えているのと同じ寿命の管理をチャネルに与えます。

```csharp
// サーバー側です。生成された基底クラスが契約で、オーバーライドがコードです。
public class OrdersService : Orders.OrdersBase
{
    public override async Task<OrderReply> Get(OrderRequest request, ServerCallContext context)
    {
        // 呼び出し元の deadline は取り消しのトークンとして届きます。それを渡し続ける
        // ことが、見捨てられた呼び出しが下流で仕事を食い続けるのを止めます。
        var order = await repository.GetAsync(request.Id, context.CancellationToken);
        return new OrderReply { Id = order.Id, Status = order.Status };
    }
}

// クライアント側です。アドレスごとにチャネル 1 つを使い回し、すべての呼び出しに deadline を付けます。
builder.Services.AddGrpcClient<Orders.OrdersClient>(o =>
    o.Address = new Uri("https://orders.internal"));

var reply = await client.GetAsync(
    new OrderRequest { Id = id },
    deadline: DateTime.UtcNow.AddSeconds(2));
```

- すべての呼び出しに deadline を付け、受け取った deadline はそのまま渡します。gRPC の deadline は呼び出しと一緒に移動する絶対時刻です。`context.CancellationToken` を自分の下流の呼び出しへ渡すサービスは、呼び出し元のタイムアウト 1 つで連鎖全体を取り消せますし、誰も待っていない答えの裏で孤児の処理が回り続けるのを防げます。
- `GrpcChannel` は作るのが高く、共有される前提です。チャネルが HTTP/2 の接続を握り、その上のすべての呼び出しがストリームです。呼び出しごとに作れば、HTTP/2 の多重化がまさに提供するためにある接続の再利用をまるごと捨てることになります。
- サーバーは HTTP/2 の上の Kestrel で動きます。これは口に出しておく価値のある配置上の制約です。ALPN の付いた TLS なら既定で片が付きますが、平文のエンドポイントには `HttpProtocols.Http2` の明示が要りますし、経路上のプロキシはどの区間でも落とさず最後まで HTTP/2 で話す必要があります。
