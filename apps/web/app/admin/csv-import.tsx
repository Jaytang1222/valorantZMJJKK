"use client";
import { useState } from "react";
import { t, tWith } from "../lib/i18n";
import { useLocale } from "../components/ui-provider";

export function CsvImport() {
  const { locale } = useLocale();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<any>(null);
  async function run(apply: boolean) {
    const response = await fetch("/api/admin/csv-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv, apply }),
    });
    setResult(await response.json());
  }
  return (
    <details className="admin-create">
      <summary>{t(locale, "admin.csvImport")}</summary>
      <div className="csv-import">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
        <button disabled={!csv} onClick={() => void run(false)}>
          {t(locale, "admin.csvPreview")}
        </button>
        {result && (
          <>
            <p>
              {tWith(locale, "admin.csvSummary", {
                valid: result.validRows ?? 0,
                conflicts: result.conflicts?.length ?? 0,
                errors: result.errors?.length ?? 0,
              })}
            </p>
            {result.conflicts?.map((item: any) => (
              <p key={item.canonicalName}>
                {item.canonicalName}: {item.resolution}
              </p>
            ))}
            {result.errors?.map((item: any) => (
              <p className="form-error" key={item.row}>
                {tWith(locale, "admin.csvErrorRow", {
                  row: item.row,
                  detail: item.errors.join("; "),
                })}
              </p>
            ))}
            {!result.errors?.length && !result.imported && (
              <button onClick={() => void run(true)}>
                {t(locale, "admin.csvApply")}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
