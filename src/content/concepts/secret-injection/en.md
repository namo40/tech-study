---
title: "Secret Injection"
summary: "Secret injection is how a credential reaches a workload without living in the artifact: the image stays clean, the platform delivers the secret at start — as environment or as a mounted file — and what was delivered can be rotated and scoped without rebuilding anything."
category: "Containers and orchestration"
tags: ["kubernetes"]
level: 3
scene: secret-injection
steps:
  - title: "A secret baked into the image goes everywhere the image goes"
    text: "The ghost shows a credential sealed into a layer: every pull copies it, every cache keeps it, and rotating it means rebuilding the world. Injection flips the premise: the artifact carries no secret; the platform delivers it to one running pod."
  - title: "Environment variables are the easiest road — and they leak accordingly"
    text: "The platform fills the slot as the pod comes up; every runtime can read it, no library required. But the environment travels: children inherit it, dumps carry it, diagnostic pages print it. The value is frozen at start: rotation means restart."
  - title: "From a store to a file: managed in one place, narrowed by a list"
    text: "The secret lives in a store that knows its versions, and arrives as a mounted file only in the pods on the access list — the deny is the feature. One place to rotate, one place to audit, one list that says who may read. The file also skips the environment's leaks: nothing inherits it, dumps do not carry it."
  - title: "Rotation flows along the delivery path"
    text: "Swap the version in the store and watch it propagate: the mounted file refreshes in place, the environment catches up at the next restart, and nowhere in the picture does anyone rebuild an image. That is the payoff of injection — the secret's lifetime belongs to the store, the workload's lifetime belongs to the platform, and the artifact belongs to neither."
related:
  - label: Secret Management
    slug: secret-management
  - label: Workload Identity
    slug: workload-identity
  - label: Key Rotation
    slug: key-rotation
  - label: Environment Variable
    slug: environment-variable
  - label: Secret Store
    slug: secret-store
  - label: Configuration
    slug: configuration
  - label: Key Ring
    slug: key-ring
  - label: Least Privilege
    slug: least-privilege
  - label: Sidecar
    slug: sidecar
references:
  - title: Secrets
    url: https://kubernetes.io/docs/concepts/configuration/secret/
  - title: Use the Azure Key Vault provider for Secrets Store CSI Driver in AKS
    url: https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver
  - title: Safe storage of app secrets in development in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets
---

## When to use

- For every credential a container actually needs — connection strings, API keys, certificates, signing material — delivered at start instead of written into the build. The test is simple: if somebody can pull the image and read the secret out of it, the secret was never protected by anything except obscurity, and obscurity does not survive a public registry, a leaked pull token, or a laptop that once ran `docker save`.
- When the same artifact has to run in more than one environment. Build once, inject differently is the whole reason the pattern exists: one image goes to staging and production and picks up a different value at start, which means the thing you tested is bit-for-bit the thing you shipped. The alternative — one image per environment — multiplies the build matrix and guarantees that the production image is the least tested one you own.
- When rotation must not mean rebuild. A credential that lives in a layer can only be replaced by producing a new artifact and redeploying everything that runs it, so rotation becomes a release. Once delivery happens at start, rotation is a change in one store and a restart at worst, which is the difference between a quarterly project and a Tuesday.
- When access has to be narrowed per workload. A store with an access list can say that this one credential goes to these two workloads and nowhere else, and it can say it in a place a reviewer can read. Nothing baked into an image can be scoped at all: whoever has the image has the value.
- **Prefer no secret at all** where the platform can vouch for the workload. Workload identity removes the credential rather than delivering it, and a credential that does not exist cannot leak, expire awkwardly, or need an owner. Injection is for the credentials that must still exist — third-party API keys, database passwords the vendor will not federate, legacy systems — which is most of them, but fewer every year.
- **Not** as a way to keep production secrets on a developer's machine. Local development gets its own values: a user-secrets store outside the repository, a local emulator, a throwaway account. If the only way to run the app locally is to hold the production credential, the pattern has been decorated rather than adopted.

## Cautions

- Environment variables leak sideways, and the leaks are all boring. Child processes inherit the whole environment, so anything you shell out to gets the value. Crash dumps capture it. Diagnostic endpoints and error pages that print configuration print it. Process listings on some platforms expose it. None of this is exotic; it is just what an environment is for. Keep high-value secrets in mounted files or fetch them at start through a client, and reserve the environment for values whose disclosure would be annoying rather than serious.
- A mounted secret updates in place under conditions, and the application still has to notice. It does not update at all when the volume is mounted with `subPath`, and where it does the change arrives no faster than the kubelet's sync period, so rotation is eventual rather than immediate; a CSI Secrets Store mount rotates only if rotation was switched on when the driver was installed. Then comes the application's half: the file changes under a running process, and nothing reopens it for you. Either watch the file and reload, or accept next-read semantics and make sure the next read happens before the old value stops working. An app that reads its secret once into a static field at startup has turned a rotating file back into a frozen environment variable.
- Base64 in a manifest is encoding, not encryption. It exists so that binary values survive a text format, and it protects nothing at all — treat a manifest containing one exactly as you would treat the plaintext. Enable encryption at rest for the store, gate reads with RBAC, and keep the manifest out of version control unless it has been sealed or encrypted by something whose key lives elsewhere.
- Scope the access list per workload. A store that every pod in the cluster may read is a baked secret with more steps: the blast radius of one compromised workload is again everything. One list per secret, naming the workloads that need it, is the entire difference between a store and a shared drive — and it is worth reviewing the list the way you would review a role assignment.
- Never log the value; log the version. Every incident review wants to know which version a workload was holding, and that question is answerable without ever putting the secret in a log line, a trace attribute, a metric label or an exception message. Redaction filters are a second line of defence, not a first: the value should not reach the logging call.
- Commit references, never raw values. A repository is the one place a secret is guaranteed to be copied, mirrored and kept forever. What belongs in it is a pointer — the name of the store entry, a sealed or encrypted blob, a manifest that names a `secretRef` — and what belongs in the store is the value. Rewriting history does not un-leak anything that has already been cloned.
- Delivery is not authorisation. Injection answers "how does this workload get the credential"; it does not answer "should it have one". The two decisions are made in different places, and a store that hands out every secret to anything that asks has answered neither.

## In .NET

`IConfiguration` is built for exactly this shape. It composes ordered sources, later ones winning, so the same code reads a value that came from a file in production, from an environment variable in a container, and from a developer's own store on a laptop — without a branch anywhere in the application.

```csharp
// Program.cs — the sources are the deployment's business, not the code's.
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false)
    .AddKeyPerFile("/mnt/secrets", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

var connection = builder.Configuration.GetConnectionString("Orders")
    ?? throw new InvalidOperationException("no connection string was injected");
```

`AddKeyPerFile` is the mounted-file path: each file in the directory is one key and its contents are the value, which is exactly the shape a Kubernetes secret volume or a CSI driver produces. `reloadOnChange` is what makes the fourth step of the scene work — the file is replaced where it stands and configuration picks it up — provided the mount is one that updates at all.

Reading a rotating value through `IOptionsMonitor<T>` means the current value is always the current value, without the application knowing that anything rotated.

```csharp
public sealed class PaymentClient(IOptionsMonitor<PaymentOptions> options)
{
    // Read per call. A field captured in the constructor would freeze the
    // value the first request happened to see.
    private PaymentOptions Current => options.CurrentValue;
}
```

The double underscore is how a nested key becomes an environment variable, and it is the one piece of syntax worth memorising, because it is what lets a deployment override a single leaf.

```yaml
# The manifest names the secret. It never contains the value.
env:
  - name: ConnectionStrings__Orders
    valueFrom:
      secretKeyRef:
        name: orders-db
        key: connection-string
```

A mounted file is the same secret delivered the other way, and the difference is visible in the manifest: the pod says where it wants the directory, and nothing about the value appears anywhere.

```yaml
volumes:
  - name: orders-secrets
    secret:
      secretName: orders-db
containers:
  - name: api
    volumeMounts:
      - name: orders-secrets
        mountPath: /mnt/secrets
        readOnly: true
```

When the secret lives in a vault rather than in the cluster, the configuration provider fetches it at start using the workload's own identity, so there is still no credential in the image and none in the manifest either.

```csharp
builder.Configuration.AddAzureKeyVault(
    new Uri("https://<vault-name>.vault.azure.net/"),
    new DefaultAzureCredential());
```

For local development the same keys come from a store outside the repository, which is what `dotnet user-secrets` is for. It is not encrypted and it is not a production mechanism; its whole value is that the file lives in the user profile rather than in the working tree, so nothing can commit it by accident.

```sh
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:Orders" "<local-development-value>"
```

One .NET-specific piece belongs in a store rather than on a disk: the data protection key ring. By default it is written to the filesystem, which means a container that restarts loses it and every cookie and token it issued becomes unreadable. Point it at persistent storage and protect the keys themselves with a managed key.

```csharp
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri("<blob-uri-with-no-embedded-key>"), credential)
    .ProtectKeysWithAzureKeyVault(new Uri("<key-identifier>"), credential);
```

The shape to aim for is the one the scene ends on. The image is the same in every environment and contains nothing secret. The manifest names things and holds nothing. The store owns the value and its versions, knows who may read it, and records who did. Rotation is a change in that one place, and it reaches the running system along the path the secret was delivered on.
