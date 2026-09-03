---
title: "HTTP/2"
summary: "HTTP/2 は HTTP の意味論をそのままにして、通信の形式だけを入れ替えたものです。テキストの行はバイナリのフレームになり、ヘッダーは圧縮された表になり、ひとつの接続が一度にひとつの要求ではなく、互いに独立した複数のストリームを同時に運びます。"
category: "エッジ、ルーティングとサービスネットワーク"
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: Streaming
    slug: streaming
  - label: gRPC
    slug: grpc
  - label: Reverse Proxy
    slug: reverse-proxy
references:
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: Use HTTP/2 with the ASP.NET Core Kestrel web server
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

## いつ使うか

- クライアントが同じオリジンへ同時に多くの呼び出しを投げる場面で使います。呼び出しはそれぞれ識別子を持つストリームになり、別のストリームのフレームが同じ接続の上で入り混じって行き来します。そのため、ブラウザーが設けていたオリジンあたり 6 接続という上限も、その裏に溜まっていたクライアント側の待ち行列も消えます。その性質を説明するのは multiplexing のページで、こちらはそれを提供するプロトコルの側です。
- 設計のどこかに gRPC があるなら HTTP/2 は前提です。gRPC はたまたま HTTP/2 を使っているのではなく、HTTP/2 の上に定義されています。四つの呼び出しの形はそのままストリームであり、メタデータは HTTP/2 のヘッダーであり、トレーラーはフレームの並びに依存しています。途中に HTTP/1.1 へ落ちる区間がひとつでもあれば、gRPC は遅くなるのではなく壊れます。
- 小さな要求が多くヘッダーが大きいトラフィックで持ち出します。HPACK は、よくある名前を集めた静的な表と、両端が一緒に保つ動的な表に照らしてヘッダーフィールドを圧縮します。ですから、同じ bearer トークンと同じ `user-agent` と同じ独自ヘッダー 10 個をまた載せる 10 回目の要求は、キロバイトではなく索引を送ります。ヘッダーが本文より大きい API なら、それがバイト数の大半です。
- リバースプロキシの背後で接続数を畳むために使います。クライアント接続を 1000 本受け止めるプロキシは、その要求をバックエンドごとに数本の HTTP/2 接続へ載せられます。バックエンドから見れば、accept の経路もソケットの表も TLS ハンドシェイクの予算も、手前の流入の規模よりずっと小さな数になります。

## 注意点

- 詰まりは消えたのではなく、一段下へ移りました。すべてのストリームはひとつの TCP 接続に乗り、TCP はバイトを順番どおりに引き渡し、セグメントがひとつ失われれば再送されるまで全ストリームが止まります。きれいなデータセンターの回線では見えませんが、損失の多いモバイル回線では HTTP/1.1 接続を複数使うより遅くなることもあります。HTTP/3 が存在して QUIC の上で動く理由はまさにこれで、head-of-line-blocking のページがその筋道をたどっています。
- 交渉がハンドシェイクの中で起きるため、実務での HTTP/2 は事実上 TLS とセットです。ALPN が TLS の `ClientHello` で `h2` を告げ、サーバーがそれを選ぶので往復は増えません。平文の `h2c` は仕様にはありますが主要なブラウザーで実装されておらず、RFC 9113 は `Upgrade` を使う経路を廃止しました。ですから素の `http://` エンドポイントは、交渉なしで HTTP/2 を話すよう両端に設定を入れる必要があります。
- サーバープッシュは死んだ機能なので、その上に何かを組み立てないでください。初期の仕様にはありましたが、常にキャッシュとぶつかり、キャッシュに勝てるだけの利得を安定して出せませんでした。ブラウザーは対応を外し、Kestrel は最初から実装していません。プッシュが狙っていた問題に残っている答えは、`103` 応答に載る early hints です。
- フロー制御の窓はひとつではなくふたつあり、どちらも既定値が小さめです。ストリームごとに窓があり、接続にも別の窓があり、仕様上はどちらも 64 KiB から始まります。どちらかが尽きれば、送る側は相手が `WINDOW_UPDATE` を送るまで止まります。これを体感するのは大きなアップロードと長く開いたままのサーバーストリームです。負荷の最中に天井を見つけるのではなく、意識して窓を上げておくのが答えです。

## .NET では

- Kestrel のエンドポイントの既定プロトコルは `Http1AndHttp2` です。TLS のエンドポイントなら、ALPN で求めてくるクライアントとはすでに HTTP/2 で交渉し、そうでないクライアントには HTTP/1.1 を返し続けます。手を入れる場所はプロトコルを有効にすることではなく、平文の区間と上限値です。
- クライアント側では、バージョンは要求に変えるまでは好みでしかありません。

```csharp
var handler = new SocketsHttpHandler
{
    // Without this, one client holds one HTTP/2 connection per endpoint and
    // queues once the peer's stream limit is reached.
    EnableMultipleHttp2Connections = true,
};

var client = new HttpClient(handler)
{
    DefaultRequestVersion = HttpVersion.Version20,
    // RequestVersionOrHigher silently falls back to HTTP/1.1; RequestVersionExact
    // turns a failed negotiation into an exception instead of a quiet downgrade.
    DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact,
};
```

- 知っておく価値のある上限は `options.Limits.Http2` にあります。`MaxStreamsPerConnection` は既定が 100 で、広く展開するクライアントが最初にぶつかる数です。`InitialConnectionWindowSize` と `InitialStreamWindowSize` は既定でそれぞれ 128 KiB と 96 KiB、`HeaderTableSize` はサーバーが接続ごとに保つ HPACK の動的な表の大きさを抑えます。
- TLS をエッジで終端し、クラスターの中で動く gRPC サービスなら、平文のエンドポイントに `HttpProtocols.Http2` を明示します。そこにはプロトコルを合意してくれる ALPN がないのでエンドポイントに直接教える必要があり、そこへ呼びに行くクライアントに `RequestVersionExact` が要る理由も同じです。
