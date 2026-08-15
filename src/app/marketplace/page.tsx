import { redirect } from "next/navigation";

export default function MarketplaceIndex() {
  // Energy is the only vertical with supply today.
  redirect("/marketplace/energy");
}
