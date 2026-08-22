import { ImportFlow } from "@/components/ImportFlow";
import { addSubscriptionsBulk } from "../actions";

export default function ImportPage() {
  return (
    <main>
      <ImportFlow addBulk={addSubscriptionsBulk} />
    </main>
  );
}
