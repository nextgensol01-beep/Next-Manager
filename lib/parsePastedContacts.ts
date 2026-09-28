export interface ParsedContactRow {
  name: string;
  designation: string;
  phone: string;
  email: string;
}

/** Preserve empty spreadsheet cells and quoted CSV delimiters/newlines. */
export function parsePastedContacts(raw: string): ParsedContactRow[] {
  const delimiter = raw.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (quoted && raw[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === delimiter || ch === "\n" || ch === "\r")) {
      row.push(cell.trim());
      cell = "";
      if (ch !== delimiter) {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === "\r" && raw[i + 1] === "\n") i++;
      }
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((value) => value.toLowerCase());
  const names = ["name", "contact name", "contact", "person"];
  const nameIndex = headers.findIndex((value) => names.includes(value));
  const hasHeader = nameIndex >= 0;
  const find = (labels: string[]) => headers.findIndex((value) => labels.includes(value));
  const designationIndex = find(["designation", "role", "title"]);
  const phoneIndex = find(["phone", "phone number", "mobile", "mobile number"]);
  const emailIndex = find(["email", "email address", "e-mail"]);
  return (hasHeader ? rows.slice(1) : rows).map((cells) => {
    if (hasHeader) return {
      name: cells[nameIndex] || "",
      designation: cells[designationIndex] || "",
      phone: cells[phoneIndex] || "",
      email: cells[emailIndex] || "",
    };
    const [name = "", second = "", third = "", fourth = ""] = cells;
    const phone = (value: string) => /^[+\d\s\-().]{7,}$/.test(value);
    const email = (value: string) => value.includes("@");
    if (phone(second) || email(second)) return {
      name, designation: "",
      phone: [second, third, fourth].find(phone) || "",
      email: [second, third, fourth].find(email) || "",
    };
    return { name, designation: second, phone: third, email: fourth };
  }).filter((entry) => Boolean(entry.name));
}
