---
title: "Graceful Shutdown"
summary: "グレースフルシャットダウンとは、プロセスが停止を求められてから実際に止まるまでに行うことです。自分を利用不可と報告し、新しい仕事を受けるのをやめ、すでに受けたものを終え、借りているものを返し、期限より前に出ていきます。SIGTERM がその要求であり、終了猶予期間がその期限です。"
category: "コンテナーとオーケストレーション"
scene: rolling-update
sceneStep: 3
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Connection Draining
    slug: connection-draining
  - label: SIGTERM
    slug: sigterm
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Readiness Probe
    slug: readiness-probe
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Cancellation Token
    slug: cancellation-token
references:
  - title: "Kubernetes: pod lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
  - title: "IHostApplicationLifetime"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.ihostapplicationlifetime
---

シーンの 3 番目のステップがこの話のすべてです。pod は途中で停止を告げられ、しばらく答え続け、すでに自分の上に立っていたリクエストを終えてから、ようやく暗くなります。`SIGTERM` と `30 s` がその下に一緒に現れるのは、2 つが 1 つの文の半分ずつだからです。止まれ、そのための時間は 30 秒だ。

その 30 秒の中の順序が、グレースフルな終了とただ遅い終了とを分けます。まず利用不可と報告します。シャットダウンが始まった瞬間から readiness のエンドポイントは失敗し始めるべきです。まだこのインスタンスを載せているルーティング表はどこか別の場所にある写しであり、早く伝えるほど新しい仕事が届く区間は短くなるからです。次に受けるのをやめます。リスナーを閉じるか、キューから取り出すのをやめますが、最初の段階が効くだけの間を置いてから行います。次に処理中のものを終えます。HTTP サーバーなら今あるリクエストを完了させることであり、コンシューマーならすでに取り込んだメッセージを確認応答することです。次に返します。接続はプールへ、リースやロックは発行元へ、溜めたテレメトリーは送り出します。そして期限より前に、0 のステータスで出ていきます。

期限は目安ではありません。猶予期間が切れるとプロセスはそのまま殺されるので、終わらなかったシャットダウンは、書きかけの状態を残したクラッシュになります。アプリケーション自身のシャットダウンタイムアウトを、基盤の猶予期間より上ではなく確実に下に置くべき理由がこれです。コードが数秒を残して自分で片づけを終えて出ていくことを望んでいるのであって、片づけの途中で基盤に打ち切られることを望んでいるのではありません。

.NET では配管はおおむね用意されています。Generic Host が SIGTERM を処理し、`ApplicationStopping` を実行し、hosted service が `StopAsync` から戻るのを待って `ApplicationStopped` を出します。設定するのは `HostOptions.ShutdownTimeout` で、既定値は 5 秒であり、実際のサービスにはほぼ常に短すぎます。猶予期間より短い値にし、readiness チェックが `ApplicationStopping` を反映するようにして、両端を揃えてください。ASP.NET Core はすでに新しい接続を受けず、抱えている接続を空にしてくれるので、残る仕事はフレームワークが知りようのない部分です。

その部分はたいていバックグラウンドの処理です。`BackgroundService` は停止トークンを受け取りますが、それを無視するループは、シャットダウンを期限まで引きずる最もよくある理由の 1 つです。メッセージのコンシューマーは、処理をやめる前にまず先読みをやめる必要があります。そうしないと、終える時間のないメッセージを抱えたままになり、それらは再配信されます。30 秒で終わらない長い処理は、そもそも終えようとしてはいけません。そこまでの結果を記録し、次のインスタンスに引き継がせるべきで、これはデプロイよりずっと前に下す設計上の判断です。

最後に見るべきは、終えられなかった仕事をプロセスがどう置いていくかです。メッセージを確認応答せずに残すのは正しいことです。ブローカーが再配信してくれるからです。リースを握ったまま残すのは誤りです。期限が切れるまで誰も引き継げないからです。この 2 つの間で、借りたものをすべて返して出ていくシャットダウンが、再起動を見えなくしてくれます。
