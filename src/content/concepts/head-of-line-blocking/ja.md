---
title: "Head-of-Line Blocking"
summary: "head-of-line blocking は、列が後ろへ回す遅延です。先頭の仕事が終われないと、後ろの仕事はどれほど安く、どれほど準備ができていても一緒に待たされます。負荷の性質ではなく順序の性質です。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: multiplexing
sceneStep: 2
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Pipelining
    slug: pipelining
  - label: Keep-Alive
    slug: keep-alive
  - label: HTTP/2
    slug: http-2
  - label: gRPC
    slug: grpc
  - label: Streaming
    slug: streaming
  - label: Tail Latency
    slug: tail-latency
  - label: Request Timeout
    slug: request-timeout
  - label: Connection Timeout
    slug: connection-timeout
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: I/O Completion Port
    slug: io-completion-port
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: "Evolution of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
---

head-of-line blocking とは、列が先頭以外のものに対してすることです。いま処理されている一つが終われないので、ほかの何も始められず、その一つの費用が後ろに並ぶ全員に請求されます。名前はネットワークスイッチングから来ています。入力キューの先頭にあるパケットが転送できないと、転送できるはずの後ろのパケットまで止まってしまう状況でした。しかしこの形はネットワークよりずっと古く、ずっと一般的です。これは順序の性質です。仕事が決まった順番で取られ、そのうちの一単位が必要なだけ時間を使ってよいところなら、どこにでも現れます。

わざわざ名前をつける価値があるのは、肝心の計測でこの列が見えないからです。サーバーを見れば、一つを除いてすべてのリクエストは速く答えられています。クライアントを見れば、三つのリクエストがそれぞれ最も遅いものと同じだけかかっています。待ちは仕事が始まる前に、どちらの側にも計器が置かれていない場所で起きました。だから症状はエラーではなく、尾の太い遅延分布として届きます。中央値は正直なままです。中央のリクエストはたいてい遅いものの後ろに並んでいないからです。p95 と p99 が崩れます。それらこそ後ろに並んでいたリクエストだからです。

HTTP/1.1 では、その列が接続です。keep-alive のおかげで接続は開き直さずにリクエストを次々と運びますが、運ぶのは一度に一つです。クライアントは前のレスポンスを読み終えるまで次のリクエストを送れません。ですから遅い答えが一つあるだけで、その間ずっと線が占有され、後ろに並ぶ小さくて準備のできた安いリクエストが代金を丸ごと払います。ブラウザーはオリジンごとに接続を複数開くことでこれを十年ほど隠してきましたが、それは問題を消したのではなく、接続をめぐる競合に置き換えただけです。サービス間の呼び出しはその当て木を自動では手に入れません。クラスター内のファンアウトが、ブラウザーからの同じファンアウトよりずっと悪く振る舞うことがある理由です。

一般的な直し方は、仕事そのものが求めてもいない順序を押しつけるのをやめることです。HTTP/2 はリクエストごとに一本の接続の上で自分のストリームを与えるので、遅いストリームは自分しか塞ぎません。同じ手はこのパターンが現れるところに必ず出てきます。毒メッセージ一つがトピックを止めないようにキューを分けること、厳密な逐次ではなく上限つきの並列パイプラインを置くこと、遅くてよい呼び出しに別のプールを与えること。どれも同じ手です。逆に容量を足すのは解になりません。列は満杯なのではなく、順序づけられているからです。しかも順序は層を変えて生き延びることがあります。HTTP/2 は HTTP 層の詰まりを取り除きますが TCP 層には残し、そこでは失われたパケット一つがその接続を分け合うすべてのストリームを依然として止めます。HTTP/3 が QUIC へ移った理由はその残りかすであり、問うべきなのは常にどの層が順序を主張しているのか、というよい注意書きでもあります。
