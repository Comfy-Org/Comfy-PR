import UseSWRComponent from "use-swr-component";
import DetailsTable from "../DetailsTable";
import Markdown from "react-markdown";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default function DetailsPage({ searchParams: { skip = 0, limit = 0 } }) {
  return (
    <div className="card overflow-hidden">
      <Markdown>{`
1. [Admin: Check Follow-up rules](/rules/default)
1. [Admin: Check Default rule](/rules/default)
`}</Markdown>

      <UseSWRComponent props={{ skip, limit }} Component={DetailsTable} refreshInterval={60e3}>
        {<DetailsTable {...{ skip, limit }} />}
      </UseSWRComponent>
    </div>
  );
}
