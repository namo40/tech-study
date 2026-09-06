---
title: "Least Privilege"
summary: "Least privilege grants each identity only what it needs and nothing more, so that a compromise leaks that identity's share of the system rather than the whole of it. It is a design decision about how permissions are shaped, not a review you pass."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: workload-identity
sceneStep: 4
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Authorization
    slug: authorization
  - label: Default Deny
    slug: default-deny
  - label: Audience
    slug: audience
  - label: Claims
    slug: claims
  - label: Authentication
    slug: authentication
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Management
    slug: secret-management
  - label: API Key
    slug: api-key
references:
  - title: Increase security with the principle of least privilege
    url: https://learn.microsoft.com/en-us/entra/identity-platform/secure-least-privileged-access
  - title: Best practices for Azure RBAC
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/best-practices
  - title: Use Microsoft Entra Workload ID with Azure Kubernetes Service
    url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
---

The fourth step of the scene draws the whole idea in one picture. Pod A's role opens storage and pod B's opens the database, so each of them reaches its own resource and gets an ok, and when pod A reaches for the database it is refused. Nothing about that refusal is dramatic: no attack, no anomaly, no alert worth waking anyone for. The reach simply was not in the role, and the role is the shape of what that workload is allowed to touch.

What makes the picture worth drawing is the counterfactual. If both pods ran as one shared service account, every one of those three reaches would have succeeded, and the system would look exactly the same right up until one of the two workloads was compromised. At that moment the difference shows up as the size of the incident: with one role per workload, an attacker who lands in pod A has storage and nothing else, and the database is still somebody else's problem. Least privilege does not reduce the chance of a compromise at all. It decides in advance how much a compromise is worth.

The reason the principle has a reputation for being paperwork is that it usually costs something to apply. Splitting one account into ten means creating ten identities, and where an identity means a credential to be issued, stored, rotated and eventually leaked, ten of them is nine more problems than one. That arithmetic is what pushes teams towards a single generous role, and it is exactly the arithmetic that workload identity changes: when an identity is issued by the platform at start-up and expires by itself, one identity per workload costs nothing to create and nothing to maintain. Granularity stops being expensive, so there is no longer a reason to share.

Three habits do most of the work. Grant on the narrowest scope that still works — one container rather than one storage account, one database rather than one server — because scope is usually a bigger lever than the role name. Prefer a specific built-in role to a broad one, and prefer a broad built-in role to inventing a custom one you will have to maintain. And keep write and read apart: a service that only reports should not be able to change anything, and saying so costs one assignment.

In .NET the shape falls out of the assignment rather than the code, which is the point: the application asks for a token for a resource and either has the role or does not.

```bash
# one workload, one role, one scope
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope ".../storageAccounts/orders/blobServices/default/containers/receipts"
```

Inside an API the same principle applies to what a caller may do once it is in. Policies keyed on a claim keep the decision in one place and keep the endpoints readable, so a new permission is a policy rather than a scattering of `if` statements.

```csharp
// `scp` arrives as one space-separated string, so an exact claim match would
// refuse a token that was granted both scopes.
static bool HasScope(ClaimsPrincipal user, string scope) =>
    (user.FindFirstValue("scp") ?? "").Split(' ').Contains(scope);

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders:read", policy =>
        policy.RequireAssertion(context => HasScope(context.User, "Orders.Read")));
    options.AddPolicy("orders:write", policy =>
        policy.RequireAssertion(context => HasScope(context.User, "Orders.Write")));
});

app.MapGet("/orders/{id}", GetOrder).RequireAuthorization("orders:read");
app.MapPost("/orders", PlaceOrder).RequireAuthorization("orders:write");
```

The failure mode to watch for is drift. Permissions get added during incidents and never removed, and a role that started narrow becomes the union of every emergency the team has ever had. The cure is boring and it works: grant temporary access temporarily, review assignments on a schedule the way you review dependencies, and treat "what does this identity actually use" as a question with an answer, because the access logs have it.

Least privilege is easiest to hold when it is never violated in the first place. Start each new workload with nothing, add the one permission that makes the first call work, and let the list grow one deliberate line at a time. That is a very different exercise from starting with everything and trying to take some of it back later, which is the version that never finishes.
