import UseSWRComponent from "use-swr-component";
import { TotalsBlock } from "../TotalsBlock";

// Force dynamic rendering to avoid build-time database access
export const dynamic = "force-dynamic";

/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default function TotalsPage() {
  return (
    <UseSWRComponent props={{}} Component={TotalsBlock} refreshInterval={1e3}>
      <div>Loading...</div>
    </UseSWRComponent>
  );
}
