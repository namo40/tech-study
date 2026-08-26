---
title: "Garbage Collection"
summary: ".NET のガベージコレクターはメモリを世代ごとに回収します。ほとんどのオブジェクトは若くして死に gen0 から安く掃き出され、生き残った少数は上の世代へ昇格し、すべてを止めるのは gen2 の完全な回収です。あなたが決められるのは、どれだけ割り当てるかと、プロセスがメモリをどこまで使ってよいかです。"
category: "パフォーマンスと最適化"
scene: garbage-collection
steps:
  - title: "世代"
    text: "新しいオブジェクトは gen0 に置かれます。gen0 が満ちると、コレクターはスレッドを 1 ms ほど止め、何からも参照されないものをすべて捨て、生き残った少数を 1 世代上へ移します。ほとんどのオブジェクトは若くして死に、まさにそのためにこの作業は安く済みます。"
  - title: "高くつくほう"
    text: "キャッシュやセッションのように長生きするオブジェクトは gen2 に積み上がり、大きな配列はそのまま large object heap へ行きます。それらを回収するには、すべてのスレッドを止めたままヒープ全体を歩く必要があります。その停止こそが p99 のスパイクです。"
  - title: "レバーは割り当て"
    text: "コレクターは gen0 を満たすぶんだけ頻繁に走ります。リクエストごとに 1 MB のバッファーを割り当てると、回収と large object の入れ替えを強いることになります。プールから借りて Span で切り出せば、ほとんど割り当てません。割り当てが減れば回収が減り、尾が平らになります。"
  - title: "Server GC と上限"
    text: "ASP.NET Core の既定は Server GC です。コアごとにヒープを 1 つ持ち並列に回収して、大きなメモリ使用量と引き換えに停止を短くします。コンテナーではコレクターがメモリ上限に合わせて自分の大きさを決めます。上限近くで動かすと回収が絶え間なくなり、超えるとプロセスは殺されます。"
related:
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Object Pool
    slug: object-pool
  - label: Tail Latency
    slug: tail-latency
  - label: Resource Limit
    slug: resource-limit
  - label: Load Test
    slug: load-test
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: Runtime configuration options for garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: Memory management and garbage collection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/memory?view=aspnetcore-10.0
---

## いつ使うか

- すべてのサービスで、常に見ます。割り当て率、gen0/gen1/gen2 の回収回数、GC に費やした時間、ヒープサイズ、large object heap のサイズを見て、サービスが健全なときにそれらの数字がどう見えるかを知っておきます。
- 根拠があるときだけ調整します。p99 のスパイクが gen2 の回収と時刻で一致する、あるいはコンテナーが OOM で殺され続けるなら、何かを変える理由になります。気に入らない数字というだけでは理由になりません。
- コレクターより先に割り当てを見ます。ウェブサービスで起きるガベージコレクションの問題はほぼすべて、姿を変えた割り当ての問題であり、コレクターの設定は最後に手を伸ばすものです。

## 注意点

- コレクターを調整する前に割り当てを減らします。バッファーのプール、`Span<T>`、本文全体を文字列にする代わりのストリーミング、ホットパスでの LINQ 一時オブジェクトの削減、という順です。
- gen2 を大きくするのは長生きするオブジェクトグラフです。上限のないキャッシュ、静的リスト、シングルトンが捕まえたクロージャーは、いずれもコレクターが手を出せない地点までオブジェクトを生かし続けます。上限を設けてください。
- ASP.NET Core の既定は Server GC で、たいていのサービスにはこれが正解です。Workstation GC は小さなサイドカーや、プロセスごとにコア数ぶんのヒープを取られると困るノードに向いています。
- コンテナーではメモリ上限を設定し、ヒープのハードリミットをそこから導かせます。既定は 75% です。定常状態のヒープはその線から十分に下に置いてください。線に張り付いたヒープは休みなく回収します。
- 本番のコードパスで `GC.Collect()` を呼ばないでください。避けようとしていた高価な回収をわざわざ強制することになり、しかも最も負担できない瞬間に呼ぶことになります。
- `dotnet-counters` で測定し、変更の前後で負荷テストを回して再現します。負荷の下で測っていない GC の変更は、試したことになりません。

## .NET では

コレクターはプロジェクトファイルで設定します。次の 2 つはウェブプロジェクトでは既にどちらも既定です。書き下しておくのは、どちらのつもりだったかを示すためです。

```xml
<!-- The project file: defaults shown explicitly. -->
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

ホットパスでは、割り当てなかったバッファーがそのまま払わずに済んだ回収になります。`ArrayPool<T>` は既に存在する配列を渡し、`Span<T>` はその配列をコピーせずに切り出します。

```csharp
// Rent instead of allocate on a hot path.
var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));          // a Span slices without copying
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer);
}

// Read the collector's own view when diagnosing.
var info = GC.GetGCMemoryInfo();
logger.LogInformation("heap {Heap} MB, limit {Limit} MB, pause {Pause:P1}",
    info.HeapSizeBytes >> 20, info.TotalAvailableMemoryBytes >> 20, info.PauseTimePercentage / 100);
```

コンテナーの中では、コレクターはマシンではなく上限を読み、その上限に合わせて自分の大きさを決めます。

```text
# Container: memory limit 512Mi -> heap hard limit defaults to 75% (384 MB); override only with evidence.
DOTNET_GCHeapHardLimitPercent=0x4B   # 75, hex
dotnet-counters monitor --process-id <pid> System.Runtime   # gc-heap-size, gen-0/1/2-gc-count, time-in-gc, alloc-rate
```

`DOTNET_gcServer`、`GCHeapCount`、`GCConserveMemory` といった設定は、コレクターが仕事をどう分けるかを変えます。いまの分け方が問題だと負荷テストとカウンターの両方が示すときにだけ、変える価値があります。
