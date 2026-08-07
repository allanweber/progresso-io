import { redirect } from "next/navigation";

/**
 * The Biblioteca has no page of its own — it's a set of tabs. Landing on
 * `/coach/library` sends the coach to the default tab (Alimentos). Each tab is a
 * real route, so its data loads only when that tab is opened.
 */
export default function LibraryIndexPage() {
  redirect("/coach/library/foods");
}
