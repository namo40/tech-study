---
title: "Configuration"
summary: ".NET の構成は、複数のプロバイダーをひとつのキーと値のビューにまとめた結果です。ファイル、環境変数、コマンドライン引数が決まった順に重なり、あとのプロバイダーが勝ちます。だから同じバイナリがどこでも動き、変わるのはその下に敷かれた層だけです。"
category: ".NET ランタイムとホスティング"
related:
  - label: Environment Variable
    slug: environment-variable
  - label: External Configuration
    slug: external-configuration
  - label: Secret Injection
    slug: secret-injection
  - label: Secret Store
    slug: secret-store
  - label: Feature Flag
    slug: feature-flag
  - label: Dependency Injection
    slug: dependency-injection
references:
  - title: Configuration in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration
  - title: Options pattern in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/options
  - title: Configuration in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/
---

## いつ使うか

- ホストが用意する既定の順序をそのまま使います。欲しい順序がすでに入っているからです。`appsettings.json`、次に `appsettings.{環境}.json`、開発環境ならユーザーシークレット、その次に環境変数、最後にコマンドライン引数。一般的なものから具体的なものへ、コミットされるものから注入されるものへと並び、それぞれの層は自分が指定したキーだけを上書きします。下のファイルを丸ごと置き換えたりはしません。
- 定数を二度書きそうになった時点で持ち出します。ふたつのクラスに現れたタイムアウトやキュー名やベースアドレスは、もうずれ始めた値です。いちばん安い直し方は、起動時にキーをひとつ読んで型のあるオブジェクトにバインドすることです。
- 同じ成果物が複数の環境で動かなければならないときに頼ります。ビルドはそのままで外側の層だけが変わるので、コンテナーイメージを環境ごとに作り直さずに、ステージングから本番へ昇格できます。
- 値がよそから来るなら、分岐ではなくプロバイダーを足します。Azure App Configuration も Key Vault もデータベースも、同じ統合ビューにもうひとつの層として付きます。利用側は `IOptions<T>` を読むだけで、その値がどこから来たのかは最後まで知りません。

## 注意点

- プロバイダーの順序がそのまま優先順位の規則であり、これは書き留めておく価値があります。夜中に妙な値を追う人には、環境変数が JSON ファイルに勝ち、コマンドラインがその両方に勝つという事実が要ります。急いでいるときに `Program.cs` を読んで突き止めるのと、文書に書いてあるのとは違います。
- シークレットはどの環境でも `appsettings.json` に置かないでください。あのファイルはコミットされ、イメージにコピーされ、課題に貼り付けられます。値はシークレットストアに置くか、デプロイ時に環境変数として注入し、ファイルには値のないキーだけを残します。
- バインドの失敗は既定では静かです。綴りを間違えたキー、移動したセクション、数値のところに来た文字列は、プロパティを既定値のままにし、アプリケーションはタイムアウトがゼロのまま何事もなく起動します。オプションクラスに属性を付け、`ValidateDataAnnotations().ValidateOnStart()` を呼んで、失敗がキー名の載った起動時のクラッシュとして表に出るようにします。
- 入れ子のキーを環境変数で渡すときの区切りは二重アンダースコアです。`Logging:LogLevel:Default` は `Logging__LogLevel__Default` として設定します。コロンはシェルやプラットフォームをまたいで通らないからです。コロンの表記は JSON の中とコードの中だけで使い、変数名には使いません。

## .NET では

- セクションを型のあるクラスにバインドし、起動時に検証します。これがオプションパターンのすべてです。サービスの中に `IConfiguration` がなく、呼び出し箇所に文字列のキーがなく、筋の通らない構成で起動する方法もありません。

```csharp
builder.Services
    .AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection("Payments"))
    .ValidateDataAnnotations()
    // Fails the host at startup rather than on the first request.
    .ValidateOnStart();

public sealed class PaymentOptions
{
    [Required, Url]
    public string BaseAddress { get; set; } = string.Empty;

    [Range(1, 120)]
    public int TimeoutSeconds { get; set; } = 30;
}
```

- 既定の JSON プロバイダーは `reloadOnChange` が有効ですが、その変化は求めた利用側にしか届きません。`IOptions<T>` は一度だけ計算されるシングルトンで、生成時の値を持ち続けます。`IOptionsSnapshot<T>` はスコープ付きサービスでリクエストごとに計算し直され、`IOptionsMonitor<T>` はシングルトンに変更通知を押し出します。三つのうち最初を選んでおいて再読み込みが見えることを期待するのは、よくある静かな失望です。
- Azure App Configuration はプロバイダーひとつとして付き、更新の間隔も一緒に持ってきます。アプリケーションから見れば同じ統合ビューなので、キーをファイルからサービスへ移すと変わるのはデプロイの話であって、その値を読むコードではありません。
- サービスでは `IConfiguration` を注入せず、`IOptions<T>` で読みます。検証を可能にし、キー名をひとつのファイルにまとめ、あるサービスがよそのセクションに静かに依存するのを止めてくれるのが、型のあるオブジェクトです。
