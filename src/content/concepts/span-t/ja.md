---
title: "Span<T>"
summary: "Span<T> は誰か他人が所有するメモリーをのぞく窓です。開始位置と長さがあるだけで、コピーはありません。ホットパスで配列や文字列を割り当てなしに切り出せるようにし、スタックの上だけに留まります。その制約こそが安全である理由であり、どこでも使えるわけではない理由でもあります。"
category: "パフォーマンスと最適化"
scene: garbage-collection
sceneStep: 3
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: ArrayPool
    slug: arraypool
  - label: Large Object Heap
    slug: large-object-heap
  - label: Memory Pressure
    slug: memory-pressure
  - label: Async/Await
    slug: async-await
  - label: Tail Latency
    slug: tail-latency
references:
  - title: Memory and spans
    url: https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/
  - title: "Span<T> struct"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.span-1
---

サービスがバッファーに対してすることの多くは、その一部を見ることです。1 行からヘッダーを取り出す、CSV 行の最初のフィールドを取る、先頭部分をハッシュする、真ん中の区間をデコーダーに渡す、といった作業です。素直に書けば、そのどれもがコピーになります。`Substring` は新しい文字列を割り当て、配列に対する `array[2..10]` は新しい配列を割り当て、`Split` はフィールドごとに 1 つと、それらを収める配列まで割り当てます。ホットパスでの割り当ての問題は、元のバッファーではなくこれらのコピーです。

`Span<T>` はそのコピーを取り除く型です。あるメモリーの先頭を指す参照と長さを持つ構造体なので、切り出しても別のバッファーではなく別の span ができるだけです。span の切り出しは何度行っても無料で、下にある配列や文字列には一切触れません。文字列に対する `ReadOnlySpan<char>` が日常的な例です。span でリクエスト行を解析すれば割り当ては 1 つもありませんが、`Substring` 版はフィールドごとに 1 回割り当てます。

ついてくる制約は本物で、そこが要点です。span は `ref struct` なので、スタックの上にしか置けません。クラスのフィールドになれず、ボックス化できず、ラムダに捕まえられず、`await` や `yield` を越えられません。そのいずれの場合も、値がヒープに置かれ、指しているメモリーより長く生き残る可能性があるからです。コンパイラーが拒否するので、span が宙を指すことは決してありません。そうしたことが必要なら、ヒープに置けて await を越えられる `Memory<T>` を使い、実際にバイトを読む場所で `.Span` を呼びます。

```csharp
// 割り当てる版: 1 行につき文字列 3 つと配列 1 つです。
string[] parts = line.Split(' ');
string method = parts[0];

// 割り当てない版: すでにそこにある行への窓が 2 つです。
ReadOnlySpan<char> span = line;
int space = span.IndexOf(' ');
ReadOnlySpan<char> method2 = span[..space];
ReadOnlySpan<char> rest = span[(space + 1)..];

// await をまたぐときは Memory<T> を持ち、Span は実際に使う場所でだけ取り出します。
async Task ReadAsync(Memory<byte> buffer, Stream stream, CancellationToken ct)
{
    int read = await stream.ReadAsync(buffer, ct);
    Parse(buffer.Span[..read]);            // span はこのフレームの中にだけ存在します
}
```

span はコピーではなく窓なので、指している先が生きているあいだだけ有効です。借りた配列の上の span は返却より長く生きてはならず、`stackalloc` の上の span はメソッドの外へ出てはならず、span に書けばそのまま配列に書かれます。バッファーを埋めている最中ならそれこそが目的ですし、コピーだと思っていたなら驚くところです。フレームより長く生きる値が必要なら、そこで `ToArray()` や `ToString()` を使って意図的に割り当てます。

プーリングと切り出しは 1 つの手法の両半分です。バッファーを割り当てる代わりに借り、そこからコピーする代わりに span で切り出し、リクエストが終わったら返します。割り当て率が下がり、gen0 の埋まりが遅くなり、コレクターの実行回数が減り、テールが平らになります。コレクターの設定は 1 つも変えずにです。
