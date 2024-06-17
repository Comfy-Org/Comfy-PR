import DetailsTable from "../Details";

/**
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export default async function Details({ searchParams: { skip = 0, limit = 0 } }) {
  return <DetailsTable {...{ skip, limit }} />;
  //     return <UseSWRComponent props={{skip, limit}} Component={DetailsTable} refreshInterval={60e3}>{
  //     <DetailsTable {...{skip, limit}} />
  //   }</UseSWRComponent>;
}
