---
title: "Kestrel"
summary: "Kestrel は ASP.NET Core に組み込まれたクロスプラットフォームの Web サーバーです。すべてのリクエストが最初に触れるプロセス内の門であり、設定しなくてもすでに動いていて、エンドポイントもプロトコルも上限も、導入するインフラではなく設定です。"
category: ".NET ランタイムとホスティング"
related:
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: HTTP/2
    slug: http-2
  - label: Request Timeout
    slug: request-timeout
  - label: Minimal APIs
    slug: minimal-apis
  - label: Controllers
    slug: controllers
references:
  - title: Kestrel web server in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel?view=aspnetcore-10.0
  - title: Configure options for the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/options?view=aspnetcore-10.0
---

## いつ使うか

- 自分たちはすでに使っていて、それが最初に知っておく価値のある事実です。`WebApplication.CreateBuilder` が Kestrel をサーバーとして構成するので、既定の ASP.NET Core アプリケーションのすべてのリクエストは、ミドルウェアのパイプラインが `HttpContext` を見るより先に Kestrel が解析し、展開し、フレームに分けたものです。これを調整することは新しいものを導入することではなく、すでに経路の上にある部品に手を入れることです。
- コンテナーの中で、そしてロードバランサーの後ろで直接配信します。ポートをひとつ開いてプロセスをひとつ動かすコンテナーに、イメージの中のもうひとつの Web サーバーは要りませんし、前に置かれた Ingress コントローラーやクラウドのロードバランサーが、普段エッジが担っていたものを供給してくれます。
- クライアントや gRPC が必要とするときは HTTP/2 と HTTP/3 の終端を任せます。プロトコルの選択はエンドポイントごとで、ブラウザー向けの HTTP/2 には ALPN を使う TLS が要り、HTTP/3 にはプラットフォームにある QUIC の支援が要ります。そのプロトコルの決定が実際に下される場所がここです。
- できる範囲で、エンドポイントと証明書をコードではなく設定で構成します。`appsettings.json` の `Kestrel` の節が URL もプロトコルも証明書も上限もバインドしてくれるので、ひとつのイメージを作り直さずに環境ごとに違うエンドポイントで動かせます。

## 注意点

- 既定値は意図して選ばれた値であって、どこにでも合う値ではないので、サービスごとに一度は目を通す値です。リクエスト本文の最大は 30,000,000 バイト、リクエストヘッダー全体の大きさは 32KB でヘッダーの数は最大 100 個、同時接続の数は指定しなければ上限なしです。アップロードのサービスと社内の Webhook の受け口が同じ数字を望むはずはありませんし、どちらも障害の日にその数字を初めて知ることは望んでいません。
- Kestrel をエッジに直接立てるか、リバースプロキシの後ろに置くかは、TLS と静的ファイルと圧縮とリクエストのバッファリングを誰が持つかの決定です。すでに TLS を終端し、資産を配信し、遅いクライアントを吸収してくれるプロキシがあれば、その分は自分たちが設定しなくて済みますし、直接配信するならその責任はアプリケーションと、その周りでプラットフォームが提供するものへ戻ってきます。
- ホスティングのモデルの違いは、遅れて表に出る形で違います。IIS の後ろのインプロセスのモデルではリクエストを処理するサーバーの実装そのものが変わり、systemd の下ではユニットのファイルとソケットの設定がポートと再起動の振る舞いを握り、プロキシをひとつ越えたあとも元のスキームとクライアントの IP が残るには、転送されたヘッダーを明示的に有効にしておく必要があります。
- 上限の超過は、ログの上では普通のクライアントのエラーのように見えます。上限を超えた本文は `413` で、上限を超えたヘッダーは `431` で返り、リクエストの途中で送信を止めたクライアントはリクエストヘッダーのタイムアウトかキープアライブのタイムアウトで切られます。呼び出した側が悪いと結論する前に、まずサーバーのログでこれを探してください。自分たちのコードが動く前にサーバーが断ったものだからです。

## .NET では

- エンドポイントと上限を宣言する場所としては `Kestrel` の設定の節が普通で、`Program.cs` にコードを一行も書かなくてもバインドされます。

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://*:8443",
        "Protocols": "Http1AndHttp2",
        "Certificate": { "Path": "/certs/site.pfx", "Password": "<from a secret store>" }
      },
      "Http": {
        "Url": "http://*:8080",
        "Protocols": "Http1"
      }
    },
    "Limits": {
      "MaxRequestBodySize": 10485760,
      "MaxConcurrentConnections": 2000,
      "MaxRequestHeadersTotalSize": 16384,
      "KeepAliveTimeout": "00:02:10"
    }
  }
}
```

- コードでの構成とこの設定の節は同じオプションを指しています。`builder.WebHost.ConfigureKestrel(...)` も同じ `KestrelServerOptions` を触りますし、設定がバインドされたあとで呼べばファイルが言った値を上書きします。設定の項目ごとに置き場所をひとつ選んで、そのままにしておいてください。
- 上限はサーバー全体ではなくエンドポイントひとつだけに緩めることもできます。リクエストの `IHttpMaxRequestBodySizeFeature` や、アクションに付けた `[RequestSizeLimit]` の属性がアップロードのルートの天井だけを上げ、全体の既定値は残りを守り続けます。
- タイムアウトはミドルウェアだけのものではなく、サーバーのものでもあります。Kestrel の `RequestHeadersTimeout` と `KeepAliveTimeout` は、リクエストが完成する前に止まってしまった接続を扱い、リクエストのタイムアウトのミドルウェアは、いったん始まった自分たちのハンドラーがどれだけ長く動けるかを制限します。
