---
title: "dotnet-counters"
summary: "dotnet-counters は、動いている .NET のプロセスがすでに出しているカウンターを読むコマンドラインのツールです。生きているプロセスに取り付き、GC やスレッドプールや例外の割合が端末で更新されるのを眺めるか、ファイルへ集めます。アプリケーションには何も入れません。"
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
  - title: ".NET runtime metrics"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics-runtime
---

## いつ使うか

- プロセスが今おかしな振る舞いをしていて、数秒のうちに数字が要るときに真っ先に持ち出します。`dotnet-counters monitor` は動いているプロセスに取り付き、GC のヒープの大きさ、割り当ての割合、スレッドプールのキューの長さ、例外の回数を生きた表として出します。再起動もコードの変更もパッケージの参照も要りません。「API が遅い気がする」と「スレッドプールのキューが 4,000 だ」の違いがこれです。
- 見たい瞬間がこちらの都合を待ってくれないなら `collect` を使います。選んだ間隔で同じカウンターをファイルへ書きます。夜ごとの遅さやゆっくりした漏れが、誰かがたまたま撮った画面の写真ではなく、あとから開ける時系列になるわけです。
- ダッシュボードが信じがたいことを言っているときに使います。プロセスのそばでカウンターを読めば独立した 2 つ目の出どころができますし、2 つが食い違うなら、たいていは本物のランタイムの問題ではなく、壊れた書き出しの経路か、間違った取得の間隔か、違う水準で集計された指標です。
- 経路さえ整えればコンテナーの中でも使えます。コンテナーの中のプロセスも同じカウンターを出すので、診断のためのサイドカーを置くか、イメージにツールを入れておけば、問題が実際に起きている機械で同じ表が見られます。

## 注意点

- これは診断のツールであって APM ではありません。取り付いている間だけカウンターを標本として取り、見せるだけで、履歴を貯めることも、しきい値で警報を鳴らすことも、サービスの間をつなぐことも、セッションのあとまで残ることもありません。傾向と警報と保持は、今でもバックエンドを備えた OpenTelemetry のような指標の経路の仕事です。このツールをその代わりに使えば、次に起きたときも誰かがたまたま覗くまで誰も気付きません。
- 取り付くにはプロセスの診断ポートへ届く必要があり、コンテナーで引っ掛かるのはまさにそこです。ツールは IPC のチャネルで相手と話すので、同じプロセスの名前空間と同じ一時ディレクトリーが見えていなければなりません。Kubernetes では、プロセスの名前空間を共有する一時的なデバッグ用のコンテナーを使うか、サイドカーとボリュームを共有するという意味で、別のポッドにツールを入れただけでは何も見つかりません。
- 更新の間隔は秒単位の整数で、既定は 1 秒、それが下限でもあります。200 ミリ秒の停止は表に現れないかもしれませんし、1 秒で均した割合はその中の急な増加を隠します。1 秒未満の設定はないので、水準ではなく個々の出来事についての問いは `dotnet-trace` の仕事です。
- カウンターの名前は正確でなければならず、当てずっぽうで打つと 1 つのセッションを無駄にします。ツールの命令は `collect`、`monitor`、`ps` の 3 つで、どれも名前を並べてはくれません。だからプロバイダーとカウンターの名前は組み込みメトリックと well-known EventCounters のドキュメントから取る必要があり、もっともらしいが違う名前を打つと、エラーではなく空の列が出ます。ランタイムのものは `System.Runtime` が持ち、`Microsoft.AspNetCore.Hosting` はリクエストの件数と割合を持ちます。キューの長さ `request-queue-length` と `connection-queue-length` は、また別のプロバイダー `Microsoft-AspNetCore-Server-Kestrel` にあります。

## .NET では

- アプリケーションには何も入れません。.NET 10 SDK なら `dnx dotnet-counters ...` が 1 セッションぶんだけツールを取得して実行するので、すでにその機械にいるなら最短の道です。よく使うなら `dotnet tool install --global dotnet-counters` で入れておきます。それからプロセスを見つけ、既定の組をそのまま受け取るのではなく、欲しいプロバイダーとカウンターを自分で名指しします。

```bash
# 取り付けられるプロセスを一覧する。
dnx dotnet-counters ps

# ランタイムと ASP.NET Core のホストを 1 秒ごとに並べて見る。
dnx dotnet-counters monitor --process-id 1428 --refresh-interval 1 \
  --counters System.Runtime[dotnet.gc.pause.time,dotnet.gc.heap.total_allocated,dotnet.thread_pool.queue.length,dotnet.exceptions],Microsoft.AspNetCore.Hosting

# 同じカウンターを、遅さが続く 20 分のあいだファイルへ書き出す。
dnx dotnet-counters collect --process-id 1428 --format csv --output slowdown.csv \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting
```

- 名前は相手のバージョンによって変わり、これが空の列が出るいちばんよくある原因です。.NET 9 以降のプロセスに対しては、ツールは `System.Runtime` の `Meter`、つまり `dotnet.gc.pause.time`、`dotnet.gc.collections`、`dotnet.gc.last_collection.heap.size`、`dotnet.thread_pool.queue.length`、`dotnet.exceptions` を見せます。ハイフンでつないだ古い EventCounters (`time-in-gc`、`gc-heap-size`、`threadpool-queue-length`、`exception-count`) に落ちるのは、アプリが .NET 8 以前のときだけです。違う体系で角括弧の一覧を書いてもエラーにはならず、ただ空の表が出ます。
- 上の 2 つのプロバイダーは別の問いに答えます。`System.Runtime` はランタイムが自分自身に何をしているかを教え、`Microsoft.AspNetCore.Hosting` はアプリケーションが何をせよと求められているかを教えます。リクエストの割合は平らなのにスレッドプールのキューの長さだけが伸びるのと、2 つが一緒に伸びるのとでは、まったく別の話です。
- 自分で作った `Meter` のインストルメントもここに出ます。`System.Diagnostics.Metrics` で作ったカウンターやヒストグラムはメーターの名前で名指しするので、`--counters MyCompany.Orders` と書けば、業務の指標がランタイムの指標と同じ表に並びます。バックエンドで探し回る前に、インストルメントが実際に記録されているかを手早く確かめる方法です。
- `--counters` はプロバイダーの名前だけでも受け取りますし、角括弧の一覧を付けたプロバイダーも受け取ります。プロバイダーだけを書けばその既定の組が出ますし、始まりとしては悪くありません。気になっているものが数字 3 つのときに表を読めるまま保ってくれるのは、角括弧で絞るほうです。
