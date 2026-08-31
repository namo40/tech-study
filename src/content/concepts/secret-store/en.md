---
title: "Secret Store"
summary: "A secret store is the one place a credential lives: it knows the value's versions, it holds the list of workloads allowed to read it, and it records who did. Delivery from it is a mount or a fetch at start, which makes it the origin of every rotation."
category: "Containers and orchestration"
tags: ["kubernetes", "oauth"]
scene: secret-injection
sceneStep: 3
related:
  - label: Secret Injection
    slug: secret-injection
  - label: Environment Variable
    slug: environment-variable
  - label: Secret Management
    slug: secret-management
  - label: Key Rotation
    slug: key-rotation
  - label: Key Ring
    slug: key-ring
  - label: Workload Identity
    slug: workload-identity
  - label: Least Privilege
    slug: least-privilege
  - label: Configuration
    slug: configuration
  - label: Sidecar
    slug: sidecar
references:
  - title: Use the Azure Key Vault provider for Secrets Store CSI Driver in AKS
    url: https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver
  - title: Use Key Vault references in an ASP.NET Core app
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/use-key-vault-references-dotnet-core
  - title: Secrets
    url: https://kubernetes.io/docs/concepts/configuration/secret/
---

The third step of the scene is the one where the credential stops being a value that was copied somewhere and becomes a record that something owns. A pod is deployed, a file arrives mounted from the store, and then three things happen that no environment variable can offer: a list appears saying which workloads may read this, a reach from a workload that is not on the list lands on `deny`, and a counter in the store goes up. The deny is not an error case bolted on afterwards. It is the feature, and it is the only reason the store is different from a directory everybody can read.

Start with versions, because everything else follows from them. A store holds the current value and the ones before it, each under an identity of its own, which means "rotate" is a well-defined operation rather than a coordinated edit across every place a copy ended up. Two versions can be valid at once while consumers catch up, an old one can be disabled without being destroyed, and an incident can be answered with "which version was that workload holding" instead of a guess. That last property is worth more than it sounds: it is what turns a suspected leak from an unbounded question into a bounded one.

Then the list. A store that every workload in the cluster can read is a baked secret with extra infrastructure — the blast radius of one compromised process is again everything, and you have paid for a vault to get there. The value of a store is that access is a written-down decision per secret: this entry is readable by these workloads, and by nothing else. In Kubernetes that is RBAC on the secret object; in a cloud vault it is a role assignment on the vault or on the individual entry; with a CSI driver it is the pod's own identity that is presented at mount time. All three shapes say the same thing, and all three are readable by a person during a review, which is the point.

Then the audit. Because every read goes through one door, the store can say who opened it and when. That is not a compliance box; it is the difference between "the credential may have been read by anything with cluster access at any point in the last two years" and a list of three service identities with timestamps. When the answer to a leak is to rotate, the audit trail is what tells you how far the rotation has to reach.

Delivery from a store comes in two shapes and the scene draws the first one. A mounted file — a projected secret volume, or a CSI driver pulling from an external vault — puts the value on a `tmpfs` path that only that pod can see, and refreshes it in place when the store changes. Nothing inherits a file, a crash dump does not contain one, and a diagnostic page does not print one. The second shape is a fetch at start: the application asks the store for the value using its own identity, holds it in memory, and never writes it down. That one costs a client library and a startup dependency, and it buys the tightest possession of all — the secret exists only inside the process that needs it.

The identity the store trusts is the part worth getting right, because it is where the whole chain grounds out. If a workload authenticates to the vault with a credential, you have moved the problem one hop rather than solved it, and the new credential is now the one that must be injected, rotated and scoped. The way out is for the platform to vouch for the workload — a federated token, a managed identity, a service account the vault has been told to trust — so that the last secret in the chain is not a secret at all. That is where secret injection and workload identity meet: the store is how the credentials that must exist are delivered, and federation is how the credential that reaches the store stops existing.

Two habits keep a store honest. Give each workload its own entry rather than one shared entry with everything in it, because a shared entry cannot be scoped and cannot be rotated for one consumer. And keep what the application knows down to a name: a key, a URI, a mount path. If the application can name the entry but cannot enumerate the store, then a bug in that application is a bug about one credential rather than about all of them.

The caption says it in one line: managed in one place, narrowed by a list. Everything else on this page is what those two clauses cost and what they buy.
