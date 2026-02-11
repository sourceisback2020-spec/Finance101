import { z } from "zod";
import type { Transaction } from "../../domain/models";

const CsvRowSchema = z.object({
  date: z.string().min(8),
  amount: z.coerce.number().positive(),
  type: z.enum(["income", "expense"]),
  category: z.string().min(1),
  merchant: z.string().default(""),
  account: z.string().default("Checking"),
  note: z.string().default(""),
  recurring: z.coerce.number().default(0)
});

function uid() {
  return crypto.randomUUID();
}

export function parseTransactionsCsv(csvText: string): Transaction[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const rows = lines.slice(1);

  return rows.map((row) => {
    const cols = row.split(",");
    const obj = headers.reduce<Record<string, string>>((acc, header, idx) => {
      acc[header] = (cols[idx] ?? "").replace(/^"|"$/g, "").trim();
      return acc;
    }, {});
    const parsed = CsvRowSchema.parse(obj);
    return {
      id: uid(),
      date: parsed.date,
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      merchant: parsed.merchant,
      account: parsed.account,
      note: parsed.note,
      recurring: parsed.recurring
    };
  });
}




