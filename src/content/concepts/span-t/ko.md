---
title: "Span<T>"
summary: "Span<T>는 남이 소유한 메모리를 들여다보는 창입니다. 시작 위치와 길이만 있고 복사는 없습니다. 뜨거운 경로에서 배열이나 문자열을 할당 없이 잘라 쓸 수 있게 해 주고, 스택에만 머무릅니다. 그 제약이 바로 안전한 이유이자 아무 데서나 쓸 수 없는 이유입니다."
category: "성능과 최적화"
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

서비스가 버퍼에 하는 일은 대개 그 일부를 들여다보는 것입니다. 한 줄에서 헤더를 뽑고, CSV 행의 첫 칸을 가져오고, 앞부분을 해시하고, 가운데 구간을 디코더에 넘깁니다. 눈에 보이는 대로 쓰면 이 전부가 복사입니다. `Substring`은 새 문자열을 할당하고, 배열의 `array[2..10]`은 새 배열을 할당하며, `Split`은 칸마다 하나씩 그리고 그것들을 담을 배열까지 할당합니다. 뜨거운 경로에서 할당 문제는 원래 버퍼가 아니라 이 복사들입니다.

`Span<T>`은 그 복사를 없애는 타입입니다. 어떤 메모리의 시작을 가리키는 참조와 길이를 담은 구조체라서, 잘라도 또 다른 버퍼가 아니라 또 다른 span이 나옵니다. span을 자르는 일은 몇 번을 하든 공짜이고, 밑에 있는 배열이나 문자열은 건드리지 않습니다. 문자열 위의 `ReadOnlySpan<char>`이 일상적인 경우입니다. span으로 요청 줄을 파싱하면 할당이 하나도 없는데, `Substring` 판은 칸마다 한 번씩 할당합니다.

따라오는 제약은 실제로 존재하고, 그 제약이 핵심입니다. span은 `ref struct`라서 스택에만 살 수 있습니다. 클래스의 필드가 될 수 없고, 박싱될 수 없고, 람다에 붙잡힐 수 없고, `await`나 `yield`를 건널 수 없습니다. 그 경우마다 값이 힙에 저장되어야 하고, 가리키는 메모리보다 오래 살아남을 수 있기 때문입니다. 컴파일러가 거절하고, 그래서 span은 절대 허공을 가리키지 않습니다. 그런 일이 필요하면 힙에 살 수 있고 await를 건널 수 있는 `Memory<T>`를 쓰고, 실제로 바이트를 읽는 순간에 `.Span`을 부르세요.

```csharp
// Allocating: three strings and an array, per line.
string[] parts = line.Split(' ');
string method = parts[0];

// Not allocating: two windows onto the line that is already there.
ReadOnlySpan<char> span = line;
int space = span.IndexOf(' ');
ReadOnlySpan<char> method2 = span[..space];
ReadOnlySpan<char> rest = span[(space + 1)..];

// Across an await, hold Memory<T> and take the Span only where you use it.
async Task ReadAsync(Memory<byte> buffer, Stream stream, CancellationToken ct)
{
    int read = await stream.ReadAsync(buffer, ct);
    Parse(buffer.Span[..read]);            // the span exists only inside this frame
}
```

span은 복사가 아니라 창이라서, 가리키는 대상이 살아 있는 동안에만 유효합니다. 빌린 배열 위의 span은 반납보다 오래 살아서는 안 되고, `stackalloc` 위의 span은 메서드를 벗어나서는 안 되며, span에 쓰면 배열에 그대로 써집니다. 버퍼를 채우는 중이라면 그게 바로 원하던 바이고, 복사본인 줄 알았다면 놀랄 일입니다. 프레임보다 오래 사는 값이 필요하다면, 그때 `ToArray()`나 `ToString()`으로 의도해서 할당하면 됩니다.

풀링과 슬라이싱은 한 기법의 두 반쪽입니다. 버퍼를 할당하는 대신 빌리고, 거기서 복사해 내는 대신 span으로 잘라 쓰고, 요청이 끝나면 돌려줍니다. 할당률이 내려가고, gen0이 천천히 차고, 수집기가 덜 돌고, 꼬리가 평평해집니다. 수집기 설정은 하나도 건드리지 않고서요.
