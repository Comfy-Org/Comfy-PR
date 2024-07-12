import UseSWRComponent from "use-swr-component";
import { TotalsChartBlock } from "../TotalsBlock";
/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default function TotalsPage() {
  return (
    <UseSWRComponent props={{}} Component={TotalsChartBlock} refreshInterval={1e3}>
      {<TotalsChartBlock />}
    </UseSWRComponent>
  );
}
