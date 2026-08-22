import { AddFlow } from "@/components/AddFlow";
import { addSubscription } from "../actions";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <AddFlow action={addSubscription} justAdded={params.added === "1"} />
    </main>
  );
}
