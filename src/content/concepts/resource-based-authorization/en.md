---
title: "Resource-based Authorization"
summary: "Resource-based authorization decides with the resource in hand: not \"can this user edit documents\" but \"can this user edit this document\". Ownership and state live on the thing being acted on, roles stay as the coarse outer gate, and when no rule says yes the answer is no."
category: "Authentication and authorization"
tags: ["oauth"]
scene: resource-based-authorization
steps:
  - title: "A role check never looks at the document"
    text: "The ghost asks one question — \"is this user an editor?\" — and edits whatever arrives, including someone else's document. Nothing failed; the rule did exactly what it says, and that is the problem. The question was too small. Authorization that matters asks three things at once: who, doing what, to which resource."
  - title: "The decision is made with the resource in hand"
    text: "Two identical requests: edit document one. The handler loads the document, reads its owner, and gives two different answers — allowed for A, refused for B. That is the whole pattern: the rule cannot run on the token alone, because the deciding fact lives on the resource. Same user role, same action, different document, different verdict."
  - title: "Roles do not disappear; they find their place"
    text: "The admin card passes ownership — that is what admin means — but it is one narrow, named grant, not a skeleton key. Coarse role gates keep obvious strangers out cheaply; the resource check decides the cases that matter. The two layers answer different questions, which is exactly why you keep both."
  - title: "Silence means no"
    text: "A new action arrives that no rule has heard of — and the system refuses it, not because a rule said no, but because none said yes. That default is the safety net for every rule you have not written yet. Forgetting a handler should fail closed, loudly, in the test environment — never open, quietly, in production."
related:
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Role
    slug: role
  - label: Default Deny
    slug: default-deny
  - label: Role-based Access Control
    slug: role-based-access-control
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-based Access Control
    slug: attribute-based-access-control
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
references:
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## When to use

The test is simple: if you cannot answer the question without looking at the thing being acted on, the check belongs on the resource.

- Ownership. An author edits their own post, a customer cancels their own order, a member leaves their own comment. The role says "author"; the resource says whose. Only the second one keeps A out of B's draft.
- State. A paid order cannot be edited, a locked document cannot be renamed, a closed ticket cannot be reassigned. The permission depends on a field that only exists once the row is loaded, so no amount of claim-stuffing at login time can decide it.
- Relationships. A manager reads their own reports' reviews, a teacher grades their own class, a doctor opens the chart of a patient on their service. The edge between the caller and the resource is the permission, and edges live in the database rather than in the token.
- Tenancy. In a multi-tenant system "same role, different tenant" must fail, and it must fail on the way in rather than by returning an empty list. The tenant id on the resource is the check, and it is the one every multi-tenant incident report wishes had been there.
- Anywhere a role check would need one role per object to be honest. If you find yourself contemplating `Editor_Project_417`, you have discovered that the permission is about the object, not about the person. Write the handler instead.

Coarse role gates are still worth having in front of all of this. They are cheap, they are readable, and they keep obvious strangers out before anything is loaded. What they cannot do is tell two documents apart.

## Cautions

- The check needs the resource, so it runs after the load. That is not a flaw, but it does move the decision past the point where the object exists, which means your handler is now also deciding what a stranger learns from the failure. 404 versus 403 is a decision to make deliberately: 403 admits the thing exists, 404 does not, and picking one per resource type and sticking to it is better than letting the exception filter choose for you.
- Keep handlers small and single-purpose. One requirement should ask one question — "is the caller the owner", "is the order still open" — so the policy that combines them reads like the sentence you would say out loud. A single handler holding five conditions is a handler nobody will dare to change.
- Do not push resource rules into query filters only. Filters hide rows and handlers refuse actions, and those are different jobs. A global filter that scopes every query to the current tenant is excellent, and it will still happily let a caller update a row they fetched by id through a path the filter does not cover. You usually need both, and you should be able to say which one is protecting each endpoint.
- Cache verdicts carefully, or not at all. An authorization answer is a fact about a caller and a resource at one moment, and the moment ends when ownership changes, a share is revoked or an order is paid. If you must cache, key it on something that changes when the resource does, and keep the lifetime shorter than the shortest revocation you promise.
- Audit the denials. A refused request is the earliest, cheapest breach signal you will ever get, and it costs one log line. A caller that trips the ownership handler forty times in a minute is telling you something that no successful request ever will.
- Do not let the resource check become the only check. It runs late, on loaded data, and it is doing precise work. Put the cheap gates in front of it so it is not the thing standing between an unauthenticated flood and your database.

## In .NET

The imperative shape is `IAuthorizationService.AuthorizeAsync`, called from the endpoint after the resource has been loaded. There is no attribute for this, because the attribute runs before the thing it would have to look at exists.

```csharp
app.MapPut("/documents/{id:guid}", async (
    Guid id,
    DocumentUpdate update,
    ClaimsPrincipal user,
    AppDb db,
    IAuthorizationService auth,
    CancellationToken ct) =>
{
    var document = await db.Documents.FindAsync([id], ct);
    if (document is null) return Results.NotFound();

    var result = await auth.AuthorizeAsync(user, document, Operations.Update);
    if (!result.Succeeded) return Results.Forbid();

    document.Body = update.Body;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
});
```

The requirement is a name, and `OperationAuthorizationRequirement` exists so you do not have to write a type per verb.

```csharp
public static class Operations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = nameof(Read) };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = nameof(Update) };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = nameof(Delete) };
}
```

A handler is where the resource finally meets the rule. `AuthorizationHandler<TRequirement, TResource>` gives you both, and the only interesting line is the comparison between the caller and a field on the resource.

```csharp
public sealed class DocumentOwnerHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null && resource.OwnerId == userId)
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

Handlers compose. Registering a second one for the same requirement is how the coarse gate keeps its place: the owner handler succeeds for the owner, and a separate administrator handler succeeds for one named operation, whoever owns the document. Neither knows about the other, and a requirement is satisfied as soon as any handler succeeds.

```csharp
public sealed class DocumentAdminHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        // One narrow, named grant. Deliberately not every operation.
        if (requirement.Name == nameof(Operations.Update) && context.User.IsInRole("DocumentAdmin"))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

builder.Services.AddScoped<IAuthorizationHandler, DocumentOwnerHandler>();
builder.Services.AddScoped<IAuthorizationHandler, DocumentAdminHandler>();
```

Named policies are how the same handlers get reused without every endpoint restating them, and a policy can bundle a cheap claim check with the resource requirement so the expensive part only runs for callers who got past the door.

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("EditDocument", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("scope", "documents.write");
        policy.AddRequirements(Operations.Update);
    });
```

The last piece is the default. `context.Succeed` is the only thing that grants, so a requirement nobody handled fails on its own — but that only helps on endpoints that ask. A fallback policy is what makes the endpoints you forgot ask anyway.

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());
```

Read those pieces back in order and they are the scene: a coarse gate that is cheap, a handler that loads the document before it decides, an exception that is named rather than assumed, and a default that says no when nothing said yes.
