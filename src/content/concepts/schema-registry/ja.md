---
title: "Schema Registry"
summary: "Schema registry はイベントのスキーマを集めておく中央の保管庫です。プロデューサーがバージョンを登録して id を受け取り、コンシューマーはその id からスキーマを引き戻し、その subject に設定された互換性の規則を破るバージョンはレジストリが拒みます。"
category: "メッセージングとイベント処理"
related:
  - label: Schema Evolution
    slug: schema-evolution
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Database Migration
    slug: database-migration
  - label: Event Stream
    slug: event-stream
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Message ID
    slug: message-id
  - label: Expand-Contract Migration
    slug: expand-contract-migration
references:
  - title: Azure Schema Registry in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/schema-registry-overview
  - title: Schema Registry Overview
    url: https://docs.confluent.io/platform/current/schema-registry/index.html
---

## いつ使うか

- そのイベントをひとつより多くのチームが消費し始めたら、そこでスキーマを登録します。その瞬間からペイロードはプロデューサーの実装の細部ではなく、公開されたインターフェイスです。レジストリは「みんなこの三つのフィールドを読んでいるはず」という当て推量を、両側が同じ場所から引き戻すバージョン番号付きの定義に変えてくれます。
- 互換性を期待ではなく機械に検査させたいときに使います。subject ごとにモードが付き、レジストリはそれを破る登録を拒みます。`BACKWARD` は新しいスキーマが古いデータを読めなくなる変更を止め、`FORWARD` は古い読み手が新しいデータを扱えなくなる変更を止め、`FULL` は両方を求めます。検査はプロデューサーが登録する時点で起きるので、まずいメッセージが生まれる前です。
- スキーマをペイロードから追い出すために使います。メッセージは定義をまるごと積む代わりに、小さなスキーマ id を積みます。メッセージあたりの上乗せが構造の繰り返しの写しではなく数バイトになりますが、そもそもストリームを選ばせた物量ではこれが効いてきます。
- データベースで使っていた、広げてから縮めるという考え方をイベントの世界へ広げるときに持ち出します。レジストリは同じ規律が住む場所を与えます。まず任意のフィールドを足し、先に動く必要のある側を配置し、まだ古い形にいる読み手が抜けるのを待ち、それから初めて何かを消します。

## 注意点

- レジストリは検査する道具であってガバナンスではありません。変更が機械的に互換であることは教えてくれますが、足したフィールドがほかの四つのチームの考えているとおりの意味かどうかは教えてくれませんし、誰が subject を進化させてよいのかも決めてくれません。所有もレビューも命名の決まりも依然として人の判断であり、持ち主のいないレジストリは、誰も消すのが怖い subject の墓場になります。
- 互換性のモードがアップグレードの順序を決めるので、意識して選びます。`BACKWARD` では新しいスキーマが古いデータを読めるので、コンシューマーを先に上げ、そのあとコンシューマーが両方の形を扱っている間にプロデューサーが追いつきます。`FORWARD` では古いコンシューマーが新しいデータを読めるので、プロデューサーが先でも構いません。逆の順で配置すれば、そのモードが守っていた規則を自分で壊すことになりますし、運用の手順書に書いておくべきものもこのモードです。
- レジストリは今や発行の経路の上にあり、その障害はこちらの障害です。プロデューサーもコンシューマーも id からスキーマを引き戻すので、その参照はほかのリモート依存と同じように扱います。スキーマ id は不変なので、解決したスキーマはプロセスが生きている間持っておき、起動時にレジストリへ届かない場合に即座に失敗するのか、キャッシュの写しで動くのかを先に決めておきます。
- 選んだ形式が、これから付き合う進化の規則を決めます。Avro は既定値と別名を追いかけるので解決の筋道がいちばん精密で、protobuf はフィールド番号を同一性として使い回収を禁じ、JSON Schema はいちばん読みやすくいちばん緩やかです。実務ではこれは戻りにくい選択なので、チームの慣れだけで選ばず、互換性のモードと合わせて決めてください。

## .NET では

- Azure ではレジストリが Event Hubs の隣にあり、レジストリと話すのはシリアライザーの側です。`Azure.Data.SchemaRegistry` と Avro のシリアライザーがスキーマを登録あるいは解決し、id をメッセージのプロパティに入れてくれるので、発行するコードは型のあるオブジェクトを送り続けます。

```csharp
var registry = new SchemaRegistryClient(
    fullyQualifiedNamespace, new DefaultAzureCredential());

var serializer = new SchemaRegistryAvroSerializer(
    registry,
    groupName: "orders",
    // Registering from the producer is convenient in development and usually
    // wrong in production: schema changes should be a reviewed deployment.
    new SchemaRegistryAvroSerializerOptions { AutoRegisterSchemas = false });

var message = (EventData)await serializer.SerializeAsync<EventData, OrderPlaced>(
    new OrderPlaced { Id = id, Total = total });
await producer.SendAsync(new[] { message });
```

- 開発環境の外では自動登録を切ります。`AutoRegisterSchemas` を有効にしておくと、どのプロデューサーも最初の送信でバージョンを作れてしまい、契約の変更が静かにコードレビューの外へ出て、先に配置されたインスタンスの手に渡ります。
- コンシューマー側ではキャッシュして、id に仕事をさせます。スキーマ id は不変なので、解決したスキーマはプロセスが生きている間持っていて構いません。Azure のクライアントも Confluent のクライアントもキャッシュするので、確かめるべきは、こちらのコンシューマーがメッセージごとにクライアントを作り直してそれを台無しにしていないかどうかです。
- Kafka なら Confluent の .NET クライアントが同じ位置を担います。`Confluent.SchemaRegistry` に Avro か protobuf か JSON のシリアライザーを付けて `IProducer` と `IConsumer` に差し込み、subject の命名戦略が、互換性をトピック単位で強制するかレコード型単位で強制するかを決める設定です。
