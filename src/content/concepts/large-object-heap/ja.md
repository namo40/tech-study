---
title: "Large Object Heap"
summary: "85,000 バイト以上の割り当ては gen0 ではなく large object heap に置かれます。gen2 を回収するときにだけ一緒に回収され、既定では圧縮されず、そこに溜まる穴のせいでプロセスは実際に使っている量よりはるかに多くのメモリを抱え込みます。"
category: "パフォーマンスと最適化"
scene: garbage-collection
sceneStep: 2
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Memory Pressure
    slug: memory-pressure
  - label: Server GC
    slug: server-gc
  - label: Tail Latency
    slug: tail-latency
references:
  - title: The large object heap
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/large-object-heap
  - title: Fundamentals of garbage collection
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
---

世代別コレクターは 1 つの観察の上に立っています。ほとんどのオブジェクトは若くして死ぬので、いちばん若い世代を掃くのは安い、という観察です。200 KB のバッファーはその前提を壊します。世代のあいだを移す費用は、そのまま置いておく費用より大きくなるので、ランタイムは移そうとしません。85,000 バイト以上のものはそのまま large object heap に割り当てられ、コレクターは生まれた瞬間からそれを gen2 の一部として扱います。

この 1 つの決定が生む結果は 2 つあり、どちらもメモリではなくレイテンシーとして感じられます。1 つめは、大きなオブジェクトが安い回収では決して回収されないことです。gen0 の掃き出しは 1 ms ほどで終わり、そのバッファーには触れません。バッファーは何かが gen2 の完全な回収を引き起こすまで残り、その回収はすべてのスレッドを止めてヒープ全体を歩きます。2 つめは、大きなオブジェクトを割り当てること自体がその回収の引き金だということです。large object heap には固有の予算があり、それを超えると gen2 が予約されます。

3 つめの結果は断片化です。large object heap は既定では圧縮されないため、回収されたブロックはちょうど自分の大きさの穴を残します。あとから来る割り当ては、その穴に収まるときだけ再利用できますが、大きさがまちまちのバッファーはめったに収まりません。するとヒープは、使えない穴を通り越して大きくなり続けます。`GC.GetGCMemoryInfo()` も大きなヒープを報告し、カウンターも大きなヒープを報告するのに、生きている集合はそのごく一部です。メモリ上限のあるコンテナーでは、これがリークでは説明できない OOM の姿です。

直し方がコレクターの設定であることはまずありません。ホットパスで大きなオブジェクトを作らないことが答えです。`ArrayPool<byte>.Shared` から決まった大きさのバッファーを借りて返す、断片をコピーして取り出す代わりに `Span<T>` で切り出す、本文全体を 1 つの文字列にする代わりにレスポンスをストリーミングする、ストリームに `ToArray()` を呼ぶ代わりにプールしたバッファーへ読み込む、といったことです。プールが既に用意している大きさで借りたバッファーは、割り当てられずに再利用され、large object heap には一度も届きません。

```csharp
// 200 KB: over the 85,000 byte threshold, so this lands on the large object heap.
byte[] body = new byte[200 * 1024];

// The same work, from a pool: the array outlives the request and is never collected.
byte[] rented = ArrayPool<byte>.Shared.Rent(200 * 1024);
try
{
    int read = await stream.ReadAsync(rented.AsMemory(0, 200 * 1024), ct);
    Handle(rented.AsSpan(0, read));
}
finally
{
    ArrayPool<byte>.Shared.Return(rented);
}
```

断片化が既に問題になっていて、割り当てをすぐには取り除けないときは、次の完全な回収で large object heap を一度だけ圧縮するようコレクターに頼めます。高価でスレッドを止める操作なので、メンテナンスの時間帯やバックグラウンド処理の静かな瞬間に置くもので、リクエストのパスやタイマーに置くものではありません。圧縮が買えるのは時間だけで、問題を直すのは割り当てをなくすほうです。

```csharp
// A one-off, in a background task and not on a request path.
GCSettings.LargeObjectHeapCompactionMode = GCLargeObjectHeapCompactionMode.CompactOnce;
GC.Collect();
```

観察は他と同じカウンターで行います。生きている集合は平らなのに `gc-heap-size` が上がっていくこと、gen2 の回収回数が p99 のスパイクと歩調をそろえて増えること、オブジェクト数はそのままなのにコンテナーのメモリだけが増えること。この 3 つが、リークではなくここを指す信号です。
