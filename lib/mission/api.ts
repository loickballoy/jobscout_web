import { NextResponse } from "next/server";
import { z } from "zod";

/** Réponse d'erreur commune des routes Mission : liste d'erreurs Zod lisibles. */
export function invalid(error: z.ZodError | string, status = 400) {
  const errors = typeof error === "string" ? [error] : error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(corps)"} : ${i.message}`);
  return NextResponse.json({ error: errors.join(" ; "), errors }, { status });
}

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ attendue");

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
