"use client";

import type {
  ClientCustomFieldDefinition,
  ClientCustomFieldValue,
  ClientCustomFieldValues,
} from "@/lib/clientCustomFields";

type CustomFieldInputsProps = {
  fields: ClientCustomFieldDefinition[];
  values: ClientCustomFieldValues;
  onChange: (values: ClientCustomFieldValues) => void;
};

export function CustomFieldInputs({ fields, values, onChange }: CustomFieldInputsProps) {
  if (fields.length === 0) return null;

  const setValue = (key: string, value: ClientCustomFieldValue) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="rounded-xl border border-base bg-surface/50 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-default">Additional Fields</p>
        <p className="text-xs text-faint mt-0.5">Fields configured from Settings.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((field) => {
          const value = values[field.key];

          if (field.type === "checkbox") {
            return (
              <label key={field.key} className="flex items-center gap-2 rounded-lg border border-base bg-card px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={Boolean(value)}
                  onChange={(event) => setValue(field.key, event.target.checked)}
                  required={field.required}
                />
                <span className="text-sm font-medium text-default">{field.label}</span>
              </label>
            );
          }

          return (
            <div key={field.key}>
              <label className="label">
                {field.label}{field.required ? " *" : ""}
              </label>
              <input
                className={field.type === "number" ? "input-field font-mono text-sm" : "input-field"}
                type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                value={String(value ?? "")}
                onChange={(event) => setValue(field.key, event.target.value)}
                required={field.required}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
