---
summary: "Multi-tenancy without scattering WHERE clauses through your codebase. How PostgreSQL row-level security plus a transaction-scoped session variable pushes tenant isolation down into the database, where it cannot be forgotten."
tags: [postgres, multi-tenancy, backend]
---

# Row-Level Security in Postgres: Multi-Tenancy Without the `WHERE` Clauses

Multi-tenancy is the problem of serving many clients out of a single running application. The clients should never see each other's data.

To achieve this, the answers usually fall into three buckets, and each one pushes the problem somewhere uncomfortable.

## The Three Usual Answers, and Where Each One Hurts

**One database per client.** Each tenant gets its own physical database. The application picks the right connection per request. Strong isolation, but operations now scale with the number of clients. Migrations, backups, monitoring, and connection pools all multiply. Onboarding a tenant is no longer "insert a row," it becomes "provision a database."

**One schema per client, shared database.** The same set of tables lives under many schemas; the app sets `search_path` per request. Lighter than the database-per-tenant approach, but every migration still has to be applied N times. A single shared connection pool that constantly switches `search_path` is its own source of subtle bugs.

**Shared schema, filter in application code.** One table per entity, with a `tenant_id` column on every row. Every query carries an extra `WHERE tenant_id = ?`. Cheap to operate, but you are now one missing `WHERE` clause away from a tenant leak. The filter is enforced by code review, not by the database, which means it will eventually be forgotten somewhere.

Row-level security (RLS) is a fourth option that fixes the third one's main weakness. It moves the filter out of application code and into the database itself.

## What RLS Actually Does

PostgreSQL RLS lets you attach a **policy** to a table. The policy is a boolean expression. Before any row is returned by `SELECT`, or written by `INSERT` or `UPDATE`, the planner evaluates the policy against that row. If the expression returns false, the row is dropped. Silently for reads, with an error for writes.

A minimal policy for a tenant-scoped `event` table looks like this:

```sql
ALTER TABLE event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event FORCE  ROW LEVEL SECURITY;

CREATE POLICY event_access_policy ON event
    USING      (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
```

`USING` filters reads; `WITH CHECK` validates writes. The application can now issue `SELECT * FROM event` with no `WHERE` clause at all. The database filters before the rows ever leave the storage engine. Forgetting the filter is no longer possible, because there is no filter to forget.

`FORCE ROW LEVEL SECURITY` is the line that makes this real. Without it, the table owner (typically the same role your application connects as) would silently bypass the policy. With it, the policy applies even to the owner.

That leaves one question: where does `current_setting('app.current_tenant')` get its answer from? The policy is just an SQL expression, evaluated against every row. It needs to know the *current* tenant, and "current" is per-request, not per-database.

## The Bridge: GUCs, Set Per Transaction

PostgreSQL exposes a mechanism called **GUCs**, Grand Unified Configuration variables. They are how settings like `work_mem` and `statement_timeout` are configured. Less well known is that you can define your own (any name with a dot in it) and read it back with `current_setting('your.var.name')`.

Crucially, GUCs can be scoped to the *current transaction* with `SET LOCAL`. The value lives for one transaction only; when the transaction commits or rolls back, the GUC clears. That makes them the right primitive for "this work is for tenant A." The value lasts exactly as long as the work it is authorising.

The application sets the GUC at the start of each transaction, and the policy reads it back through `current_setting`:

```sql
SET LOCAL app.current_tenant = 'A';
```

The `true` second argument to `current_setting` in the policy is the `missing_ok` flag. Without it, reading an unset GUC would raise an error. That matters because not every transaction has a tenant. Background jobs, admin endpoints, and unauthenticated public pages all open transactions too, and the policy needs to behave sensibly when the GUC is absent.

The pattern most production systems land on is "default-open at the gate, default-deny inside." The policy returns true (allow) when the GUC is unset, and a single piece of application middleware is responsible for setting the GUC on every request that *should* be tenant-restricted. The check moves from "is this query filtered correctly?" to "is this request marked correctly?", which is a much smaller surface to get right.

## The Request Lifecycle

Here is how a tenant-scoped read flows end to end. Assume a user belongs to tenant A only, and the `event` table holds one row for tenant A and one for tenant B.

1. **The request arrives.** The application opens a database transaction for the work it is about to do.

2. **Middleware sets the tenant context.** Before any business logic runs, a single hook writes the GUC onto the connection:

    ```sql
    SET LOCAL app.current_tenant = 'A';
    ```

3. **The business code runs.** It issues the same plain query it would in any other application:

    ```sql
    SELECT id, tenant_id, name FROM event;
    ```

    No `WHERE tenant_id = ?` clause anywhere in the application code.

4. **The planner rewrites the query.** Before the storage engine sees the `SELECT`, the policy is injected as an extra predicate. For tenant A's row, the policy returns true. For tenant B's row, it returns false. Tenant B's row is dropped before it reaches the application.

5. **The transaction commits.** `SET LOCAL` ties the GUC to the transaction's lifetime, so the value clears. The pooled connection goes back to idle with no residue, ready for the next request, which may be a different tenant entirely.

## Try It

Pick a context below to see what each one writes onto the connection and what the same `SELECT * FROM event` returns afterward. Same query, same data, different policy verdicts.

<div data-rls-demo>Loading interactive example…</div>

<script src="/static/rls-interactive.js"></script>

<noscript>The interactive example requires JavaScript. The summary below covers the same ground.</noscript>

The application code is identical across all five contexts. Only the GUC value changes, and the planner takes care of the rest.

## One Detail Worth Calling Out

`SET LOCAL` is doing real work here. Plain `SET` would scope the GUC to the entire connection, and connection pools recycle connections between requests. The next request to grab that connection would inherit the previous tenant's value, a textbook tenant leak. `SET LOCAL` ties the value to the transaction, so commit (or rollback) clears it. Whatever framework holds your pool (HikariCP, pgbouncer in session mode, anything), `SET LOCAL` is the version that survives the round trip back to the idle pool.

## Drawbacks

RLS is not free, and it is not the right choice for every system.

**Portability.** RLS is a PostgreSQL feature. Equivalent mechanisms exist in SQL Server and Oracle, but the syntax and semantics differ. Adopting RLS is a commitment to Postgres. Switching engines later is not a trivial migration.

**Transactions are mandatory.** The whole scheme rests on the GUC being set on the right connection. That means every tenant-scoped query has to run inside a transaction the framework opened *after* the middleware wrote the GUC. Auto-commit code paths, ad-hoc queries that grab a raw connection from the pool, or any path that bypasses the transaction manager will silently miss the GUC and either see nothing or (if the policy defaults open) see everything.

**Operational footguns that SQL cannot catch.** Two of them are worth knowing. First, the application's database role must not be a superuser, and must not carry the `BYPASSRLS` attribute. Superusers ignore RLS unconditionally, and nothing inside SQL prevents you from connecting as one. Second, every new tenant-scoped table needs the same `ENABLE` + `FORCE` + policy boilerplate. A migration that adds a table without it punches a tenant-shaped hole through the model. Both are enforced by convention and code review, not by Postgres.

**An empty tenant context is a latent leak.** If the middleware leaves the GUC unset for a request that *should* have been tenant-scoped, the policy interprets that as "allow everything." A default-open policy is the right pragmatic choice for handling background jobs and admin paths, but it means the cost of a missing `SET LOCAL` is a silent over-fetch rather than a loud error. Production systems usually pair this with a non-production flag that flips the default to deny, so missing middleware blows up loudly in tests.

## Takeaway

Filtering in the application is the cheapest multi-tenancy option until the day someone ships a query without the filter. RLS moves the filter into the database, where the planner enforces it before any application code is reached. The trade-off is a tighter coupling to Postgres and a hard dependency on transactions. In exchange, "did I remember the `WHERE` clause?" stops being a code review question.

If you are starting a multi-tenant system on Postgres today, RLS is worth at least the afternoon it takes to prototype against your real schema. The pattern is small: one policy per tenant-scoped table, one `SET LOCAL` per request, and one piece of middleware deciding when to set it.
