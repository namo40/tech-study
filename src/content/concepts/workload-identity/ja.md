---
title: "Workload Identity"
summary: "ワークロード ID は、誰もシークレットを保存しないまま、実行中のワークロードに自分だけの資格情報を与えます。プラットフォームが生まれるときに短命の証明を発行し、クラウドは issuer と audience を確かめてから交換し、ワークロードはそれぞれ自分の分の狭いロールだけを持ちます。"
category: "認証と認可"
scene: workload-identity
steps:
  - title: "保存されたシークレットは、書かれた瞬間から負債です"
    text: "ゴーストはポッドに焼き込まれたクライアントシークレットを見せます。設定に複製され、ログにこだまし、レジストリが記憶します。1 つ漏れればすべての写しが同時に灯り、それを永遠にローテーションする責任は誰かの持ち分です。ワークロード ID は何も保存しません。証明が発行されます。"
  - title: "ID は手で設定するものではなく、生まれるときに発行されます"
    text: "プラットフォームはこのワークロードが何かを知っています。自分が起動したのですから。だからそう言ってくれる短命のトークンをマウントします。トークンは期限が切れる前に自分で更新されます。ローテーションは四半期プロジェクトではなく既定です。誰もどこにもシークレットを入力していません。"
  - title: "交換は 2 つの名前を検査します。誰が発行したのか、誰のためのものなのか"
    text: "クラウドはプラットフォームの issuer を信頼し、audience が「私」と書かれているかを確かめてから、プラットフォームのトークンをクラウドの資格情報に替えてくれます。他の誰かのために発行されたトークンはその場で断られます。フェデレーションとは、両者の間に共有シークレットが最初から存在しなかったという意味です。"
  - title: "すべてのワークロードは、ちょうど自分の分だけを握ります"
    text: "ポッド A の role はストレージを、ポッド B の role はデータベースを開きます。ポッド A がデータベースへ手を伸ばすと断られます。互いの権限は借りられないからです。侵害されたポッドが漏らすのは 1 つのワークロードの権限であって、全体の権限ではありません。"
related:
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Audience
    slug: audience
  - label: Least Privilege
    slug: least-privilege
  - label: Issuer
    slug: issuer
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Management
    slug: secret-management
  - label: API Key
    slug: api-key
  - label: Mutual TLS
    slug: mutual-tls
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Default Deny
    slug: default-deny
references:
  - title: Use Microsoft Entra Workload ID with Azure Kubernetes Service
    url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
  - title: What are workload identities?
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-overview
  - title: Workload identity federation
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
---

## いつ使うか

- ワークロードがクラウド API を呼び、そのワークロードが載っているプラットフォームがすでにそれが何かを知っている場合に使います。Kubernetes 上のポッド、CI パイプラインのジョブ、サーバーレスホスト上の関数は、どれも何かがプロセスを起動しており、その何かはプロセスを保証できます。プラットフォームが保証してくれるなら、パスワードの埋まった接続文字列にはもう仕事がありません。そのとき投げるべき問いは「シークレットをどこに置くか」ではなく「なぜシークレットがあるのか」です。
- クライアントシークレットや接続文字列の資格情報を取り除くときに使います。これだけで移行の費用は回収できます。シークレットを 1 つ消すたびに、ローテーション作業が 1 つ、ボールトの項目が 1 つ、監査の指摘が 1 つ、そしてもう起こりえなくなった障害が 1 つ消えます。守るのに一番安いシークレットは、そもそも作らなかったシークレットです。
- CI がクラウドに認証しなければならないときに使います。OIDC で Azure や AWS にフェデレーションする GitHub Actions のワークフローは、デプロイキーをまったく持ちません。ランナーは CI プロバイダーがそのリポジトリとそのブランチのために発行したトークンを差し出し、クラウドはそれを短命の資格情報に替えてくれます。代わりの手段であるリポジトリシークレット内の長命なデプロイキーは、もっとも頻繁に漏れる資格情報の 1 つであり、自分から期限切れになることもありません。
- いま複数のワークロードがクラウドアカウントを 1 つ共有している場合に使います。それを分けるのは、ワークロードごとに書類なしで自分が誰かを証明できて初めて現実的になります。ワークロード ID は「ワークロード 1 つにロール 1 つ」を発行コストなしで成立させ、そうしてはじめて最小権限が願望ではなく到達可能なものになります。
- ノートパソコンでは使いません。ローカル開発のために本番のシークレットを持ち込む用途にも使わないでください。開発マシンには開発者の資格情報、デバイスログイン、ローカルエミュレーターという自分の経路があります。ローカル開発を動かすのに本番のシークレットが要るなら、本番のシークレットはまだ存在しており、その組織はこのパターンを導入したのではなく装飾しただけです。
- 認可を飛ばす手段としても使いません。ワークロード ID が答えるのは「誰が呼んでいるか」までです。その呼び出し元が何をしてよいかは別の決定であり、すべてのワークロードに巨大なロールを 1 つ渡せば、手順が増えただけの共用アカウントを再現することになります。

## 注意点

- プラットフォームの issuer が信頼の根になります。クラウドがクラスターの OIDC issuer とフェデレーションしたあとは、そのクラスターがトークンを発行できるものすべてが、フェデレーションされた資格情報の許す範囲に届きます。issuer の鍵を保護し、信頼するネームスペースにサービスアカウントを作れるのが誰かを監査し、「誰がこのクラスターにデプロイできるか」を Kubernetes の問いではなくクラウドアクセスの問いとして扱ってください。
- audience の検証が混乱した代理を防ぐ壁です。トークンは誰かに宛てて署名された言明です。受け手が別のサービス宛てのトークンを受け入れるなら、トークンを持つどのサービスからでもその受け手に対して再生できてしまいます。audience が自分でないトークンは受け取らないでください。連携を成立させるために audience を広げることもしないでください。検査を無効にできるライブラリの設定は疑ってかかるべきです。
- 短い寿命は不便ではなく設計です。交換した資格情報は有効な間だけメモリーにキャッシュし、期限切れの前に更新し、ディスクにもログにも共有キャッシュにも絶対に書かないでください。一度永続化された資格情報は静かに保存されたシークレットに戻り、それこそ取り除こうとしていたものです。
- フェデレーションのサブジェクトが ID そのものです。多くはネームスペースとサービスアカウント名、あるいはリポジトリとブランチという文字列です。ネームスペースの改名、ワークロードの移動、ブランチ保護ルールの変更は、そのワークロードが誰かを黙って変えてしまい、その故障は ID の変化ではなく権限のバグに見えます。サブジェクトは明示的に固定し、ロール割り当てと同じように見直してください。
- ワークロード 1 つにロール 1 つで、共用サービスアカウントは置きません。侵害されたポッドの影響範囲は、そのポッドが動いていた ID の権限とちょうど同じです。だからワークロード 2 つがロールを 1 つ共有した時点で、このパターンの値打ちは使い切られます。2 つのワークロードが本当に同じアクセスを必要とするなら、それは既定で手が伸びる事柄ではなく、決定として書き留める価値のある事柄です。
- 保証できないものには別の経路が要ります。レガシーホスト、サードパーティ SaaS のコールバック、ベンダー連携には、まだ資格情報が必要かもしれません。そうしたものはボールトに置き、数を少なく保ち、誰かが一目で読める程度に短い一覧に保ってください。

## .NET では

肝心なのは、アプリケーションのコードが資格情報も分岐も持たないことです。`DefaultAzureCredential` は複数の供給源を順に辿り、いま動いている環境に存在するものを拾い上げます。クラスターならマウントされたフェデレーショントークン、ノートパソコンなら開発者ログインです。そしてすべての Azure SDK クライアントが同じオブジェクトを受け取ります。

```csharp
// Program.cs — どの環境でも同じ 2 行。
var credential = new DefaultAzureCredential();

builder.Services.AddSingleton(
    new BlobServiceClient(new Uri("https://contoso.blob.core.windows.net"), credential));
builder.Services.AddSingleton(
    new SecretClient(new Uri("https://contoso.vault.azure.net"), credential));
```

接続文字列もキーもなく、ローテーションするものもありません。資格情報オブジェクトはスレッドセーフでトークンを内部でキャッシュするので、リクエストごとに作らずシングルトンとして一度だけ登録します。

本番で何を期待しているかをはっきり書きたいなら、チェーンに任せず資格情報を名指しします。`WorkloadIdentityCredential` は投影されたトークンをファイルシステムから直接読んで交換します。

```csharp
// var ではなく TokenCredential です。2 つの分岐は型が違いますし、
// 「何かの資格情報」という意図はそもそも宣言に書くべきものです。
TokenCredential credential = builder.Environment.IsDevelopment()
    ? new DefaultAzureCredential()          // ノートパソコンでは開発者ログイン
    : new WorkloadIdentityCredential();     // クラスターではマウントされたトークン
```

実際にマウントされるのは、クラスターの API サーバーがポッドの中へ投影した短命の JWT と、それがどこにあり誰のためのものかを伝える環境変数です。宣言するのはデプロイのマニフェストで、アプリケーションは何もしません。

```yaml
# サービスアカウントが ID で、アノテーションがフェデレーションのサブジェクトです。
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders
  namespace: shop
  annotations:
    azure.workload.identity/client-id: "00000000-0000-0000-0000-000000000000"
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      labels:
        azure.workload.identity/use: "true"   # AZURE_FEDERATED_TOKEN_FILE を注入
    spec:
      serviceAccountName: orders
```

交換そのものが知っておく価値のある部分で、シーンの 3 番目のステップがまさにそれです。資格情報は投影されたトークンを読み、ID プロバイダーへ送り、クラウドのアクセストークンを受け取ります。プロバイダーは答える前に 2 つを見ます。信頼せよと言われている issuer が署名したか、そして audience が他の誰でもなく自分を指しているかです。

```csharp
using Microsoft.Identity.Client;

// WorkloadIdentityCredential がしていることを書き下すとこうなります。値はすべて
// プラットフォームが注入した環境変数から来ていて、どれもシークレットではありません。
var tokenFile = Environment.GetEnvironmentVariable("AZURE_FEDERATED_TOKEN_FILE")!;
var authority = Environment.GetEnvironmentVariable("AZURE_AUTHORITY_HOST")
    + Environment.GetEnvironmentVariable("AZURE_TENANT_ID");

var confidentialClient = ConfidentialClientApplicationBuilder
    .Create(Environment.GetEnvironmentVariable("AZURE_CLIENT_ID"))
    .WithAuthority(authority)
    // アサーションはリクエストではなくアプリケーションに属し、プラットフォームが
    // ローテーションするので取得のたびにファイルを読み直します。
    .WithClientAssertion(async (AssertionRequestOptions options) =>
        await File.ReadAllTextAsync(tokenFile, options.CancellationToken))
    .Build();                                              // クライアントシークレットはどこにもない

var token = await confidentialClient
    .AcquireTokenForClient(["https://storage.azure.com/.default"])
    .ExecuteAsync(ct);
```

この流れのどこにも共有シークレットはありません。クラスターは署名でポッドの ID を証明し、クラウドは issuer の well-known ドキュメントから取得した公開鍵でその署名を確かめます。両者は私的なものを一度もやり取りしておらず、それがフェデレーションで得られる利益そのものです。

自分の API が受け手になるときも、検証するのは同じ 2 つの名前です。ここで audience を取り違えることが混乱した代理の穴なので、ライブラリの既定値を受け入れず明示的に書く価値があります。

```csharp
builder.Services.AddAuthentication().AddJwtBearer(options =>
{
    options.Authority = "https://login.microsoftonline.com/<tenant>/v2.0";
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
        ValidateAudience = true,
        // 2 つの項目はどちらもこの 1 つの API を指します。v2.0 のトークンは
        // クライアント ID を、v1.0 のトークンは `api://` URI を運ぶことがあります。
        // 他の誰か向けに発行されたトークンは断られます。
        ValidAudiences = [ordersClientId, $"api://{ordersClientId}"],
        ValidateLifetime = true,
    };
});
```

そうなると最小権限はコードの問題ではなく割り当ての問題になります。ワークロードごとに、自分の ID が必要なスコープで必要なロールを 1 つ受け取り、共有するものはありません。

```bash
# ポッド A はストレージを開き、ストレージだけを開きます
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/shop/providers/Microsoft.Storage/storageAccounts/orders"
```

最後の姿はそのまま書き留める価値があります。アプリケーションにシークレットがなく、リポジトリにシークレットがなく、コンテナーイメージにシークレットがなく、期限が切れるのは誰も入力していないトークン 1 つだけです。ローテーションがプロジェクトであることをやめたのは、ローテーションするものが残っていないからです。
