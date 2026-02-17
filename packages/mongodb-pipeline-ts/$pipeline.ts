import {
  AggregationCursor,
  Collection,
  FindCursor,
  type Document,
  type Filter,
  type IndexSpecification,
} from "mongodb";
// import type { FieldArrayPath, FieldArrayPathValue, FieldPath, FieldPathValue } from "react-hook-form";
import type { Update as UpdateAt } from "ts-toolbelt/out/Object/P/Update";
import type { Split } from "ts-toolbelt/out/String/Split";
import type { AllPath } from "./AllPath";
type FieldPath<T extends unknown> = string;
type FieldArrayPath<T extends unknown> = string;
type FieldArrayPathValue<T extends unknown, P extends string> = unknown[];
type FieldPathValue<T extends unknown, P extends string> = unknown;
type $Path<S extends Document, P extends string = string> = `$${AllPath<S>}`;
type PathOf$Path<P extends string> = P extends `$${infer Path}` ? Path : never;
// type DeepRecord<Path extends string, Value> = Path extends `${infer Head}.${infer Tail}`
//   ? { [K in Head]: DeepRecord<Tail, Value> }
//   : { [K in Path]: Value };
type $Value<S extends Document, P extends string = string> = unknown;
type Expression<S extends Document> = unknown;
type $Set<S extends Document> = {
  [P in keyof S]?: Expression<S>;
} & Record<string, Expression<S>>;
type $SetResult<S extends Document, Set extends $Set<S>> = S & {
  [P in keyof Set]?: unknown; //Set[P] extends `$${infer P extends FieldPath<S>}` ? FieldPathValue<S, P> : Set[P]; // WARN: very slow
};
type $Unset<S extends Document> = {
  [P in keyof S]?: 1 | 0;
};
type $UnsetResult<S extends Document, Unset extends $Unset<S>> = S & {
  [P in keyof Unset & keyof S]?: Unset[P] extends 1 ? never : S[P];
};
type $Project<S extends Document> = { _id?: 1 | 0 } & {
  [P in keyof S]?: 1 | 0 | Expression<S>;
} & Record<string, Expression<S>>;
type $ProjectResult<S extends Document, Project extends $Project<S>> = {
  _id?: Project["_id"] extends 1 ? S["_id"] : Project["_id"] extends 0 ? never : S["_id"];
} & {
  [P in keyof S]?: Project[P] extends 1
    ? S[P]
    : Project[P] extends 0
      ? never
      : Project[P] extends $Path<S, infer K>
        ? $Value<S, K>
        : unknown;
} & {
  [P in keyof Project]?: Project[P] extends $Path<S, infer K> ? $Value<S, K> : unknown;
};

type PipelineLauncher = <S extends Document>(coll?: Collection<S>) => Pipeline<S>;

export const $pipeline: PipelineLauncher = function $pipeline<S extends Document = Document>(
  coll?: Collection<S>,
  pipeline = [] as readonly Document[],
) {
  const _coll: Collection<Document> | undefined = coll as Collection<Document> | undefined;
  return new Proxy(
    {
      // type helper
      satisfies: () => $pipeline(_coll, pipeline),
      as: () => $pipeline(_coll, pipeline),
      with: () => $pipeline(_coll, pipeline),
      // output
      aggregate() {
        if (!coll) throw new Error("Collection not provided");
        return coll.aggregate([...pipeline]) as unknown as FindCursor<S>;
      },
      // all general stage
      stage<RSchema extends Document = S>(stage: unknown): Pipeline<RSchema> {
        if (!stage || !Object.keys(stage as object).length)
          return $pipeline(_coll, pipeline) as unknown as Pipeline<RSchema>;
        return $pipeline(_coll, [...pipeline, stage as Document]) as unknown as Pipeline<RSchema>;
      },
    } as object,
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop !== "string") return;
        return (stage: unknown) => $pipeline(_coll, [...pipeline, { [`$${prop}`]: stage }]);
      },
    },
  ) as unknown as Pipeline<S>;
};
export type Pipeline<S extends Document | null = Document> = BasePipeline<S> &
  (S extends Document ? Stages<S> : {});
type BasePipeline<S extends Document | null = Document> = {
  aggregate(): AggregationCursor<S>;
  as<R extends Document>(): Pipeline<R>;
  satisfies<R extends S>(): Pipeline<R>;
  with<R extends Document>(): Pipeline<S & R>;
  stage<R extends Document>(stage: unknown): Pipeline<R>;
};
type Stages<S extends Document> = {
  /** Adds new fields to documents. Similar to $project, $addFields reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields. */
  addFields<I extends $Set<S>>(i: I): Pipeline<$SetResult<S, I>>;
  /** Categorizes incoming documents into groups, called buckets, based on a specified expression and bucket boundaries. */
  bucket<I extends Document>(i: I): Pipeline<S>;
  /** Categorizes incoming documents into a specific number of groups, called buckets, based on a specified expression. Bucket boundaries are automatically determined in an attempt to evenly distribute the documents into the specified number of buckets. */
  bucketAuto<I extends Document>(i: I): Pipeline<S>;
  /** Returns a Change Stream cursor for the collection. This stage can only occur once in an aggregation pipeline and it must occur as the first stage. */
  changeStream<I extends Document>(i: I): Pipeline<S>;
  /** Splits large change stream events that exceed 16 MB into smaller fragments returned in a change stream cursor.
   * You can only use $changeStreamSplitLargeEvent in a $changeStream pipeline and it must be the final stage in the pipeline. */
  changeStreamSplitLargeEvent<I extends Document>(i: I): Pipeline<S>;
  /** Returns statistics regarding a collection or view. */
  collStats<I extends Document>(i: I): Pipeline<S>;
  /** Returns a count of the number of documents at this stage of the aggregation pipeline.
   * Distinct from the $count aggregation accumulator. */
  count<I extends string>(i: I): Pipeline<Record<I, number>>;
  /** Creates new documents in a sequence of documents where certain values in a field are missing. */
  densify<I extends Document>(i: I): Pipeline<S>;
  /** Returns literal documents from input expressions. */
  documents<I extends Document>(i: I): Pipeline<S>;
  /** Processes multiple aggregation pipelines within a single stage on the same set of input documents. Enables the creation of multi-faceted aggregations capable of characterizing data across multiple dimensions, or facets, in a single stage. */
  facet<I extends Document>(i: I): Pipeline<S>;
  /** Populates null and missing field values within documents. */
  fill<I extends Document>(i: I): Pipeline<S>;
  /** Returns an ordered stream of documents based on the proximity to a geospatial point. Incorporates the functionality of $match, $sort, and $limit for geospatial data. The output documents include an additional distance field and can include a location identifier field. */
  geoNear<I extends Document>(i: I): Pipeline<S>;
  /** Performs a recursive search on a collection. To each output document, adds a new array field that contains the traversal results of the recursive search for that document. */
  graphLookup<I extends Document>(i: I): Pipeline<S>;
  /** Groups input documents by a specified identifier expression and applies the accumulator expression(s), if specified, to each group. Consumes all input documents and outputs one document per each distinct group. The output documents only contain the identifier field and, if specified, accumulated fields. */
  group<I extends Document>(i: I): Pipeline<I>;
  /** Returns statistics regarding the use of each index for the collection. */
  indexStats<I extends Document>(i: I): Pipeline<S>;
  /** Passes the first n documents unmodified to the pipeline where n is the specified limit. For each input document, outputs either one document (for the first n documents) or zero documents (after the first n documents). */
  limit<I extends number>(i: I): Pipeline<S>;
  /** Lists sampled queries for all collections or a specific collection. */
  listSampledQueries<I extends Document>(i: I): Pipeline<S>;
  /** Returns information about existing Atlas Search indexes on a specified collection. */
  listSearchIndexes<I extends Document>(i: I): Pipeline<S>;
  /** Lists all sessions that have been active long enough to propagate to the system.sessions collection. */
  listSessions<I extends Document>(i: I): Pipeline<S>;
  /** Performs a left outer join to another collection in the same database to filter in documents from the "joined" collection for processing. */
  lookup<I extends Document>(i: I): Pipeline<S>;
  /** Filters the document stream to allow only matching documents to pass unmodified into the next pipeline stage. $match uses standard MongoDB queries. For each input document, outputs either one document (a match) or zero documents (no match). */
  match(i: Filter<S>): Pipeline<S>;
  /** Writes the resulting documents of the aggregation pipeline to a collection. The stage can incorporate (insert new documents, merge documents, replace documents, keep existing documents, fail the operation, process documents with a custom update pipeline) the results into an output collection. To use the $merge stage, it must be the last stage in the pipeline. */
  merge<
    I extends {
      into: string;
      on?: string;
      let?: string;
      whenMatched?: "replace" | "keepExisting" | "merge" | "fail" | "pipeline";
      whenNotMatched?: "insert" | "discard" | "fail";
    },
  >(
    i: I,
  ): Pipeline<null>;
  /** Writes the resulting documents of the aggregation pipeline to a collection. To use the $out stage, it must be the last stage in the pipeline. */
  out<I extends { into: string }>(i: I): Pipeline<null>;
  /** Returns plan cache information for a collection. */
  planCacheStats<I extends Document>(i: I): Pipeline<S>;
  /** Reshapes each document in the stream, such as by adding new fields or removing existing fields. For each input document, outputs one document.
   * See also $unset for removing existing fields. */
  project<const I extends $Project<S>>(i: I): Pipeline<$ProjectResult<S, I>>;
  /** Reshapes each document in the stream by restricting the content for each document based on information stored in the documents themselves. Incorporates the functionality of $project and $match. Can be used to implement field level redaction. For each input document, outputs either one or zero documents. */
  redact<I extends Document>(i: I): Pipeline<S>;
  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  replaceRoot<P extends string, I extends { newRoot: $Path<S, P> }>(i: I): Pipeline<Document>; //TODO: fixme
  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  replaceWith<P extends string, I extends { newRoot: $Path<S, P> }>(i: I): Pipeline<Document>; //TODO: fixme
  /** Randomly selects the specified number of documents from its input. */
  sample<I extends { size: number }>(i: I): Pipeline<S>;
  /** Performs a full-text search of the field or fields in an Atlas collection.
   * NOTE
   * $search is only available for MongoDB Atlas clusters, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  search<I extends Document>(i: I): Pipeline<S>;
  /** Returns different types of metadata result documents for the Atlas Search query against an Atlas collection.
   * NOTE
   * $searchMeta is only available for MongoDB Atlas clusters running MongoDB v4.4.9 or higher, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  searchMeta<I extends Document>(i: I): Pipeline<S>;
  /** Adds new fields to documents. Similar to $project, $set reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields stage. */
  set<I extends $Set<Document>>(i: I): Pipeline<$SetResult<S, I>>;
  /** Groups documents into windows and applies one or more operators to the documents in each window.
  New in version 5.0. */
  setWindowFields<I extends Document>(i: I): Pipeline<S>;
  /** Skips the first n documents where n is the specified skip number and passes the remaining documents unmodified to the pipeline. For each input document, outputs either zero documents (for the first n documents) or one document (if after the first n documents). */
  skip<I extends number>(i: I): Pipeline<S>;
  /** Reorders the document stream by a specified sort key. Only the order changes; the documents remain unmodified. For each input document, outputs one document. */
  sort<I extends IndexSpecification>(i: I): Pipeline<S>;
  /** Groups incoming documents based on the value of a specified expression, then computes the count of documents in each distinct group. */
  sortByCount<I extends IndexSpecification>(i: I): Pipeline<S>;
  /** Performs a union of two collections; i.e. combines pipeline results from two collections into a single result set. */
  unionWith<I extends Document>(i: I): Pipeline<S>;
  /** Removes/excludes fields from documents.
   * $unset is an alias for $project stage that removes fields. */
  unset<I extends string | string[]>(i: I): Pipeline<Omit<S, I extends unknown[] ? I[number] : I>>;
  /** Deconstructs an array field from the input documents to output a document for each element. Each output document replaces the array with an element value. For each input document, outputs n documents where n is the number of array elements and can be zero for an empty array. */
  unwind<P extends FieldArrayPath<S>>(
    i:
      | `$${P}`
      | {
          path: `$${P}`;
          preserveNullAndEmptyArrays?: boolean;
        },
  ): Pipeline<UpdateAt<S, Split<P, ".">, FieldArrayPathValue<S, P>[number]>>;

  /** Performs an ANN search on a vector in the specified field of an Atlas collection.
   * New in version 7.0.2. */
  vectorSearch<I extends Document>(i: I): Pipeline<S>;
};
