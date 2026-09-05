import { db } from "@/lib/db";

/**
 * Getting garment data in.
 *
 * One normalised row shape, whatever the source: a CSV exported from SanMar's
 * dealer portal today, their API once it is wired. Everything downstream reads
 * the database, so swapping the source changes nothing but where these rows
 * come from.
 */

export type GarmentRow = {
  styleCode: string;
  brand?: string;
  name?: string;
  description?: string;
  colourName: string;
  colourCode?: string;
  size: string;
  costCents: number;
};

export type ImportReport = {
  styles: number;
  skus: number;
  skipped: { row: number; why: string }[];
};

/**
 * Replace what is known about the styles in these rows.
 *
 * Per style rather than wholesale: importing the tees must not delete the
 * hoodies. Within a style the sizes and colours are replaced, because a colour
 * SanMar has dropped should stop being offered — and marking rather than
 * deleting keeps a colour that comes back from losing its history.
 */
export async function importGarmentRows(
  rows: GarmentRow[],
  source: "SANMAR_API" | "CSV" | "MANUAL",
): Promise<ImportReport> {
  const report: ImportReport = { styles: 0, skus: 0, skipped: [] };

  const byStyle = new Map<string, GarmentRow[]>();
  rows.forEach((row, index) => {
    const styleCode = row.styleCode?.trim().toUpperCase();
    if (!styleCode) {
      report.skipped.push({ row: index + 1, why: "no style code" });
      return;
    }
    if (!row.size?.trim()) {
      report.skipped.push({ row: index + 1, why: `${styleCode}: no size` });
      return;
    }
    if (!Number.isFinite(row.costCents) || row.costCents <= 0) {
      report.skipped.push({ row: index + 1, why: `${styleCode} ${row.size}: no usable cost` });
      return;
    }
    byStyle.set(styleCode, [...(byStyle.get(styleCode) ?? []), { ...row, styleCode }]);
  });

  for (const [styleCode, styleRows] of byStyle) {
    const first = styleRows.find((r) => r.name) ?? styleRows[0];

    const style = await db.garmentStyle.upsert({
      where: { styleCode },
      create: {
        styleCode,
        brand: first.brand ?? "",
        name: first.name ?? "",
        description: first.description ?? "",
        source,
        syncedAt: new Date(),
      },
      update: {
        // A later import that carries no name must not blank the one already
        // there — a price-only export is a common thing to be handed.
        brand: first.brand || undefined,
        name: first.name || undefined,
        description: first.description || undefined,
        source,
        syncedAt: new Date(),
        isActive: true,
      },
    });

    const seen = new Set<string>();
    for (const row of styleRows) {
      const colourName = (row.colourName ?? "").trim();
      const size = row.size.trim();
      seen.add(`${colourName}|${size}`);

      await db.garmentSku.upsert({
        where: { styleId_colourName_size: { styleId: style.id, colourName, size } },
        create: {
          styleId: style.id,
          colourName,
          colourCode: row.colourCode ?? "",
          size,
          costCents: row.costCents,
        },
        update: {
          colourCode: row.colourCode || undefined,
          costCents: row.costCents,
          available: true,
        },
      });
      report.skus++;
    }

    // Anything this import did not mention is no longer offered.
    const existing = await db.garmentSku.findMany({
      where: { styleId: style.id },
      select: { id: true, colourName: true, size: true },
    });
    const gone = existing.filter((sku) => !seen.has(`${sku.colourName}|${sku.size}`));
    if (gone.length > 0) {
      await db.garmentSku.updateMany({
        where: { id: { in: gone.map((sku) => sku.id) } },
        data: { available: false },
      });
    }

    report.styles++;
  }

  return report;
}
