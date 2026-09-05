---
title: "Asynchronous I/O"
summary: "非同期 I/O は、オペレーティングシステムがいま受け付けてあとで結果を知らせる読み書きです。リクエストはデバイスやネットワークスタックに渡され、呼び出したスレッドは解放され、完了はイベントとして届きます。だから誰も座って待つ必要がありません。"
category: "プールとリソース管理"
scene: async-await
sceneStep: 1
related:
  - label: Async/Await
    slug: async-await
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Asynchronous file I/O"
    url: https://learn.microsoft.com/en-us/dotnet/standard/io/asynchronous-file-i-o
  - title: "I/O completion ports"
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
  - title: "The managed thread pool"
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

シーンの 1 番目のステップは、言語の側から見たこの話のすべてを見せています。I/O のバーが伸びるあいだ、スレッドのレーンは消えています。このページが扱うのは、そもそもレーンが消えられる理由で、それは C# ではなくオペレーティングシステムの性質です。

同期の読み取りはカーネルにデータを求め、データができるまで戻ってきません。呼び出したスレッドは待つあいだずっとカーネルに留め置かれ、ディスクやネットワークがかかる時間のぶんだけ 1 MB のスタックと、出てきたプールの席を 1 つ占め続けます。非同期の読み取りは同じ問いを別のやり方で出します。カーネルにバッファ 1 つと、あとで知らせる手段を渡してすぐ戻ります。ユーザー空間では誰も待っていません。デバイスコントローラーやネットワークスタックが仕事をし、バイトが揃うとカーネルが完了をキューに入れます。

名前を覚えておく価値があるのはそのキューです。Windows では I/O 完了ポートと呼び、.NET のスレッドプールはそれを片づけるための小さなスレッド群を専用に持っています。Linux ではランタイムがソケットのために `epoll` を片づけます。どちらでも形は同じです。非常に多くの進行中の操作を、小さなスレッドプール 1 つが受け持ちます。進行中なだけの操作にはスレッドが要らないからです。クライアントが何か言うのを待っているソケット 1 万個は、カーネル構造体を 1 万個使うだけでスレッドは 1 本も使いません。同期の読み取りで塞がったスレッド 1 万本は、スタックを 1 万本と、その間を行き来することに時間を使うスケジューラーを呼び込みます。

`await` が立っているのはこの上です。.NET のメソッドが `FileStream.ReadAsync` や `HttpClient.SendAsync` を await すると、ランタイムは下にある操作を非同期で発行し、メソッドの残りを完了が届いたときに走らせるものとして登録し、スレッドをプールに返します。完了はプールスレッドの上に戻り、そのスレッドがメソッドを止まったところから引き継ぎます。待ったものはなく、予約されたものがあるだけです。

ここから出てくる結論は、async は最後まで本物でなければ本物ではない、ということです。名前に `Async` の付いたメソッドを出しておきながら中では `Task.Run` の内側で塞がる呼び出しをする API は、待ちをなくしたのではなく別のスレッドに移しただけで、どちらにしても代金はプールが払います。.NET ではその差はたいてい目に見えます。Windows では、本当に非同期なファイルハンドルは正しいオプションで開く必要がありますし、オーバーラップ操作に対応しないドライバーやプロバイダーは、メソッド名が何であれ塞がる呼び出しに戻ります。Linux にはそもそも求められる非同期ファイル I/O がないので、そこでのファイル読み取りはどのオプションを渡してもプールに予約された同期呼び出しです。一方ソケットは、どちらでも本物の非同期です。

キャンセルとタイムアウトに意味を持たせるのも同じ仕組みです。操作は塞がったスレッドではなくカーネルが持っている何かなので、取り消せます。リクエストを引っ込めれば完了はキャンセル状態で届き、リソースは返ってきます。塞がったスレッドにはこれに当たるものがなく、自前のタイムアウトを持たない同期呼び出しを枠に収めるのがあれほど難しいのはそのためです。
