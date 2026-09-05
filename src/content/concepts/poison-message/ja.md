---
title: "Poison Message"
summary: "毒メッセージは処理するたびに失敗し、at-least-once の配信がそれを何度も連れ戻します。手当てがなければキューを塞ぎ、コンシューマーの時間を食いつぶすので、手当ては遅延と再試行の予算、そして最後にデッドレターの引き出しです。"
category: "メッセージングとイベント処理"
scene: poison-message
steps:
  - title: "悪いメッセージ 1 つで、列全体が待ちます"
    text: "2 件はうまく処理され、3 件目が失敗し、すぐ戻ってきてまた失敗します。at-least-once の配信は自分の仕事をしているだけです。つまり再配信です。その仕事がキューの先頭を壁にしました。その後ろのすべては、ただ歳を取ります。"
  - title: "何度も戻ってくるのは、システムが約束を守っているからです"
    text: "最後まで ack（確認応答）されなかったメッセージは再配信されなければなりません。at-least-once とはそういう意味です。exactly-once は狭い境界の中でだけ成り立ち、その外では再配信こそが保証です。対処できないハンドラーの方がバグです。"
  - title: "失敗を脇へ移し、再試行は時間に任せます"
    text: "悪いメッセージは再試行キュー、つまり遅延へ行き、本流はすぐにまた流れます。タイマーが鳴れば列の後ろに再合流し、また失敗すればより長い遅延をもらいます。バックオフはそのメッセージへの慈悲ではなく、その後ろの全員のための保護です。"
  - title: "再試行の予算があって初めて、引き出しができます"
    text: "8 回目の試行のあと、メッセージは履歴を提げたままデッドレターキューへ移され、アラートが鳴ります。隔離は廃棄ではありません。再試行が止まり調査が始まる瞬間であり、その間も後ろの列は流れ続けます。"
related:
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry Queue
    slug: retry-queue
  - label: Exactly-Once
    slug: exactly-once
  - label: At-Least-Once
    slug: at-least-once
  - label: Retry
    slug: retry
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Idempotency Key
    slug: idempotency-key
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Backpressure
    slug: backpressure
  - label: Ordering
    slug: ordering
references:
  - title: Service Bus dead-letter queues
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
---

## いつ使うか

これは選ぶパターンではなく、備えておく故障です。at-least-once のコンシューマーなら、いつか必ず出会います。

- ハンドラーが解釈できないペイロード。プロデューサーがスキーマを変えた、数値だったフィールドが文字列になった、誰も想定していない null が入った、といった場合です。
- 特定の入力 1 つだけを嫌うバグ。ほかの 1 万件は通るのに、この 1 件だけが毎回同じ分岐に入り、同じ場所で例外を投げます。
- 今だけでなく永遠にそのレコードを拒否する下流。決して存在しない外部キー、すでに削除されたアカウント、価格サービスが知らない通貨などです。
- 送られた時点では有効だったのに、指していた対象が消えてもう有効ではなくなったメッセージ。

共通しているのは、いつ試しても結果が同じだという点です。それが一時的な障害ではなく毒である理由であり、次に何をするかを決めるうえで本当に効く区別はこれ 1 つだけです。

## 注意点

- 再試行をかける前に、毒と一時的な障害を先に分けます。タイムアウトはもう一度試す価値がありますが、デシリアライズのエラーにはありません。毒をより強く再試行するのは純粋な無駄なので、例外を分類し、2 種類が別の道を通るようにします。
- ほとんどのブローカーの既定値は即時の再配信ですが、いつも失敗するメッセージにとっては最悪のポリシーです。被害を最大にします。コンシューマーは終わらせられない 1 件に時間を使い切り、後ろのすべてが待ちます。試行の間には必ず遅延を入れてください。
- 試行回数に上限を設け、その回数はコンシューマーのメモリーではなくメッセージに付けて運びます。プロセス内の回数は再起動で消え、ほかのレプリカからは見えません。だから一部のブローカーは配信回数をメッセージ自身に載せています。Service Bus には `DeliveryCount` が、RabbitMQ の quorum queue には `x-delivery-count` がありますが、classic queue は `redelivered` の印を付けるだけで、Kafka は何も数えません。
- 遅延をメッセージの複製の予約で実装すると、複製は新しいメッセージなので配信回数が最初から数え直しになります。試行番号はヘッダーに自分で載せてください。そうしないと予算はいつまでも尽きません。
- 誰も見ていないデッドレターキューは埋め立て地です。最初の 1 件が入った瞬間のアラート、担当者、原因を直したあとに流し直す手順が文書として要ります。
- 順序の保証はこのすべてを難しくします。パーティションストリームやセッションの中では、毒メッセージだけを飛ばすことはできません。そのキーの後ろ全部を一緒に飛ばすことになりますし、脇へ避けるという行為そのものがキー内の順序が禁じていることだからです。停止を受け入れるか、予算を使い切ったメッセージは列から外れその欠落を記録として残すと先に決めておくか、どちらかです。
- あとで診断できるだけの情報は残します。メッセージ id、配信回数、例外、そして保管が許されるならペイロードまでです。メッセージを隔離する目的そのものが、誰かが原因を突き止められるようにすることです。

## .NET では

Azure Service Bus がこの仕事のほとんどを肩代わりします。`MaxDeliveryCount` が再試行の予算で、数えるのはコンシューマーではなくブローカーです。予算が尽きるとメッセージはキューのデッドレターのサブキューへ自動的に移されます。残る仕事は、一時的な障害と恒久的な障害を分けることと、その間に遅延を挟むことです。

```csharp
var admin = new ServiceBusAdministrationClient(connectionString);
await admin.CreateQueueAsync(new CreateQueueOptions("orders")
{
    MaxDeliveryCount = 5,                    // 予算。数えるのはブローカー
    LockDuration = TimeSpan.FromMinutes(1),  // 1 回の配信が戻るまでに許される時間
});

const int MaxAttempts = 5;
var sender = client.CreateSender("orders");
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    AutoCompleteMessages = false,            // すべてのメッセージを明示的に決済する
});

processor.ProcessMessageAsync += async args =>
{
    var token = args.CancellationToken;
    try
    {
        var order = args.Message.Body.ToObjectFromJson<OrderPlaced>();
        await handler.HandleAsync(order, token);
        await args.CompleteMessageAsync(args.Message, token);
    }
    catch (Exception ex) when (IsPermanent(ex))
    {
        // 毒。次の配信でも同じように失敗するので、これ以上は使わない。
        // 理由はメッセージに載って一緒に運ばれる。
        await args.DeadLetterMessageAsync(args.Message, ex.GetType().Name, ex.Message, token);
    }
    catch (Exception ex)
    {
        // 一時的、またはまだ分類できていない障害。待ってから列の後ろで再試行する。
        // 複製を予約するとブローカーの配信回数が戻るので、試行番号はヘッダーで運ぶ。
        var attempt = args.Message.ApplicationProperties.TryGetValue("attempt", out var v) ? (int)v : 1;
        if (attempt >= MaxAttempts)
        {
            await args.DeadLetterMessageAsync(args.Message, "RetryBudgetExhausted", ex.Message, token);
            return;
        }

        var retry = new ServiceBusMessage(args.Message)
        {
            // 新しい id にする。重複検出は予約されたメッセージも対象にするので、
            // 元の MessageId を載せた写しは受け付けられたあと、下で元のメッセージを
            // 完了する間に捨てられてしまう。
            MessageId = Guid.NewGuid().ToString(),
        };
        retry.ApplicationProperties["original-message-id"] = args.Message.MessageId;
        retry.ApplicationProperties["attempt"] = attempt + 1;
        var delay = TimeSpan.FromSeconds(5 * Math.Pow(3, attempt - 1));   // 5 秒、15 秒、45 秒、...
        await sender.ScheduleMessageAsync(retry, DateTimeOffset.UtcNow.Add(delay), token);
        await args.CompleteMessageAsync(args.Message, token);
    }
};

static bool IsPermanent(Exception ex) =>
    ex is JsonException or ValidationException or ArgumentException;
```

`IsPermanent` が設計のすべてで、その外側の再試行ポリシーよりも手をかける価値があります。ここで真になるものは最初の失敗で即デッドレターへ行くので、5 回ではなく 1 回で済み、それ以外は遅延のはしごを登ります。複製を予約する代わりに `AbandonMessageAsync` で戻す方が簡単でブローカーの配信回数も保たれますが、遅延をまったく置かずにメッセージをそのまま返すことになるので、シーンの 2 番目のステップが語る即時の再配信になります。何も決済せずに戻せば確かに遅延は稼げます。ロックが切れるまでメッセージは見えないままだからです。ただし待ち時間はロック時間の上限である 5 分で頭打ちになり、期限切れのたびに配信回数を 1 つ消費するので、これはバックオフのはしごではなく足踏みのやり方です。

反対側では、デッドレターキューをログではなくキューとして読みます。`ServiceBusReceiver` を `SubQueue.DeadLetter` で開けばよく、各メッセージは元の本文とヘッダーの横に `DeadLetterReason` と `DeadLetterErrorDescription` を載せています。メッセージ数へのアラートと、理由を見せる画面と、バグを直したあとにメッセージを本キューへ送り直すボタンがあって初めて、引き出しはメッセージが忘れられに行く場所ではなく業務の流れになります。
