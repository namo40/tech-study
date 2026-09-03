---
title: "dotnet-counters"
summary: "dotnet-counters は、動いている .NET のプロセスがすでに出しているカウンターを読むコマンドラインの道具です。生きているプロセスに取り付き、GC やスレッドプールや例外の割合が端末で更新されるのを眺めるか、ファイルへ集めます。アプリケーションには何も入れません。"
category: "パフォーマンスと最適化"
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Memory Pressure
    slug: memory-pressure
  - label: Allocation Rate
    slug: allocation-rate
  - label: Utilization
    slug: utilization
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "dotnet-counters diagnostic tool"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

## いつ使うか

- プロセスが今おかしな振る舞いをしていて、数秒のうちに数字が要るときに真っ先に持ち出します。`dotnet-counters monitor` は動いているプロセスに取り付き、GC のヒープの大きさ、割り当ての割合、スレッドプールのキューの長さ、例外の回数を生きた表として出します。再起動もコードの変更もパッケージの参照も要りません。「API が遅い気がする」と「スレッドプールのキューが四千だ」の違いがこれです。
- 見たい瞬間がこちらの都合を待ってくれないなら `collect` を使います。選んだ間隔で同じカウンターをファイルへ書きます。夜ごとの遅さやゆっくりした漏れが、誰かがたまたま撮った画面の写真ではなく、あとから開ける時系列になるわけです。
- ダッシュボードが信じがたいことを言っているときに使います。プロセスのそばでカウンターを読めば独立した二つ目の出どころができますし、二つが食い違うなら、たいていは本物のランタイムの問題ではなく、壊れた書き出しの経路か、間違った取得の間隔か、違う水準で集計された指標です。
- 経路さえ整えればコンテナーの中でも使えます。コンテナーの中のプロセスも同じカウンターを出すので、診断のためのサイドカーを置くか、イメージに道具を入れておけば、問題が実際に起きている機械で同じ表が見られます。

## 注意点

- これは診断の道具であって APM ではありません。取り付いている間だけカウンターを標本として取り、見せるだけで、履歴を貯めることも、しきい値で警報を鳴らすことも、サービスの間をつなぐことも、セッションのあとまで残ることもありません。傾向と警報と保持は、今でもバックエンドを備えた OpenTelemetry のような指標の経路の仕事です。この道具をその代わりに使えば、次に起きたときも誰かがたまたま覗くまで誰も気付きません。
- 取り付くにはプロセスの診断ポートへ届く必要があり、コンテナーで引っ掛かるのはまさにそこです。道具は IPC のチャネルで相手と話すので、同じプロセスの名前空間と同じ一時ディレクトリーが見えていなければなりません。Kubernetes では、プロセスの名前空間を共有する一時的なデバッグ用のコンテナーを使うか、サイドカーとボリュームを共有するという意味で、別のポッドに道具を入れただけでは何も見つかりません。
- 既定の更新の間隔は一秒なので、短い跳ね上がりは標本ふたつの間に落ちることがあります。二百ミリ秒の停止は表に現れないかもしれませんし、一秒で均した割合はその中の急な増加を隠します。短いものを追うときは間隔を縮め、問いが水準ではなく個々の出来事についてのものなら、追跡の道具へ移ります。
- カウンターの名前は正確でなければならず、当てずっぽうで打つとひとつのセッションを無駄にします。プロバイダーとカウンターの名前は well-known counters のドキュメントが正本で、もっともらしいが違う名前を打つと、エラーではなく空の列が出ます。ランタイムのものは `System.Runtime` が持ち、リクエストの割合やキューの指標は `Microsoft.AspNetCore.Hosting` が持ち、何が使えるかは道具の `list` の命令が並べてくれます。

## .NET では

- アプリケーションには何も入れません。`dotnet tool install --global dotnet-counters` で道具を一度入れ、プロセスを見つけ、既定の組をそのまま受け取るのではなく、欲しいプロバイダーとカウンターを自分で名指しします。

```bash
# List the processes the tool can attach to.
dotnet-counters ps

# Watch the runtime and the ASP.NET Core host side by side, twice a second.
dotnet-counters monitor --process-id 1428 --refresh-interval 0.5 \
  --counters System.Runtime[gc-heap-size,alloc-rate,threadpool-queue-length,exception-count],Microsoft.AspNetCore.Hosting[requests-per-second,current-requests]

# Same counters, written to a file for the twenty minutes the slowdown lasts.
dotnet-counters collect --process-id 1428 --format csv --output slowdown.csv \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting
```

- 上のふたつのプロバイダーは別の問いに答えます。`System.Runtime` はランタイムが自分自身に何をしているかを教え、`Microsoft.AspNetCore.Hosting` はアプリケーションが何をせよと求められているかを教えます。リクエストの割合は平らなのにキューの長さだけが伸びるのと、ふたつが一緒に伸びるのとでは、まったく別の話です。
- 自分で作った `Meter` の計測もここに出ます。`System.Diagnostics.Metrics` で作ったカウンターやヒストグラムはメーターの名前で名指しするので、`--counters MyCompany.Orders` と書けば、業務の指標がランタイムの指標と同じ表に並びます。バックエンドで探し回る前に、計測が実際に記録されているかを手早く確かめる方法です。
- `--counters` はプロバイダーの名前だけでも受け取りますし、角括弧の一覧を付けたプロバイダーも受け取ります。プロバイダーだけを書けばその既定の組が出ますし、始まりとしては悪くありません。気になっているものが数字みっつのときに表を読めるまま保ってくれるのは、角括弧で絞るほうです。
