import UseSWRComponent from "use-swr-component";
import { Totals } from "../Totals";
/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default function TotalsPage() {
  return (
    <UseSWRComponent props={{}} Component={Totals} refreshInterval={1e3}>
      {<Totals />}
    </UseSWRComponent>
  );
}
