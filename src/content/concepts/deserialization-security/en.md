---
title: "Deserialization Security"
summary: "Deserialization turns bytes you did not write into live objects, and the moment of construction is the attack surface: the defense is to refuse formats that let the payload name its own types, and to treat every deserialization point as a trust boundary."
category: "Application security"
level: 4
related:
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
  - label: SQL Injection
    slug: sql-injection
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Web Application Firewall
    slug: web-application-firewall
references:
  - title: Deserialization risks in use of BinaryFormatter and related types
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide
  - title: Deserialization Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
  - title: JSON serialization and deserialization in .NET
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
---

## When to use

- Inventory every point where external bytes become objects, not just the request body. Queue messages, cache entries, uploaded files, webhook payloads and rows written by another service all get deserialized, and the ones that are not obviously "user input" are the ones nobody reviewed. "We wrote this ourselves" holds only while nobody else can write to the store, so a shared Redis or a queue with a broad access policy puts those bytes outside the trust boundary too.
- Audit for the legacy binary formatters as a standing task. `BinaryFormatter` in .NET code, and `SoapFormatter`, `NetDataContractSerializer` and `LosFormatter` in any .NET Framework code you are still carrying, all reconstruct arbitrary types named inside the payload, which is the property that makes them unsafe regardless of what the payload happens to contain. Finding them is a grep; replacing them is a migration, and it is better started before a deadline forces it.
- Review any JSON that carries type metadata. A document with a field naming a CLR type is asking the deserializer to choose what to construct, and that choice belongs to your allow-list rather than to whoever sent the document.
- Treat this as a design question when picking a format for a new integration. A contract-first format with a fixed schema removes the whole class of problem, and the decision costs nothing at the start and a rewrite later.

## Cautions

- `BinaryFormatter` is removed in .NET 9, so migration is no longer optional. The APIs were obsoleted, then made to throw, and now the implementation is gone from the runtime; a component still depending on it is a component that stops working on upgrade. Plan the format change rather than reaching for the compatibility package.
- Type-name handling turns a data format into a code-selection mechanism. In Newtonsoft.Json, `TypeNameHandling.Auto` and `TypeNameHandling.All` let the document decide which types are constructed, which is acceptable for data you produced and dangerous for data you received. Keep it at `None` on anything reachable from outside, and where a legacy contract makes that impossible, pair the setting with an `ISerializationBinder` that resolves only the types you name.
- Validating after deserialization is already too late. Construction itself runs code: constructors, property setters, callbacks and finalizers all execute before your check sees the object, so the check has to be on the shape of the input and the set of permitted types, not on the object that came out.
- Bound depth and size before parsing. A deeply nested or enormous document consumes CPU and memory during parsing alone, which is a denial of service that needs no type trickery at all. Set a maximum depth, cap the request body, and reject rather than truncate.

## In .NET

- `System.Text.Json` is safe by default because it will not construct a type the document names. Polymorphism is opt-in and closed: you declare the permitted subtypes with `[JsonDerivedType]`, and a discriminator outside that list is a deserialization failure rather than a lookup.

```csharp
// The allow-list is in your code; the payload only picks from it.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(CardPayment), "card")]
[JsonDerivedType(typeof(BankTransfer), "transfer")]
public abstract class Payment;

var options = new JsonSerializerOptions
{
    // Parsing limit (the default is 64), applied before any object exists.
    MaxDepth = 32,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
};
```

- Keep the parser limits next to the endpoint limits. `MaxDepth` bounds nesting, and the ASP.NET Core request body size limit bounds the bytes that reach the parser; together they make the resource cost of a hostile document a rejection instead of a slowdown.
- The `DataContractSerializer` family is contract-bound rather than type-name-driven, and its known types are declared in code. That makes it a reasonable destination for XML integrations, provided the known-type list stays closed and the XML reader is configured to ignore document type definitions and external entities.
- Make the migration mechanical where you can. A payload that was binary-serialized between your own components usually maps to a JSON or protobuf contract with the same fields, and writing the contract explicitly is what stops the next component from serializing an object graph it did not intend to expose.
