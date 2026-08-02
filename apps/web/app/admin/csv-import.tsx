"use client";
import { useState } from "react";

export function CsvImport() {
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
      <summary>CSV 批量导入</summary>
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
          预检 CSV
        </button>
        {result && (
          <>
            <p>
              有效行：{result.validRows ?? 0}；冲突：
              {result.conflicts?.length ?? 0}；错误：
              {result.errors?.length ?? 0}
            </p>
            {result.conflicts?.map((item: any) => (
              <p key={item.canonicalName}>
                {item.canonicalName}：{item.resolution}
              </p>
            ))}
            {result.errors?.map((item: any) => (
              <p className="form-error" key={item.row}>
                第 {item.row} 行：{item.errors.join("；")}
              </p>
            ))}
            {!result.errors?.length && !result.imported && (
              <button onClick={() => void run(true)}>确认导入</button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
