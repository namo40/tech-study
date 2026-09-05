---
title: "Sliding Window"
summary: "Sliding Window は時計の頭からではなく、いまから後ろへ N 秒を数えます。Fixed Window は境界でバーストを 2 倍に漏らしますが、Sliding Window はその継ぎ目を閉じ、Leaky Bucket はさらに一歩進んで通るものを均された一滴の流れに変えます。"
category: "回復性と障害対応"
scene: sliding-window
steps:
  - title: "Fixed Window の上限は、継ぎ目で 2 倍になります"
    text: "1 つの窓の終わりに 4 つが入り、次の窓の頭にまた 4 つが入ります。上限が 4 のところに、2 秒で 8 つです。窓はトラフィックの都合ではなく時計の予定でリセットされます。9 つ目は、その窓では 5 つ目なので断られます。"
  - title: "Sliding Window は、いまから後ろへ数えます"
    text: "同じバースト、同じ上限。しかし窓は跳ぶ代わりに時計の針と一緒に動きます。2 度目のバーストが届くと、1 度目がまだ直近 N 秒の中にいるので超過分は落ち、古いリクエストが窓の外へ滑り出してはじめて通過が再開します。どの瞬間を切っても直近 N 秒の中は多くて 4 つ。継ぎ目が消えたのは、継ぎ目がないからです。"
  - title: "正確さには値段があり、近似がその値段を削ります"
    text: "本当の Sliding Window は到着ごとの時刻を覚えます。キーごと、規模が育てばそれは台帳です。よくある取引は固定バケットを 2 つ置き、前のものを重なりの分だけ重み付けすることです。近い推定ですが、端で少しだけ多く通します。"
  - title: "窓は数を測り、バケツは速度を作ります"
    text: "ここまでは何個通ってよいかを決めただけで、通ったものの形はでこぼこのままでした。Leaky Bucket は到着を溜め、決まった一滴ずつ流し出すので、入力がどれだけ固まっていても下流は均された流れを見ます。あふれた分は落ちます。兄弟の Token Bucket は貯めた許容量をバーストで使い、こちらは均します。"
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Fixed Window
    slug: fixed-window
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Token Bucket
    slug: token-bucket
  - label: Throttling
    slug: throttling
  - label: Load Shedding
    slug: load-shedding
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Retry
    slug: retry
references:
  - title: Rate limiting middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
---

## いつ使うか

- 上限が守るべき約束であるときに、Sliding Window を使います。料金プランの段階、キーごとの API クォータ、乱用対策はどれも数字を声に出して言いますが、Fixed Window は境界のたびにその 2 倍を静かに許してしまいます。計算は難しくありません。毎分 100 という上限は、ある分の最後の 1 秒に 100 を、次の分の最初の 1 秒にまた 100 を受け入れるので、約 2 秒で 200 になり、しかもルールの内側です。誰かが上限を狙ってトラフィックを配置するなら、まさにその場所に配置します。
- おおよその公平さで足り、メモリーが惜しいときは Fixed Window のままにします。キーごとにカウンター 1 つ、全ノードがすでに合意している時計でリセットする方式は最も安いリミッターで、安いエンドポイントをざっくり守る用途なら継ぎ目が本当に問題にならないこともあります。ただし承知のうえで使ってください。実効ピークは設定した上限の 2 倍だと書き留め、その背後にある依存先をそのピークに合わせて用意し、その数字を契約書に載せません。
- 下流が個数ではなく整えられた速度を必要とするなら、Leaky Bucket を取り出します。毎秒 30 回の書き込みを超えると倒れる古いシステム、接続ごとにかける書き込み上限、均等にポーリングしなければならない機器。どれも直近 1 分に何個来たかには関心がなく、2 つが近すぎる間隔で来ないことだけを望みます。窓は「はい」と「いいえ」しか言えませんが、バケツは「いつ」を決めます。
- 規模のある乱用対策が目的なら、セグメント近似が良い選択です。リクエストごとに時刻 1 つではなく、キーごとにカウンター 2 つで済み、境界で無料に返していた分がなくなり、実トラフィックでの誤差は小さくなります。運用リミッターの大半が実際に動かしている方式であり、これを選んで使うことと、なりゆきで Fixed Window に留まることはまったく違います。
- 2 つの問いがどちらも本物なら、選ばずに重ねます。公開クォータにかけた Sliding Window は「この顧客はこの 1 時間の取り分を使い切ったか」に答え、脆い依存先の前に置いた Leaky Bucket は「受け止められる速度より速く下流へ行くものがあるか」に答えます。場所の違う別々の上限であり、どちらも他方の代わりにはなりません。

## 注意点

- 継ぎ目は理屈の話ではなく、クライアントが同期していると悪化します。丁度の時刻に再試行するクライアント、毎時 0 分に起きる cron、共有スケジュールで目覚めるモバイルアプリが、それぞれ同じ境界へトラフィックを押し込むので、2 倍になったバーストはキー空間に散らばらず一斉に届きます。Fixed Window を使い続けるなら、少なくともキーごとに窓の起点をずらして継ぎ目が重ならないようにしてください。
- 正確な Sliding Window は、キーごとの時刻台帳を要求します。到着のたびに時刻を保存し、判定のたびに `now - N` より新しい項目を走査し、走査のたびにそれより古いものを切り落とします。Redis のソート済みセットが定番の実装で、切り落としは `ZREMRANGEBYSCORE`、数えるのは `ZCARD`、記録は `ZADD` を 1 つのパイプラインかスクリプトの中で行います。メモリーは上限かける稼働キー数に比例します。上限 100 でキーが数千なら十分に払えますが、上限 10,000 でキーが数百万なら払えません。
- 2 セグメント近似は、パターンの端で少し多く通したり少なく通したりします。前のセグメントの到着がその区間に均等に散っていたと仮定するので、セグメントの終わりに固まったバーストを区間全体に散ったものとして重み付けします。狙われたバーストでは、窓 1 つの中に上限より幾らか多く入ります。Fixed Window が手渡す 2 倍とは程遠いものの、ゼロでもありません。乱用対策には十分で、請求書を起こす用途には十分ではないので、数字がそのままお金になる場所には正確な台帳を使ってください。
- Leaky Bucket はキューイング遅延を足しますが、それは欠陥ではなく仕組みそのものです。バケツがそのままキューなので、半分埋まっているときに届いたリクエストは前の滴を待ちます。待ちに限度を設けてください。容量を制限するか、項目ごとに期限を置き、誰も待っていない応答を届ける代わりに捨てます。そして呼び出し元にどちらだったかを必ず伝えます。黙ったままの 40 秒待ちは、速い拒否よりはるかに悪いものです。
- 満杯のバケツには、引き継いだものではなく選び取った破棄ポリシーが必要です。先頭を捨てる、末尾を捨てる、優先度で捨てる、再試行のヒントを添えて拒否する。どれにも言い分があり、持続する過負荷ではまったく違う動きをします。末尾を捨てるのがよくある既定値ですが、これは最も新しいリクエストを罰するもので、そのリクエストの呼び出し元はたいていまだ待っています。
- 分散リミッターには共有状態か正直な割り算が要ります。ノードごとに 100 という上限は、ノードが 10 あれば 1,000 の上限であり、ロードバランシングはそれを防いでくれません。本当の上限がどれだけ不公平に散るかを決めるだけです。カウンターを 1 つの共有ストアに置いて往復のコストを払うか、上限をノード数で割り、1 つのノードに張り付いたクライアントが 10 分の 1 しか使えないことを受け入れます。どちらも構いません。構わないと言えないのは、ノードごとの数字を本当の数字のように扱うことです。
- 再試行のヒントは必ず返してください。`Retry-After` のない拒否は、すべてのクライアントに叩き続けることを教えますし、行儀の良い呼び出し元も、いつ戻ればよいか告げられなければ行儀よくできません。429 を返し、ヘッダーに待ち時間を載せ、その数字を正直なものにします。窓に実際に空きができる最も早い時刻であり、Sliding Window はそれを正確に計算できます。
- 窓が壁時計の時刻に揃えられている場所ではどこでも、境界を決めるのは時計のずれです。現在の分を名前に含む Redis キーがその典型で、時計の食い違ったノードは、あるリクエストがどの窓に属するかで食い違います。ノードを NTP に合わせておくか、共有ストアの時計のような単一の権威から窓を導いてください。

## .NET では

`System.Threading.RateLimiting` はこのシーンが描く 3 つのアルゴリズムをそのまま提供し、名前もぴったり対応します。`FixedWindowRateLimiter` は継ぎ目を持つ仕切りの窓、`SlidingWindowRateLimiter` はセグメント近似で、`SegmentsPerWindow` が窓を何片に切るかを決めます。`TokenBucketRateLimiter` は許容量を貯めておく兄弟です。

```csharp
// 1 分の窓を 10 秒ずつ 6 片に切ります。全カウントが一度にリセットされる代わりに、
// 最も古い片が 10 秒ごとに期限切れになるので、上限がまるごと返される瞬間は
// 存在しません。
var limiter = new SlidingWindowRateLimiter(new SlidingWindowRateLimiterOptions
{
    Window = TimeSpan.FromMinutes(1),
    SegmentsPerWindow = 6,
    PermitLimit = 100,
    QueueLimit = 0,                                   // 待たせずに拒否します
    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
});

using var lease = await limiter.AcquireAsync(permitCount: 1);
if (!lease.IsAcquired) return Results.StatusCode(429);
```

片が多いほど近似は細かくなり、カウンターも増えます。6 は無難な出発点です。ただしこれは上で述べた重み付きの 2 バケットとは別の近似です。.NET は `SegmentsPerWindow` 個のカウンターを持ち、`Window`/`SegmentsPerWindow` ごとに最も古い片の許可がまるごと戻ってきて、重み付けはありません。残る誤差は到着の散らばりについての仮定ではなく、片の粒度そのものです。片の終わり近くに来た到着は最大で 1 片ぶん早く忘れられ、その誤差は `SegmentsPerWindow` を増やすほど縮みます。

ASP.NET Core では同じリミッターを rate limiting ミドルウェアで組み込みますが、全体ではなくクライアントごとのキーで掛けます。1 つの上限をキーごとの上限に変えてくれるのが `PartitionedRateLimiter` です。

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("per-key", httpContext =>
        RateLimitPartition.GetSlidingWindowLimiter(
            partitionKey: httpContext.User.Identity?.Name ?? "anonymous",
            factory: _ => new SlidingWindowRateLimiterOptions
            {
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6,
                PermitLimit = 100,
            }));

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        // いつ戻ればよいかを告げずに拒否しません。
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after))
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)after.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsync("rate limited", token);
    };
});

app.UseAuthentication();   // キーは User から取るので、これが先に走る必要があります
app.UseRateLimiter();
app.MapGet("/report", GetReport).RequireRateLimiting("per-key");
```

`User` から取るキーにはリミッターより前の `UseAuthentication` が要り、その時点でまだ匿名の呼び出し元はすべて 1 つのバケットを共有するので、そちらはクライアント IP や API キーで分割します。

これらのリミッターは 1 つのプロセスの中に住むので、インスタンスが複数あれば設定した数字はノードごとの数字です。サーバー群全体で守るべき上限なら、窓を共有ストアに置いてそこで判定してください。正確な形はキーごとに時刻をスコアとして持つソート済みセットで、切り落としと数え上げを 1 つのアトミックなスクリプトの中で行います。

```lua
-- KEYS[1] キー, ARGV[1] いま(ms), ARGV[2] 窓の長さ(ms), ARGV[3] 上限,
-- ARGV[4] このリクエスト固有の ID。同じミリ秒に届いた 2 つの到着が
-- 上書きし合わず別々のメンバーになるようにする
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local used = redis.call('ZCARD', KEYS[1])
if used >= tonumber(ARGV[3]) then
  -- 抜けていくのは最も古い項目なので、その期限が正直な待ち時間になります。
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return { 0, oldest[2] + ARGV[2] - ARGV[1] }
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[1] .. ':' .. ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return { 1, 0 }
```

数えるのではなく均すのが目的なら、`QueueLimit` を 0 より大きくした `TokenBucketRateLimiter` が、バケツが空になってからは呼び出し元から見て Leaky Bucket のように振る舞います。リクエストは拒否される代わりに許可を待ち、許可は一定の速度で届きます。それまではまだ Token Bucket です。暇だったバケツは `TokenLimit` までトークンを貯めていて、それを一度に使い切ります。最初のリクエストから均したいなら、`TokenLimit` を `TokensPerPeriod` 以下に保ち、使えるバーストをなくします。境界のあるチャネルと `PeriodicTimer` で引き取る単一のリーダーで組んだ `System.Threading.Channels` も同じ形を手で書いたもので、均す対象が他人のインバウンドではなく自分たちのアウトバウンドであるときに取り出すと良いものです。
