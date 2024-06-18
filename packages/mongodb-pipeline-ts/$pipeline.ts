import { Collection, FindCursor, type Document, type Filter, type IndexSpecification } from "mongodb";
import type { FieldArrayPath, FieldArrayPathValue } from "react-hook-form";
// import type { FieldPath, FieldPathValue } from "react-hook-form";

// react-hook-form path match is extremely slow, while generating 3k+ paths for a object
type FieldPath<TSchema extends Document> = string;
type FieldPathValue<TSchema extends Document, Path extends string> = any;
//  type FieldArrayPath<TSchema extends Document> = string;
//  type FieldArrayPathValue<TSchema extends Document, Path extends string> = any;

type $Path<
  TSchema extends Document,
  Path extends string & FieldPath<TSchema> = string & FieldPath<TSchema>,
> = `$${Path}`;
type Expression<TSchema extends Document> = $Path<TSchema> & any;
type $Set<TSchema extends Document> = {
  [P in keyof TSchema]?: Expression<TSchema>;
} & Record<string, any>;
type $SetResult<TSchema extends Document, Set extends $Set<TSchema>> = TSchema & {
  [P in keyof Set]?: Set[P] extends `$${infer Path extends string}`
    ? Path extends FieldPath<TSchema>
      ? FieldPathValue<TSchema, Path>
      : any
    : Set[P];
};
type $Unset<TSchema extends Document> = {
  [P in keyof TSchema]?: 1 | 0;
};
type $UnsetResult<TSchema extends Document, Unset extends $Unset<TSchema>> = TSchema & {
  [P in keyof Unset & keyof TSchema]?: Unset[P] extends 1 ? never : TSchema[P];
};
type $Project<TSchema extends Document> = { _id?: 1 | 0 } & {
  [P in FieldPath<TSchema>]?: 1 | 0 | Expression<TSchema>;
} & Record<string, Expression<TSchema>>;
type $ProjectResult<TSchema extends Document, Project extends $Project<TSchema>> = {
  _id?: Project["_id"] extends 1 ? TSchema["_id"] : Project["_id"] extends 0 ? never : TSchema["_id"];
} & {
  [P in FieldPath<TSchema>]?: Project[P] extends 1
    ? TSchema[P]
    : Project[P] extends 0
      ? never
      : Project[P] extends $Path<TSchema, infer K>
        ? FieldPathValue<TSchema, K>
        : any;
} & {
  [P in keyof Project]?: Project[P] extends $Path<TSchema, infer K> ? FieldPathValue<TSchema, K> : any;
};

type StageBuilder<TSchema extends Document | null = Document> = BasePipeline<TSchema> &
  (TSchema extends Document ? Stages<TSchema> : {});

export const $pipeline: <TSchema extends Document>(coll?: Collection<TSchema>) => StageBuilder<TSchema> =
  function $pipeline<TSchema extends Document = Document>(
    coll?: Collection<TSchema>,
    pipeline = [] as readonly Document[],
  ) {
    const _coll = coll as any;
    return new Proxy(
      {
        // type helper
        satisfies<RSchema extends TSchema = TSchema>() {
          return $pipeline<RSchema>(_coll, pipeline);
        },
        as<RSchema extends Document = TSchema>() {
          return $pipeline<RSchema>(_coll, pipeline);
        },
        // output
        aggregate() {
          if (!coll) throw new Error("Collection not provided");
          return coll.aggregate([...pipeline]) as unknown as FindCursor<TSchema>;
        },
        // all general stage
        stage<RSchema extends Document = TSchema>(stage: any): StageBuilder<RSchema> {
          if (!stage || !Object.keys(stage).length) return $pipeline(_coll, pipeline);
          return $pipeline(_coll, [...pipeline, stage]);
        },
      } as any,
      {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver);
          if (typeof prop !== "string") return;
          return (stage: any) => $pipeline(_coll, [...pipeline, { [`$${prop}`]: stage }]);
        },
      },
    );
  };
type BasePipeline<TSchema extends Document | null = Document> = {
  aggregate(): FindCursor<TSchema>;
  as<RSchema extends Document>(): StageBuilder<RSchema>;
  satisfies<RSchema extends TSchema = TSchema>(): StageBuilder<RSchema>;
  stage<RSchema extends Document>(stage: any): StageBuilder<RSchema>;
};
type Stages<S extends Document = Document> = {
  /** Adds new fields to documents. Similar to $project, $addFields reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields. */
  addFields<I extends $Set<S>>(i: I): StageBuilder<$SetResult<S, I>>;
  /** Categorizes incoming documents into groups, called buckets, based on a specified expression and bucket boundaries. */
  bucket<I extends Document>(i: I): StageBuilder<S>;
  /** Categorizes incoming documents into a specific number of groups, called buckets, based on a specified expression. Bucket boundaries are automatically determined in an attempt to evenly distribute the documents into the specified number of buckets. */
  bucketAuto<I extends Document>(i: I): StageBuilder<S>;
  /** Returns a Change Stream cursor for the collection. This stage can only occur once in an aggregation pipeline and it must occur as the first stage. */
  changeStream<I extends Document>(i: I): StageBuilder<S>;
  /** Splits large change stream events that exceed 16 MB into smaller fragments returned in a change stream cursor.
   * You can only use $changeStreamSplitLargeEvent in a $changeStream pipeline and it must be the final stage in the pipeline. */
  changeStreamSplitLargeEvent<I extends Document>(i: I): StageBuilder<S>;
  /** Returns statistics regarding a collection or view. */
  collStats<I extends Document>(i: I): StageBuilder<S>;
  /** Returns a count of the number of documents at this stage of the aggregation pipeline.
   * Distinct from the $count aggregation accumulator. */
  count<I extends string>(i: I): StageBuilder<Record<I, number>>;
  /** Creates new documents in a sequence of documents where certain values in a field are missing. */
  densify<I extends Document>(i: I): StageBuilder<S>;
  /** Returns literal documents from input expressions. */
  documents<I extends Document>(i: I): StageBuilder<S>;
  /** Processes multiple aggregation pipelines within a single stage on the same set of input documents. Enables the creation of multi-faceted aggregations capable of characterizing data across multiple dimensions, or facets, in a single stage. */
  facet<I extends Document>(i: I): StageBuilder<S>;
  /** Populates null and missing field values within documents. */
  fill<I extends Document>(i: I): StageBuilder<S>;
  /** Returns an ordered stream of documents based on the proximity to a geospatial point. Incorporates the functionality of $match, $sort, and $limit for geospatial data. The output documents include an additional distance field and can include a location identifier field. */
  geoNear<I extends Document>(i: I): StageBuilder<S>;
  /** Performs a recursive search on a collection. To each output document, adds a new array field that contains the traversal results of the recursive search for that document. */
  graphLookup<I extends Document>(i: I): StageBuilder<S>;
  /** Groups input documents by a specified identifier expression and applies the accumulator expression(s), if specified, to each group. Consumes all input documents and outputs one document per each distinct group. The output documents only contain the identifier field and, if specified, accumulated fields. */
  group<I extends Document>(i: I): StageBuilder<I>;
  /** Returns statistics regarding the use of each index for the collection. */
  indexStats<I extends Document>(i: I): StageBuilder<S>;
  /** Passes the first n documents unmodified to the pipeline where n is the specified limit. For each input document, outputs either one document (for the first n documents) or zero documents (after the first n documents). */
  limit<I extends number>(i: I): StageBuilder<S>;
  /** Lists sampled queries for all collections or a specific collection. */
  listSampledQueries<I extends Document>(i: I): StageBuilder<S>;
  /** Returns information about existing Atlas Search indexes on a specified collection. */
  listSearchIndexes<I extends Document>(i: I): StageBuilder<S>;
  /** Lists all sessions that have been active long enough to propagate to the system.sessions collection. */
  listSessions<I extends Document>(i: I): StageBuilder<S>;
  /** Performs a left outer join to another collection in the same database to filter in documents from the "joined" collection for processing. */
  lookup<I extends Document>(i: I): StageBuilder<S>;
  /** Filters the document stream to allow only matching documents to pass unmodified into the next pipeline stage. $match uses standard MongoDB queries. For each input document, outputs either one document (a match) or zero documents (no match). */
  match(i: Filter<S>): StageBuilder<S>;
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
  ): StageBuilder<null>;
  /** Writes the resulting documents of the aggregation pipeline to a collection. To use the $out stage, it must be the last stage in the pipeline. */
  out<I extends { into: string }>(i: I): StageBuilder<null>;
  /** Returns plan cache information for a collection. */
  planCacheStats<I extends Document>(i: I): StageBuilder<S>;
  /** Reshapes each document in the stream, such as by adding new fields or removing existing fields. For each input document, outputs one document.
   * See also $unset for removing existing fields. */
  project<const I extends $Project<S>>(i: I): StageBuilder<$ProjectResult<S, I>>;
  /** Reshapes each document in the stream by restricting the content for each document based on information stored in the documents themselves. Incorporates the functionality of $project and $match. Can be used to implement field level redaction. For each input document, outputs either one or zero documents. */
  redact<I extends Document>(i: I): StageBuilder<S>;
  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  replaceRoot<I extends { newRoot: $Path<S> }>(i: I): StageBuilder<S>;
  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  replaceWith<I extends { newRoot: $Path<S> }>(i: I): StageBuilder<S>;
  /** Randomly selects the specified number of documents from its input. */
  sample<I extends { size: number }>(i: I): StageBuilder<S>;
  /** Performs a full-text search of the field or fields in an Atlas collection.
   * NOTE
   * $search is only available for MongoDB Atlas clusters, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  search<I extends Document>(i: I): StageBuilder<S>;
  /** Returns different types of metadata result documents for the Atlas Search query against an Atlas collection.
   * NOTE
   * $searchMeta is only available for MongoDB Atlas clusters running MongoDB v4.4.9 or higher, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  searchMeta<I extends Document>(i: I): StageBuilder<S>;
  /** Adds new fields to documents. Similar to $project, $set reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields stage. */
  set<I extends $Set<Document>>(i: I): StageBuilder<$SetResult<S, I>>;
  /** Groups documents into windows and applies one or more operators to the documents in each window.
  New in version 5.0. */
  setWindowFields<I extends Document>(i: I): StageBuilder<S>;
  /** Skips the first n documents where n is the specified skip number and passes the remaining documents unmodified to the pipeline. For each input document, outputs either zero documents (for the first n documents) or one document (if after the first n documents). */
  skip<I extends number>(i: I): StageBuilder<S>;
  /** Reorders the document stream by a specified sort key. Only the order changes; the documents remain unmodified. For each input document, outputs one document. */
  sort<I extends IndexSpecification>(i: I): StageBuilder<S>;
  /** Groups incoming documents based on the value of a specified expression, then computes the count of documents in each distinct group. */
  sortByCount<I extends IndexSpecification>(i: I): StageBuilder<S>;
  /** Performs a union of two collections; i.e. combines pipeline results from two collections into a single result set. */
  unionWith<I extends Document>(i: I): StageBuilder<S>;
  /** Removes/excludes fields from documents.
   * $unset is an alias for $project stage that removes fields. */
  unset<I extends string | string[]>(i: I): StageBuilder<Omit<S, I extends any[] ? I[number] : I>>;
  /** Deconstructs an array field from the input documents to output a document for each element. Each output document replaces the array with an element value. For each input document, outputs n documents where n is the number of array elements and can be zero for an empty array. */
  unwind<Path extends FieldArrayPath<S>, I extends `$${Path}`>(
    i: I,
  ): StageBuilder<{ [k in Path]: NonNullable<FieldArrayPathValue<S, Path>>[number] } & Omit<S, Path>>;
  /** Performs an ANN search on a vector in the specified field of an Atlas collection.
   * New in version 7.0.2. */
  vectorSearch<I extends Document>(i: I): StageBuilder<S>;
};
