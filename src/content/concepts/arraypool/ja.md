---
title: "ArrayPool"
summary: "ArrayPool<T> は新しい配列を割り当てる代わりに、既にある配列を貸し出します。リクエストごとにバッファーが要るホットパスが gen0 と large object heap を埋めなくなります。借りて、使って、必ず返す。うまくいかなくなるのはいつも最後の部分です。"
category: "パフォーマンスと最適化"
scene: garbage-collection
sceneStep: 3
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: "Span<T>"
    slug: span-t
  - label: Object Pool
    slug: object-pool
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "ArrayPool<T> class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
  - title: Memory and spans
    url: https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/
---

リクエストごとに 1 つのバッファーは、サービスが行うもっとも平凡な割り当てであり、同時にもっとも高くつくものの 1 つです。毎秒 1000 件なら、64 KB の読み取りバッファーは毎秒 64 MB のゴミになります。gen0 を何度も満たすには十分ですし、バッファーが 85,000 バイト以上なら large object heap を入れ替え続けて完全な回収まで強います。`ArrayPool<T>` は割り当てを安くするのではなく、なくします。配列は一度作られ、貸し出され、返され、また貸し出されます。

`Rent` で最初に驚く点が 2 つあり、どちらもこのプールが正確な配列を並べた倉庫ではなく、サイズのバケットの集まりであることから来ています。返ってくる配列は要求した長さ以上で、たいていはもっと長いので、`buffer.Length` は求めた長さではなく、実際に埋めた個数は自分で持ち回る必要があります。そして中身は前に借りた側が残したままです。借りるたびに消去していては、プールが取り除こうとしている費用を戻してしまうからです。`Rent(64 * 1024)` で借りて `n` バイト読んだなら、配列全体ではなく先頭の `n` バイトだけを扱ってください。

返却は任意ではなく、設計で防ぐべき失敗の形です。返されなかったバッファーは普通の意味でのリークではありません。コレクターはいずれ回収します。しかしプールはその配列を失って代わりを割り当てるので、プールは静かに役に立つのをやめ、プーリングの費用だけが残って利益は消えます。だから借りることと返すことは同じメソッドの中にあるべきで、返却は `finally` に置きます。バッファーが外へ漏れてもいけません。借りた配列を保持する相手に渡さないこと、借りたメソッドからその配列上の `Span` を返さないことです。

```csharp
byte[] buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);   // 少なくとも 64 KB、たいていはもっと長い
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));       // 実際に埋めた部分だけ
}
finally
{
    // clearArray: 次に借りる側が見てはいけないものを入れていた配列なら true
    ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
}
```

ほとんどの場合は `ArrayPool<T>.Shared` で十分です。スレッドセーフで、共有のバケットの手前にスレッドごとの小さなキャッシュを持ち、保持量に上限があるので、暇なサービスが配列をいつまでも抱え込むこともありません。`ArrayPool<T>.Create` で自分のプールを作るのは、最大長やバケットあたりの配列数を変えたいとき、そして共有プールが問題だと示す測定があるときだけです。

正直に使うための小さな規則がもう 2 つあります。次に借りる側が見てはいけないものを入れていた配列は `clearArray: true` で返してください。プールはそのバイトをそのまま別の誰かに渡します。そして、コールドパスの小さく短命なバッファーにプールを持ち出さないでください。gen0 の回収は既にほとんど無料で、借りて返す手順はランタイムで節約する量よりコードで払う量のほうが大きくなります。プールがその複雑さに見合うのは、ホットパスと、大きさが問題になるバッファーです。
