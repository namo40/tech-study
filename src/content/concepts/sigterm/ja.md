---
title: "SIGTERM"
summary: "プロセスに止まってほしいと頼むシグナルです。処刑ではなく要請なので、プロセスは知らされ、何を仕上げるかを自分で決めます。時間をかけすぎたときだけ、もっと無作法なものがあとから来ます。"
category: "コンテナーとオーケストレーション"
scene: pod-disruption-budget
sceneStep: 2
related:
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Connection Draining
    slug: connection-draining
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
references:
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

場面の二つ目のステップは、見落としやすい区別の上に立っています。二つのシグナルが結局は同じ場所にたどり着くからです。SIGTERM は要請です。SIGKILL は違います。SIGTERM は捕まえられますし、使う価値のあるランタイムはどれもこれを捕まえます。誰かが止まってほしがっているとプロセスに知らせるだけで、次に何をするかは完全にプロセスの決定です。SIGKILL は捕まえることも、ブロックすることも、無視することもできず、プロセスはそれが届いたあと命令を一つも実行しません。

ポッドが削除されたときにプラットフォームが実際にするのは、各コンテナーの PID 1 に SIGTERM を送ることです。細かい話に見えて、牙があります。コンテナーの entrypoint がアプリケーションを起動するシェルスクリプトなら、PID 1 はシェルであり、シェルは既定ではシグナルを転送しないので、アプリケーションは何も聞きません。猶予時間が尽きたときに、ただ消えるだけです。entrypoint で `exec` を使うか、本物の init を PID 1 に置くこと。それがこのページの残りをあなたに当てはめる条件です。

捕まえたあとは、速さより順序が大切です。まず自分を ready として広告するのをやめ、ルーティングテーブルが自分を外し始めるようにします。次に新しい仕事を受けません。リスナーを閉じ、キューから引くのをやめます。すでに手にあるものを仕上げます。HTTP サーバーなら現在のリクエストを最後まで通すことであり、コンシューマーならすでに取ったメッセージを確認応答することです。抱えているものを返します。接続はプールへ、リースとロックは発行者へ、バッファーにたまったテレメトリーは外へ。そして 0 のステータスで終了します。この一覧の一行目で終了するプロセスは、正常に終了しているのではなく、丁寧にクラッシュしているだけです。

.NET ではこれはホストの仕事で、すでに配線済みです。`IHost.RunAsync` がハンドラーを入れ、シグナルが届くと `ApplicationStopping` トークンがキャンセルされ、サーバーが受け付けをやめ、進行中のリクエストを待ち、すべての `IHostedService.StopAsync` が `HostOptions.ShutdownTimeout` で区切られたトークンとともに回ります。間違いはほぼいつも同じ二つです。ループがキャンセルトークンを一度も見ない `BackgroundService` は、期限が来たときもまだ働いています。そしてシャットダウンのタイムアウトをプラットフォームの猶予時間より大きく取ると、きれいに終えるつもりで書いたコードが、きれいに終えている途中で殺されます。

再起動をめぐる混乱の多くも、このシグナルから来ます。終了コード 143 は 128 足す 15 で、SIGTERM のために止まったプロセスです。終了コード 137 は 128 足す 9 で、SIGKILL です。前者は正常な終了であり、たいていはプラットフォームが頼んだという意味です。後者は猶予時間が尽きたか、カーネルの OOM killer が先に着いたかで、そのどちらかはログではなくポッドのイベントに書かれています。SIGKILL で殺されたプロセスは、それについてのログを一行も残せないからです。
