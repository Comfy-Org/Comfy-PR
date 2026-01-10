import Markdown from "react-markdown";
import UseSWRComponent from "use-swr-component";
import DetailsTable from "../DetailsTable";

export const dynamic = "force-dynamic";
/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default function DetailsPage() {
  const skip = 0;
  const limit = 0;
  return (
    <div className="card overflow-hidden">
      <Markdown>{`
1. [Admin: Check Follow-up rules](/rules)
2. [Admin: Check Default Follow-up rule](/rules/default)
`}</Markdown>

      <UseSWRComponent
        props={{ skip, limit }}
        Component={DetailsTable}
        refreshInterval={60e3}
        fallbackData={<DetailsTable {...{ skip, limit }} />}
      >
        {<DetailsTable {...{ skip, limit }} />}
      </UseSWRComponent>
    </div>
  );
}
