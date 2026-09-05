---
title: "Memory Pressure"
summary: "memory pressure は limit のすぐそばで生きているヒープです。割り当てが回収より速く届くとコレクターはより頻繁に走ってより長く止まり、limit を越えた先には捕まえられるエラーもなく、コンテナーはただ終了させられます。"
category: "コンテナーとオーケストレーション"
scene: memory-pressure
steps:
  - title: "limit から遠いヒープは、GC をほとんど感じません"
    text: "割り当てが満たし、回収が空け、ゲージは 30% と 50% の間で呼吸します。回収は安い背景雑音です。これが健康な姿であり、誰もこのグラフを眺めません。"
  - title: "圧迫はまず頻度に現れます"
    text: "割り当て速度が 3 倍になると、コレクターは何倍もの頻度で走り（表示は毎分 4 回から 20 回超へ）、毎回より長く止まり、一度に空けられる量は減ります。ヒープはいまや天井の近くで生き、すべての割り当てがその代金を払います。"
  - title: "limit は何も投げません"
    text: "cgroup の境界には捕まえられる OutOfMemoryException がありません。カーネルがリクエストの途中でコンテナーを殺し、ポッドが再起動し、カウンターが 1 つ上がります。ヒープは空で、コードはそのままなので、同じ上昇がまた始まります。"
  - title: "答えはより大きな limit ではなく、より少ない割り当てです"
    text: "大きなバッファをプールにして、借りて、使い、返せば、割り当て速度は崩れ落ちます。同じトラフィックを流し直すとゲージは半分あたりに落ち着き、GC は静かになります。より大きな limit は崖を動かすだけです。再起動回数はそのまま残ります。傷跡こそが教訓です。"
related:
  - label: Allocation Rate
    slug: allocation-rate
  - label: Memory Limit
    slug: memory-limit
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Fundamentals of garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "ArrayPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
---

## いつ使うか

- 警報ではなく読み取りとして使います。3 つの数字は、並べて初めて意味を持ちます。コレクターがどれくらいの頻度で走るか、一度にどれくらい世界を止めるか、ヒープが limit にどれくらい近いかです。どれか 1 つだけを取り出しても何も分かりません。余裕のあるヒープで毎分 20 回の回収は普通ですし、何も満たしていないなら 80% に留まるヒープも普通です。圧迫はこの組み合わせであり、03 時 14 分に起きた事件ではなく、サービスが置かれている状態です。
- レイテンシが悪化したのに説明がつかないときです。デプロイもなく、トラフィックも変わらず、遅くなった依存先もないのに p95 だけが上がります。割り当て速度の劣化はまさにこう見えます。変わったのはリクエストあたりの仕事量ではなくリクエストあたりのごみで、その代金は原因になった 1 件ではなく、プロセス内のすべてのリクエストが分けて払います。
- コンテナーが再起動しているのにログに何もないときです。例外もスタックも終了メッセージもなく終了コード 137 だけが残るのがこの故障の署名で、アプリケーション側からデバッグできるクラッシュではありません。証拠は再起動回数、死ぬ直前までのメモリーグラフ、そしてポッドのイベントです。
- リリースをまたいで Gen2 や大きなオブジェクトヒープが育つときです。以前は gen0 で死んでいたオブジェクトが生き残って昇格します。コレクターが、それらがごみになる前に到着しているからです。リリースごとに少しずつ上がるライブセットは、同じ話をゆっくり語っているだけです。
- メモリー limit を上げる前に見ます。limit は変えるのが最も簡単で、変えるべき理由はほとんどない数字です。まず状態を読んでください。512Mi で死ぬコンテナーと 2Gi で死ぬコンテナーは同じ欠陥を抱えた同じコンテナーで、後者はそこへ着くまでに時間がかかり、着いたときにより長く止まるだけです。

## 注意点

- プラットフォームが強制する limit と、ランタイムが信じている limit は同じ数字でなければなりません。.NET は cgroup からコンテナーの limit を読み、その一部をヒープの大きさに充てるので、既定値はたいてい正しくなります。ただし誰かが `DOTNET_GCHeapHardLimit` を手で設定した瞬間、cgroup v2 に対応しない古いランタイムを使った瞬間、ランタイムから見えない形でポッドに limit が掛かった瞬間に、正しくなくなります。ランタイムがカーネルの許す量より余裕があると信じていると、コレクターは最後まで十分に攻めず、GC がまだのんびりしているうちに終了が訪れます。
- OOM による終了は例外ではありません。cgroup の境界には `OutOfMemoryException` も `catch` も `finally` も、正常なシャットダウンも、最後のログ 1 行もありません。カーネルの OOM キラーが SIGKILL を送り、プロセスは命令 2 つの間で存在をやめます。スタックトレースを読むことを前提にした診断の習慣はここで全部崩れるので、見る数字は `restarts` で、見る場所はアプリケーションのログではなくポッドのイベントです。
- より大きな limit は時間を買ってくれて、その代金を請求します。limit を 2 倍にすると崖の位置が動くだけで傾きは変わらず、止まる時間はコレクターが歩き回るライブセットにおおよそ比例します。40 分ごとに死んでいたサービスは 80 分ごとに死ぬようになり、その道中で毎回 2 倍ずつ止まります。本当の修正を書く間サービスを生かしておくために、あえてそうするのは構いません。それが修正だったことはありません。
- 割り当て速度がてこであり、事実上唯一のてこです。大きなバッファをプールに回すこと、応答をバッファに溜める代わりに流すこと、コピーの代わりに `Span<T>` で切り出すこと、ホットパスではそもそも割り当てないこと。状態を動かすのはこうした変更です。コレクターの調整はたいてい動かしません。Server GC は短い停止と引き換えにメモリー使用量を増やし、`GCConserveMemory` は小さなヒープと引き換えにスループットを差し出しますが、どちらもプロセスがごみを作ることをやめさせはしません。
- 大きなオブジェクトヒープは、この問題が静かに狂う場所です。85,000 バイトを超えるものは、バッファでも大きな配列でもシリアライズされたペイロードでも、すべてそこに割り当てられ、gen2 と一緒にしか回収されず、頼まなければ圧縮もされません。リクエストごとに大きなバッファを割り当てるワークロードは LOH を再利用できない穴に断片化させるので、ライブセットはそのままなのにヒープだけが育ち続けます。グラフは、どのプロファイラーも持ち主を見つけられないリークのように見えます。
- メモリーは CPU ではなく、2 つの limit は同じ壊れ方をしません。CPU の limit を越えるとスロットリングされて遅くなり、メモリーの limit を越えると終了させられて消えます。この非対称のせいで、メモリーの limit には CPU の limit が必要としない余裕が要ります。そしてメモリー limit を request と同じにするのは（ポッド内のすべてのコンテナーで CPU の limit と request も同じにすれば、ポッドを Guaranteed にする設定でもあり）、天井についての判断であると同時に、退避の優先順位についての判断でもあります。

## .NET では

ランタイムは既定でコンテナーを認識します。cgroup のメモリー limit を読み、その 75% をヒープのハード上限に置き、残りはスタックや JIT やネイティブ割り当てなど、マネージヒープではないすべてに残します。つまり実際に考えるべき数字はコンテナーの limit であり、以下の設定はその既定の読み取りが間違っている場合のためのものです。

```jsonc
// runtimeconfig.json。理由が分からないなら何も設定しません。既定値は
// コンテナーの limit から導かれるもので、これを上書きすることが、プロセスが
// カーネルの与えない余裕を持っていると信じ込む経路になります。
{
  "configProperties": {
    // バイト単位の明示的な上限、またはコンテナー limit に対する割合。
    "System.GC.HeapHardLimit": 402653184,
    // HeapHardLimit が設定されている間は無視されます。2 つは対ではなく択一です。
    "System.GC.HeapHardLimitPercent": 75,
    // Server GC はコアごとに最大 1 つのヒープを持ち、DATAS（.NET 9 から既定で
    // 有効）はヒープ 1 つから始めてそこへ育てていきます。停止は短く、使用量は
    // 大きくなる取引で、limit にその余裕があって初めて選べます。
    "System.GC.Server": true
  }
}
```

状態を読むにはコマンド 1 つとカウンター 3 つで足ります。`dotnet-counters` は動いているプロセスに接続して値をそのまま見せてくれます。割り当て速度を推測するのと知っているのとの差は、ここで生まれます。

```bash
# gc-heap-size はゲージの位置、alloc-rate はそれを満たす速さ、
# gen-2-gc-count と time-in-gc はその位置を保つための費用です。
dotnet-counters monitor --process-id 1 \
  --counters System.Runtime[gc-heap-size,alloc-rate,gen-2-gc-count,time-in-gc]
```

数字を実際に動かす変更はプーリングです。`ArrayPool<T>.Shared` は求めた大きさ以上のバッファを貸し、あとで返してもらいます。バッファは割り当てられる代わりに再利用されるので、そのバイトはごみにならず、コレクターが目を向けることもありません。

```csharp
public async Task<int> CopyAsync(Stream source, Stream target, CancellationToken token)
{
    // 割り当てではなく借用です。配列が 64 KB より大きいことがあるので、
    // 読み取りは常に実際に返された長さで区切ります。
    var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
    try
    {
        var total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, token)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read), token);
            total += read;
        }
        return total;
    }
    finally
    {
        // `finally` が契約のすべてです。返さないバッファはリークではなく、
        // 次回プールが新しく 1 つ割り当てるだけですが、プールを置いた理由
        // そのものを消してしまいます。
        ArrayPool<byte>.Shared.Return(buffer);
    }
}
```

同じ修正のもう半分は、そもそもそのバイトを作らないことです。応答を `byte[]` に溜めると長さのぶんを一度に割り当て、たいていは大きなオブジェクトヒープへ行きます。できたそばから流せば、リクエストごとに再利用される借用バッファ 1 つで済みます。

```csharp
// ペイロード全体を 2 回割り当てます。文字列として 1 回、UTF-8 バイトとして 1 回。
var json = JsonSerializer.Serialize(report);
await response.WriteAsync(json, token);

// 代わりにプールされたバッファを通して流します。ペイロードの大きさのものは
// 何も割り当てられないので、ペイロードの大きさのものは何も回収されません。
await JsonSerializer.SerializeAsync(response.Body, report, cancellationToken: token);
```

プラットフォーム側では limit は 1 行で、その limit に届いたときの診断ももう 1 行です。OOM で終了させられたポッドは最後の状態にそう書き、後ろにスタックトレースのない終了コードが一緒に残ります。

```yaml
resources:
  requests:
    memory: 512Mi     # スケジューラーが確保しておく量
  limits:
    memory: 512Mi     # カーネルが SIGKILL で強制する量
```

```bash
# reason: OOMKilled, exitCode: 137。突き合わせるアプリケーションログはありません。
# プロセスは止まる前に何も知らされていないからです。
kubectl get pod api-7d9f -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'
```

再起動回数が上がっていて本当の修正が 1 週間先なら、limit を上げたうえで、それが執行猶予にすぎないと声に出して言っておいてください。そのあとで、リクエストごとにプロセスが何を割り当てているかを探しに行ってください。その数字が状態を作っている値であり、グラフの大きさではなく形を変える唯一の値です。
