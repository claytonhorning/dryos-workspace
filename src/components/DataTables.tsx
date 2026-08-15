import type { SchemaField } from "@/lib/types";
import { cx } from "./ui";

export function SchemaTable({ fields }: { fields: SchemaField[] }) {
  return (
    <div className="dr-scroll overflow-x-auto">
      <table className="w-full min-w-[680px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Field", "Type", "Null", "Description", "Example"].map((h) => (
              <th
                key={h}
                className="px-5 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name} className="border-b border-line/60 last:border-0 align-top">
              <td className="px-5 py-3 font-mono text-[12.5px] whitespace-nowrap text-ink">
                {f.name}
              </td>
              <td className="px-5 py-3 font-mono text-[12px] whitespace-nowrap text-info">
                {f.type}
              </td>
              <td
                className={cx(
                  "px-5 py-3 font-mono text-[12px]",
                  f.nullable ? "text-warn" : "text-faint",
                )}
              >
                {f.nullable ? "yes" : "—"}
              </td>
              <td className="max-w-[360px] px-5 py-3 text-[13px] leading-relaxed text-muted">
                {f.description}
                {f.nullable && f.nullReason && (
                  <span className="mt-1 block text-[12px] text-faint">
                    Null when: {f.nullReason}
                  </span>
                )}
              </td>
              <td className="px-5 py-3 font-mono text-[12px] whitespace-nowrap text-faint">
                {f.example ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
