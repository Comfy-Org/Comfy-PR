import UseSWRComponent from "use-swr-component";
import DetailsTable from "../DetailsTable";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default function DetailsPage({ searchParams: { skip = 0, limit = 0 } }) {
  return (
    <div className="card overflow-hidden">
      <UseSWRComponent props={{ skip, limit }} Component={DetailsTable} refreshInterval={60e3}>
        {<DetailsTable {...{ skip, limit }} />}
      </UseSWRComponent>
    </div>
  );
}
