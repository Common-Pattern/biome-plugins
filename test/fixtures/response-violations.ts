// Every function here MUST be reported by `no-error-message-to-response`.
//
// The corpus is the real one: these are the shapes an audit found across ~30
// handlers in a Hono + drizzle API, plus the Next.js Server Action spelling of
// the same mistake. Every one of them publishes `Failed query: <SQL>` and the
// bound parameters to the caller the moment a query fails.
//
// Not real code — these exist to be linted, not run.
declare class HttpError {
  constructor(status: number, messages: string[] | string | object);
}
declare const c: {
  json(body: unknown, status?: number): Response;
};
declare function createMember(input: unknown): Promise<{ id: string }>;
declare function loadOrder(id: string): Promise<{ id: string }>;

// ---------------------------------------------------------------------------
// 1. The bug verbatim, as it stood in api-ts/src/handlers/members.ts.
// ---------------------------------------------------------------------------
export async function createMemberAsShipped(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create member";
    throw new HttpError(422, [msg]); // no-error-message-to-response
  }
}

// ---------------------------------------------------------------------------
// 2. The same leak without the binding hop, and with the wrappings people
//    reach for around it.
// ---------------------------------------------------------------------------
export async function directMemberAccess(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new HttpError(422, [(err as Error).message]); // no-error-message-to-response
  }
}

export async function templateLiteral(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new HttpError(500, `Could not create the member: ${(err as Error).message}`); // no-error-message-to-response
  }
}

export async function concatenated(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new HttpError(500, "Could not create the member: " + (err as Error).message); // no-error-message-to-response
  }
}

export async function nullishFallback(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new HttpError(422, [(err as Error).message ?? "Failed to create member"]); // no-error-message-to-response
  }
}

export async function theErrorValueItself(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new HttpError(422, [err]); // no-error-message-to-response
  }
}

// ---------------------------------------------------------------------------
// 3. Hono. `c.json({ error })` and its plural, which a rule matching only the
//    singular could be got round by adding a letter.
// ---------------------------------------------------------------------------
export async function honoSingular(input: unknown) {
  try {
    await createMember(input);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422); // no-error-message-to-response
  }
}

export async function honoPlural(input: unknown) {
  try {
    await createMember(input);
    return c.json({ ok: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed";
    return c.json({ errors: [reason] }, 422); // no-error-message-to-response
  }
}

// ---------------------------------------------------------------------------
// 4. The Web platform response, with no framework in the way at all.
// ---------------------------------------------------------------------------
export async function rawResponse(input: unknown) {
  try {
    await createMember(input);
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response((err as Error).message, { status: 500 }); // no-error-message-to-response
  }
}

// ---------------------------------------------------------------------------
// 5. The Next.js Server Action shape: an object literal that IS the response.
//    The last one is wrapped in a middleware helper, which is how actions are
//    actually written — the test is the return, not what encloses it.
// ---------------------------------------------------------------------------
export async function serverAction(input: unknown) {
  try {
    await createMember(input);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message }; // no-error-message-to-response
  }
}

// Assigned first, returned second. The returned identifier resolves to the
// binding and the object literal is its write, so the hop costs nothing.
export async function serverActionViaABinding(input: unknown) {
  try {
    await createMember(input);
    return { ok: true as const };
  } catch (e) {
    const state = { ok: false as const, message: (e as Error).message };
    return state; // no-error-message-to-response
  }
}

declare function withAuth<T>(handler: () => Promise<T>): () => Promise<T>;

export const wrappedServerAction = withAuth(async () => {
  try {
    await createMember({});
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, reason: (e as Error).message }; // no-error-message-to-response
  }
});

// ---------------------------------------------------------------------------
// 6. A rejection handler rather than a catch block. Same binding, same leak,
//    and no `catch` keyword anywhere for a grep to find.
// ---------------------------------------------------------------------------
export function promiseCatch(id: string) {
  return loadOrder(id).catch((err) => {
    return c.json({ error: (err as Error).message }, 500); // no-error-message-to-response
  });
}

export function promiseThenRejection(id: string) {
  return loadOrder(id).then(
    (order) => c.json(order),
    (err) => c.json({ error: (err as Error).message }, 500), // no-error-message-to-response
  );
}

// ---------------------------------------------------------------------------
// 7. Through an alias of the error, and through a reassigned binding. One
//    leaking write is enough — which branch runs is not something a linter
//    gets to know.
// ---------------------------------------------------------------------------
export async function throughAnAliasOfTheError(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    const cause = err;
    throw new HttpError(422, [(cause as Error).message]); // no-error-message-to-response
  }
}

export async function leakingOnOneBranchOnly(input: unknown, verbose: boolean) {
  try {
    return await createMember(input);
  } catch (err) {
    let msg = "Failed to create member";
    if (verbose) msg = (err as Error).message;
    throw new HttpError(422, [msg]); // no-error-message-to-response
  }
}

// ---------------------------------------------------------------------------
// 8. Stored, then served. A call is the rule's escape hatch, so these need the
//    `sinks` option to name the function — see `.oxlintrc.json`, which passes
//    `recordPlatformActionFailure` and `recordFailure` for these fixtures.
//
//    `recordPlatformActionFailure` writes its `reason` into an
//    `audit_events.data.reason` column, and a serializer serves that column
//    back out through three listing endpoints. No response object appears at
//    the call site, which is what makes it the worst-shaped leak of the set:
//    the disclosure happens on a request nobody was looking at.
// ---------------------------------------------------------------------------
declare function recordPlatformActionFailure(input: {
  orgId: string;
  reason?: string;
  message?: string;
}): Promise<void>;
declare const audit: { recordFailure(input: unknown): Promise<void> };
declare function recordAuditEvent(orgId: string, data: unknown): Promise<void>;

export async function recordsTheFailureReason(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    await recordPlatformActionFailure({
      orgId,
      reason: err instanceof Error ? err.message : String(err), // no-error-message-to-response
    });
    throw err;
  }
}

// The sink reached through a member expression. The property name is what is
// matched, so `audit.recordFailure` and a bare `recordFailure` are one entry.
export async function recordsThroughAnObject(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    await audit.recordFailure({ orgId, message: (err as Error).message }); // no-error-message-to-response
    throw err;
  }
}

// The object literal is not the first argument. Every argument is checked —
// the payload's position in a signature is not something a rule gets to assume.
export async function recordsInASecondArgument(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    await recordAuditEvent(orgId, { error: (err as Error).message }); // no-error-message-to-response
    throw err;
  }
}

// The binding hop, and the shorthand property that hides it. `reason` holds
// the ternary, and `{ orgId, reason }` looks like it holds a chosen string.
export async function recordsViaABinding(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "The action failed";
    await recordPlatformActionFailure({ orgId, reason }); // no-error-message-to-response
    throw err;
  }
}
