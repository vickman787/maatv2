import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handleApiError, jsonError, noStore, readJsonBody } from "@/lib/api";
import { requireWorkspaceContext } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiConfig } from "@/lib/config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createInvestigationActions, invoiceSchema, candidateSchema } from "@/lib/agent/actions";
import { decideProposal, getInvestigation } from "@/lib/agent/store";
import { investigate } from "@/lib/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const requestSchema = z.object({ invoiceRowId: z.string().min(1).max(120),
  action: z.enum(["message", "read_invoice", "list_candidates", "decide"]), input: z.unknown() }).strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const invoiceRowId = new URL(request.url).searchParams.get("invoiceRowId") ?? "";
    if (!invoiceRowId || invoiceRowId.length > 120) return jsonError("Invoice is required.", 400);
    return noStore(NextResponse.json({ ...getInvestigation(getDb(), ctx, { batchId: id, invoiceRowId }), configured: aiConfig().configured }));
  } catch (error) { return noStore(handleApiError(error)); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = requestSchema.parse(await readJsonBody(request, 16 * 1024));
    const selection = { batchId: id, invoiceRowId: body.invoiceRowId };
    const db = getDb();
    let result: unknown;
    if (body.action === "message") {
      if (!consumeRateLimit(`agent:${ctx.workspace.id}:${ctx.user!.id}`, 30).allowed)
        return jsonError("Investigation limit reached. Please try again next hour.", 429);
      result = await investigate(db, ctx, selection, body.input);
    } else if (body.action === "decide") {
      const decision = decideProposal(db, ctx, selection, body.input);
      result = { ...decision, ...getInvestigation(db, ctx, selection) };
    } else {
      const actions = createInvestigationActions(db, ctx, selection);
      const input = body.action === "read_invoice" ? invoiceSchema.parse(body.input) : candidateSchema.parse(body.input);
      result = await actions[body.action].run(input as never, { caller: "frontend", orgId: ctx.workspace.id });
    }
    return noStore(NextResponse.json(result));
  } catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.name === "ActionInputValidationError"))
      return jsonError("Invalid investigation input.", 400);
    return noStore(handleApiError(error));
  }
}
