// The false-positive guard for `no-error-message-to-response`, and the more
// important of its two fixtures.
//
// The rule has to survive three things or it gets switched off: server-side
// logging, which is where the full error BELONGS; rethrowing, which is how a
// handler defers to the error handler that owns this decision; and a cheap way
// to say "I have handled this", which is any call. It also has to resolve
// bindings rather than match names — this file deliberately reuses `err`,
// `msg` and `reason` for both a caught error and something innocent, and
// `response-violations.ts` uses the same names for the leak. Both files are
// linted together. If the rule matched by name, this one would light up.
//
// Nothing here may be reported.
//
// Not real code — these exist to be linted, not run.
declare class HttpError {
  constructor(status: number, messages: string[] | string | object);
}
declare const c: {
  json(body: unknown, status?: number): Response;
};
declare const logger: { error(payload: unknown): void };
declare function createMember(input: unknown): Promise<{ id: string }>;
declare function loadOrder(id: string): Promise<{ id: string }>;
declare function clientMessage(err: unknown, fallback: string): string;
declare function userFacingMessage(text: string): string;
declare function formStateFromError(err: unknown): { ok: false; message: string };
declare function isUniqueViolation(err: unknown): boolean;

// ---------------------------------------------------------------------------
// THE DISCRIMINATING PAIR.
//
// `response-violations.ts` catches an `err`, builds a `msg` from its message,
// and throws it at an `HttpError`. This `msg` is a message the author chose,
// and goes to the same constructor. If the rule reported this one, it would be
// resolving by name.
// ---------------------------------------------------------------------------
export async function chosenMessage(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    logger.error({ err });
    const msg = "Failed to create member";
    throw new HttpError(422, [msg]);
  }
}

// An `err` that is a parameter rather than a caught error, holding a string
// someone already sanitised. Same name, same sink, no leak.
export function renderKnownFailure(err: string) {
  return c.json({ error: err }, 422);
}

// ---------------------------------------------------------------------------
// 1. Logging. The server log is exactly where the whole error belongs, and a
//    rule that pushed people to redact it there would trade a disclosure bug
//    for an undebuggable one.
// ---------------------------------------------------------------------------
export async function logsInFullAndRespondsWithAConstant(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    console.error("createMember failed", err);
    logger.error({ err, message: err instanceof Error ? err.message : String(err) });
    throw new HttpError(422, ["Failed to create member"]);
  }
}

// ---------------------------------------------------------------------------
// 2. Rethrowing. The decision about what the client sees is made once, in the
//    error handler, and it is not made here.
// ---------------------------------------------------------------------------
export async function rethrows(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function rethrowsWithACause(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    throw new Error("createMember failed", { cause: err });
  }
}

// ---------------------------------------------------------------------------
// 3. The escape hatch, in each of its spellings. A call is a place where a
//    human made a decision about this value.
// ---------------------------------------------------------------------------
export async function throughClientMessage(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    const msg = clientMessage(err, "Failed to create member");
    throw new HttpError(422, [msg]);
  }
}

export async function throughUserFacingMessage(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    return c.json({ error: userFacingMessage(err instanceof Error ? err.message : "") }, 422);
  }
}

export async function throughFormStateFromError(input: unknown) {
  try {
    await createMember(input);
    return { ok: true as const, message: "Member created" };
  } catch (err) {
    return formStateFromError(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Branching on the error without carrying it. The guard that makes the code
//    correct mentions `err`; only the branches are inspected, so it passes.
// ---------------------------------------------------------------------------
export async function branchesOnTheErrorOnly(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    const reason = err instanceof Error ? "A known failure" : "An unknown failure";
    if (isUniqueViolation(err)) throw new HttpError(409, ["That email is already taken"]);
    throw new HttpError(422, [reason]);
  }
}

export async function shortCircuitsToAConstant(input: unknown) {
  try {
    return await createMember(input);
  } catch (err) {
    const reason = err && "The member could not be created";
    throw new HttpError(422, [reason]);
  }
}

// ---------------------------------------------------------------------------
// 5. Rejection handlers that respond with something chosen, including one with
//    no binding at all.
// ---------------------------------------------------------------------------
export function promiseCatchWithAConstant(id: string) {
  return loadOrder(id).catch(() => c.json({ error: "That order could not be loaded" }, 500));
}

export function promiseCatchThroughAHelper(id: string) {
  return loadOrder(id).catch((err) => c.json({ error: clientMessage(err, "Could not load order") }, 500));
}

// ---------------------------------------------------------------------------
// 6. Object literals whose `message` came from the author, in the shapes a
//    Server Action returns them.
// ---------------------------------------------------------------------------
export async function serverActionWithAChosenMessage(input: unknown) {
  try {
    await createMember(input);
    return { ok: true as const, message: "Member created" };
  } catch (err) {
    console.error(err);
    return { ok: false as const, message: "Could not create that member", reason: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// 7. A BROWSER component holding what it is about to render.
//
// This is the shape that decides the rule's return-position test. `result` is
// state in a component that already runs on the client, built from a failed
// action call — nothing crosses a boundary, nothing is disclosed, and a rule
// that reported it would be reporting two files in every app of this kind.
// ---------------------------------------------------------------------------
export async function importRowsInTheBrowser(rows: string[]) {
  const failures: { row: string; message: string }[] = [];
  for (const row of rows) {
    let result: { status: string; message: string };
    try {
      await createMember({ row });
      result = { status: "created", message: "" };
    } catch (error) {
      result = { status: "failed", message: error instanceof Error ? error.message : "The request did not complete." };
    }
    if (result.status === "failed") failures.push({ row, message: result.message });
  }
  return failures;
}

// ---------------------------------------------------------------------------
// 8. A helper that returns the message to its OWN caller. This is how a
//    sanitizer is written, and how a CLI wrapper hands a subprocess failure
//    back up — a bare `return err.message` is a value being passed along, not
//    a response body.
// ---------------------------------------------------------------------------
export function runOrReportFailure(command: () => string): string {
  try {
    return command();
  } catch (e) {
    const err = e as { stdout?: string; message?: string };
    return err.stdout?.trim() ?? err.message ?? "";
  }
}

// A `message` key built from the input rather than from the error, in the same
// catch block as an error the rule can see.
export async function echoesItsOwnInput(name: string) {
  try {
    return await createMember({ name });
  } catch (err) {
    logger.error({ err });
    return { ok: false as const, message: `Could not create ${name}` };
  }
}

// ---------------------------------------------------------------------------
// 9. The `sinks` option, and the pair that decides whether it can exist at
//    all. `.oxlintrc.json` names `recordPlatformActionFailure`,
//    `recordFailure` and `recordAuditEvent` as sinks for these fixtures.
//
//    `logFailure` below takes the identical object literal, with the identical
//    key, holding the identical value, and is not named. It has to stay
//    silent, because it is a log — and the only thing that separates it from
//    the sink is that a human said so. A rule that guessed here would either
//    flag every logging call or catch none of them.
// ---------------------------------------------------------------------------
declare function recordPlatformActionFailure(input: {
  orgId: string;
  reason?: string;
  message?: string;
}): Promise<void>;
declare const audit: { recordFailure(input: unknown): Promise<void> };
declare function recordAuditEvent(orgId: string, data: unknown): Promise<void>;
declare function logFailure(input: unknown): void;

export async function logsTheFailureReason(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    logFailure({ orgId, reason: err instanceof Error ? err.message : String(err) });
    logger.error({ err, message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// A named sink, sanitised. The escape hatch works the same inside a sink's
// payload as it does anywhere else — this is the fix the diagnostic asks for,
// and it has to be silent or the rule has told people to do something it then
// reports.
export async function recordsASanitisedReason(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    await recordPlatformActionFailure({ orgId, reason: clientMessage(err, "The action failed") });
    await audit.recordFailure({ orgId, message: userFacingMessage(String(err)) });
    throw err;
  }
}

// A named sink carrying a reason the author chose, and one carrying keys that
// are not response keys at all.
export async function recordsAChosenReason(orgId: string) {
  try {
    return await createMember({ orgId });
  } catch (err) {
    console.error(err);
    await recordAuditEvent(orgId, { action: "create_member", reason: "unique_violation" });
    throw err;
  }
}

// A named sink outside any catch, holding a `reason` that came from a
// parameter of the same name. Nothing was caught here, so there is no error
// binding to carry — the sink list widens the sinks, not the sources.
export async function recordsACallerSuppliedReason(orgId: string, err: string) {
  await recordPlatformActionFailure({ orgId, reason: err });
}
