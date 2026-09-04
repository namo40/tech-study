---
title: "Configuration"
summary: "Configuration in .NET is a stack of providers merged into one key-value view: files, environment variables and command-line arguments layered in a fixed order where the later provider wins, so the same binary runs everywhere and only the layers underneath it change."
category: ".NET runtime and hosting"
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

## When to use

- Use the default host stack as it stands, because it already encodes the order you want. `appsettings.json`, then `appsettings.{Environment}.json`, then user secrets in development, then environment variables, then command-line arguments: general to specific, committed to injected, and each layer overriding only the keys it names rather than replacing the file below it.
- Reach for it the moment a constant would otherwise be written twice. A timeout, a queue name or a base address that appears in two classes has already begun to drift, and the cheapest fix is one key read once at startup and bound to a typed object.
- Lean on it when the same artefact must run in several environments. The build stays identical and only the outermost layers differ, which is what makes a container image promotable from staging to production instead of rebuildable per environment.
- Add a provider rather than a branch when values come from elsewhere. Azure App Configuration, Key Vault and a database all attach as another layer in the same merged view, so consumers keep reading `IOptions<T>` and never learn where the value came from.

## Cautions

- The provider order is the priority rule, and it deserves to be written down. Whoever debugs the surprising value at 2am needs to know that an environment variable beats the JSON file and that the command line beats both, and reading it out of `Program.cs` under pressure is not the same as having it documented.
- Secrets do not belong in `appsettings.json`, in any environment. That file is committed, copied into images and pasted into issues; put the value in a secret store or inject it as an environment variable at deploy time, and keep the configuration key in the file with no value attached to it.
- A key that is not there binds silently. A misspelled key or a section that moved leaves the property at its default, and the application starts happily with a zero timeout. A value the binder cannot convert is the loud case and throws instead, so it is the absent key rather than the wrong type that gets past you. Annotate the options class and call `ValidateDataAnnotations().ValidateOnStart()` so the failure is a startup crash with a key name in it.
- The environment-variable separator for a nested key is a double underscore. `Logging:LogLevel:Default` is set as `Logging__LogLevel__Default`, because a colon is not portable across shells and platforms; the colon form works inside the JSON and the code, not in the variable name.
## In .NET

- Bind a section to a typed class and validate it at startup. This is the whole of the options pattern: no `IConfiguration` in your services, no string keys at the call site, and no way to start with a configuration that does not make sense.

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

- `reloadOnChange` is on for the default JSON providers, and it only reaches consumers that asked for it. `IOptions<T>` is a singleton computed once and keeps the value it was constructed with; `IOptionsSnapshot<T>` is recomputed per request in scoped services, and `IOptionsMonitor<T>` pushes change notifications to singletons. Expecting a reload to be visible through the first of the three is a common and quiet disappointment.
- Azure App Configuration attaches as one more provider and brings a refresh interval with it. It is the same merged view from the application's point of view, which means moving a key out of a file and into the service changes the deployment story and not the code that reads it.
- Read configuration through `IOptions<T>` in services rather than injecting `IConfiguration`. The typed object is what makes validation possible, keeps the key names in one file, and stops a service from quietly depending on a section that belongs to something else.
