---
title: "Workload Identity"
summary: "Workload identity gives a running workload its own credential without anyone storing a secret: the platform issues short-lived proof at birth, the cloud verifies issuer and audience before exchanging it, and each workload holds exactly its own narrow role."
category: "Authentication and authorization"
tags: ["oauth", "kubernetes"]
scene: workload-identity
steps:
  - title: "A stored secret is debt from the moment it is written"
    text: "The ghost shows a client secret baked into the pod: copied into config, echoed into logs, remembered by registries — and someone owns rotating it forever. Workload identity deletes the premise: nothing is stored, because proof will be issued instead."
  - title: "Identity is issued at birth, not configured by hand"
    text: "The platform knows which workload this is — it started it — so it mounts a short-lived token that says so. The token expires in hours and renews itself; rotation is the default state of the world, not a quarterly project. Nobody typed a secret anywhere."
  - title: "The exchange checks two names: who issued this, and who it is for"
    text: "The cloud trusts the platform's issuer and verifies the audience says \"me\" — then swaps the platform token for a cloud credential. A token minted for someone else is refused on the spot. Federation means no shared secret ever existed between the two sides."
  - title: "Every workload holds exactly its own share"
    text: "Pod A's role opens storage; pod B's opens the database; neither can borrow the other's reach. No shared service account means a compromised pod leaks one workload's permissions, not the fleet's. Least privilege stops being paperwork when identity is this granular — it is just how the tokens come."
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

## When to use

- When a workload calls a cloud API and the platform it runs on already knows what that workload is. A pod on Kubernetes, a job in a CI pipeline, a function on a serverless host: in every case something started the process, and that something can vouch for it. Once the platform will vouch, the connection string with a password in it has no job left to do, and the honest question is not "where do we keep the secret" but "why is there one".
- When you are replacing client secrets and connection-string credentials. This is the payoff that funds the migration on its own: every secret deleted is a rotation task deleted, a vault entry deleted, an audit finding deleted, and an incident that can no longer happen. The cheapest secret to protect is the one that was never created.
- When CI has to authenticate to a cloud. A GitHub Actions workflow federating to Azure or AWS with OIDC holds no deploy key at all: the runner presents a token the CI provider minted for that repository and branch, and the cloud exchanges it for a short-lived credential. The alternative — a long-lived deploy key in a repository secret — is the single most commonly leaked credential in the industry, and it never expires on its own.
- When several workloads share one cloud account today. Splitting them is only realistic once each workload can prove who it is without paperwork; workload identity is what makes "one role per workload" cost nothing to issue, which is what makes least privilege actually achievable rather than aspirational.
- **Not** on a laptop, and not as a smuggled production secret for local development. Developer machines have their own path — a developer credential, a device login, a local emulator. If local dev needs the production secret to work, then the production secret still exists and the pattern has not been adopted; it has been decorated.
- **Not** as a way to skip authorisation. Workload identity answers "who is calling", nothing more. What that caller may do is a separate decision, and giving every workload one enormous role reproduces the shared account with extra steps.

## Cautions

- The platform's issuer becomes your root of trust. Once the cloud federates with a cluster's OIDC issuer, anything that cluster will mint a token for can reach whatever those federated credentials allow. Protect the issuer's keys, audit who can create service accounts in the trusted namespaces, and treat "who may deploy into this cluster" as a question about cloud access rather than about Kubernetes.
- Audience validation is the wall against the confused deputy. A token is a signed statement addressed to someone; if a receiver accepts one addressed to a different service, any service holding a token can be replayed against it. Never accept a token whose audience is not you, never widen the audience to make an integration work, and be suspicious of any library setting that turns the check off.
- Short lifetimes are the design, not an inconvenience. Cache the exchanged credential in memory for as long as it is valid, refresh before it expires, and never write it to disk, to a log, or to a shared cache. A credential that has been persisted has quietly become a stored secret again, which was the thing being removed.
- The federation subject is the identity. It is usually the namespace and service-account name, or the repository and branch — a string. Renaming a namespace, moving a workload, or changing a branch protection rule silently changes who the workload is, and the failure looks like a permission bug rather than an identity change. Pin the subject explicitly and review it the way you would review a role assignment.
- One role per workload, no shared service accounts. The blast radius of a compromised pod is exactly the permissions of the identity it was running as, so the value of the pattern is spent the moment two workloads share a role. If two workloads genuinely need the same access, that is worth writing down as a decision rather than reaching for by default.
- Expect a different path for anything that cannot be vouched for. Legacy hosts, third-party SaaS callbacks and vendor integrations may still need a credential. Keep those in a vault, keep them few, and keep the list short enough that somebody can read it.

## In .NET

The whole point is that application code carries no credential and no branch. `DefaultAzureCredential` walks a chain of sources and picks up whichever one exists in the environment it is running in — a mounted federated token in the cluster, a developer login on a laptop — and every Azure SDK client takes the same object.

```csharp
// Program.cs — the same two lines in every environment.
var credential = new DefaultAzureCredential();

builder.Services.AddSingleton(
    new BlobServiceClient(new Uri("https://contoso.blob.core.windows.net"), credential));
builder.Services.AddSingleton(
    new SecretClient(new Uri("https://contoso.vault.azure.net"), credential));
```

There is no connection string, no key, and nothing to rotate. The credential object is thread-safe and caches tokens internally, so it is registered once as a singleton rather than constructed per request.

When you want to be explicit about what is expected in production, name the credential rather than relying on the chain. `WorkloadIdentityCredential` reads the projected token straight off the filesystem and exchanges it.

```csharp
var credential = builder.Environment.IsDevelopment()
    ? new DefaultAzureCredential()          // developer login, on a laptop
    : new WorkloadIdentityCredential();     // the mounted token, in the cluster
```

What is actually mounted is a short-lived JWT that the cluster's API server projected into the pod, and the three environment variables that say where it is and who it is for. The deployment declares them; nothing in the application does.

```yaml
# The service account is the identity. The annotation is the federation subject.
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
        azure.workload.identity/use: "true"   # injects AZURE_FEDERATED_TOKEN_FILE
    spec:
      serviceAccountName: orders
```

The exchange itself is the part worth understanding, because it is the third step of the scene. The credential reads the projected token, posts it to the identity provider, and gets a cloud access token back. The provider checks two things before it answers: that the token was signed by an issuer it has been told to trust, and that its audience names the provider rather than somebody else.

```csharp
// What WorkloadIdentityCredential does, spelled out.
var assertion = await File.ReadAllTextAsync(
    Environment.GetEnvironmentVariable("AZURE_FEDERATED_TOKEN_FILE")!, ct);

var token = await confidentialClient
    .AcquireTokenForClient(new[] { "https://storage.azure.com/.default" })
    .WithClientAssertion(_ => Task.FromResult(assertion))   // no client secret anywhere
    .ExecuteAsync(ct);
```

Nothing in that flow is a shared secret. The cluster proves the pod's identity with a signature; the cloud checks the signature against a public key it fetches from the issuer's well-known document. The two sides never exchanged anything private, which is exactly what "federation" buys.

On the receiving side of your own APIs, the same two names are what you validate. Getting the audience wrong here is the confused-deputy hole, so it is worth being explicit rather than accepting whatever the library defaults to.

```csharp
builder.Services.AddAuthentication().AddJwtBearer(options =>
{
    options.Authority = "https://login.microsoftonline.com/<tenant>/v2.0";
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
        ValidateAudience = true,
        ValidAudience = "api://orders",   // a token minted for anyone else is refused
        ValidateLifetime = true,
    };
});
```

Least privilege is then a matter of assignment rather than of code. Each workload's identity gets the one role it needs on the one scope it needs, and nothing is shared.

```bash
# pod A opens storage, and only storage
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/shop/providers/Microsoft.Storage/storageAccounts/orders"
```

The final shape is worth stating plainly: the application has no secret, the repository has no secret, the container image has no secret, and the only thing that expires is a token nobody typed. Rotation stopped being a project because there is nothing left to rotate.
