import { redirect } from "next/navigation";

export default function QuotationGeneratorRedirect() {
  redirect("/dashboard/quotations");
}
