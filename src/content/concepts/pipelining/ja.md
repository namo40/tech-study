---
title: "Pipelining"
summary: "パイプライニングは、前のレスポンスを待たずに次のリクエストを続けて送ります。質問は順番を守らなくてよくなりますが、レスポンスは尋ねた順に戻らなければならないため、詰まりを取り除いたのではなく移しました。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: multiplexing
sceneStep: 3
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
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
  - title: "Use HTTP/2 with the ASP.NET Core Kestrel web server"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/kestrel/http2?view=aspnetcore-10.0
  - title: "RFC 9113: HTTP/2"
    url: https://www.rfc-editor.org/rfc/rfc9113.html
---

パイプライニングは keep-alive の次に思いつく当然の発想で、知っておく価値があるのは、正しい直感を問題の間違った半分に当てたからです。keep-alive はリクエストの間に接続が壊されることをやめさせ、パイプライニングは次の質問を出す前に答えを待つことをやめさせます。三つのリクエストが続けて出て行き、以前は三回払っていた往復時間を一回だけ払います。往復の長い回線なら、まさに欲しかった節約です。

解放できなかった半分は答えです。HTTP/1.1 には線の上にリクエスト識別子がありません。レスポンスは位置でリクエストと対応づけられるので、二番目のレスポンスは定義上二番目のリクエストの答えです。つまりレスポンスはリクエストを送った順に戻らなければならず、三つをパイプライン化したクライアントはその順に読むと約束したことになります。最初のものが遅ければ、二番目と三番目は終わってサーバーのバッファに座っていても外へ出られません。詰まりはどこにも行っていません。線のリクエスト側からレスポンス側へ移っただけで、それが場面の描く絵です。

それでも多くの場合は実質的な改善でしたから、パイプライニングが死んだ理由はこれではありません。死んだ場所はネットワークでした。リクエスト一つにレスポンス一つという前提のもとで書かれた中間装置、つまりプロキシや透過キャッシュやロードバランサーは、パイプライン化されたストリームに出会うとリクエストを落としたり、順序を入れ替えたり、レスポンスの境界を静かに壊したりしました。サーバーまでの経路が安全かどうかをクライアントが事前に知る方法はなく、失敗はエラーではなくごみデータを生みました。ブラウザーは既定で無効にして出荷し、やがて取り除き、今日の一般的な助言はパイプライニングは有効にするものではない、というものです。発想そのものは、自前のチャネルを持つプロトコルや、経路全体が一人の持ち主の下にある環境で生き残っています。

ここから学べるのは、同時実行には身元が必要だということです。レスポンスを数える代わりに札をつけられるようになれば、レスポンスはどんな順序でも戻れますし、パイプライニングが取り除けなかった順序の制約はそもそも存在しなくなります。HTTP/2 のフレームがしているのはまさにそれです。すべてのフレームがストリーム識別子を持ち歩くので、三つのリクエストが一本の接続の上に浮かんでいられて、答えは準備ができ次第届けられます。パイプライニングは札のない同じ発想であり、その違い一つが、一方が脚注にとどまり他方がウェブの動き方になった理由のすべてです。
