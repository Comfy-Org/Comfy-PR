import UseSWRComponent from "use-swr-component";
import { TotalsBlock } from "../TotalsBlock";


/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default function TotalsPage() {
  return (
    <UseSWRComponent props={{}} Component={TotalsBlock} refreshInterval={300e3}>
      <div>Loading...</div>
    </UseSWRComponent>
  );
}
