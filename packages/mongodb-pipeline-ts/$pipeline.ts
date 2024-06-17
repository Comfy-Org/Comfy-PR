import { Collection, FindCursor, type Document, type Filter, type IndexSpecification } from "mongodb";
import type { FieldArrayPath, FieldArrayPathValue, FieldPath, FieldPathValue } from "react-hook-form";
export declare type NODOT<T extends string = string> = T extends `${infer K}.${infer _}` ? never : T;
export declare type TypedPath<TSchema extends Document, Type> =
  Type extends NonNullable<FieldPathValue<TSchema, infer Path>> ? Path : never;
export declare type $Path<
  TSchema extends Document,
  Path extends string & FieldPath<TSchema> = FieldPath<TSchema>,
> = `$${Path}`;
export type UnwrapArrayValue<V> = NonNullable<V> extends any[] ? NonNullable<V>[number] : V;
export type UnwrapArrayDeep<TSchema extends Document> = {
  [P in keyof TSchema]: TSchema[P] extends ReadonlyArray<infer U>
    ? U extends Document
      ? UnwrapArrayDeep<U>
      : U
    : UnwrapArrayDeep<TSchema[P]>;
};
export type Expression<TSchema extends Document> = $Path<TSchema> & any;
export type $Set<TSchema extends Document> = {
  [P in keyof TSchema]?: Expression<TSchema>;
} & Record<string, any>;
export type $SetResult<TSchema extends Document, Set extends $Set<TSchema>> = TSchema & {
  [P in keyof Set]?: Set[P] extends `$${infer Path extends string}`
    ? Path extends FieldPath<TSchema>
      ? FieldPathValue<TSchema, Path>
      : any
    : Set[P];
};
export type $Project<TSchema extends Document> = { _id?: 1 | 0 } & {
  [P in FieldPath<TSchema>]?: 1 | 0 | Expression<TSchema>;
} & Record<string, Expression<TSchema>>;
export type $ProjectResult<TSchema extends Document, Project extends $Project<TSchema>> = {
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

type CollectionPipelineStages<TSchema extends Document = Document> = {
  /** Adds new fields to documents. Similar to $project, $addFields reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields. */
  $addFields: $Set<TSchema>;
  /** Categorizes incoming documents into groups, called buckets, based on a specified expression and bucket boundaries. */
  $bucket: Document;
  /** Categorizes incoming documents into a specific number of groups, called buckets, based on a specified expression. Bucket boundaries are automatically determined in an attempt to evenly distribute the documents into the specified number of buckets. */
  $bucketAuto: Document;
  /** Returns a Change Stream cursor for the collection. This stage can only occur once in an aggregation pipeline and it must occur as the first stage. */
  $changeStream: Document;
  /** Splits large change stream events that exceed 16 MB into smaller fragments returned in a change stream cursor.
   * You can only use $changeStreamSplitLargeEvent in a $changeStream pipeline and it must be the final stage in the pipeline. */
  $changeStreamSplitLargeEvent: Document;
  /** Returns statistics regarding a collection or view. */
  $collStats: Document;
  /** Returns a count of the number of documents at this stage of the aggregation pipeline.
   * Distinct from the $count aggregation accumulator. */
  $count: string;
  /** Creates new documents in a sequence of documents where certain values in a field are missing. */
  $densify: Document;
  /** Returns literal documents from input expressions. */
  $documents: Document;
  /** Processes multiple aggregation pipelines within a single stage on the same set of input documents. Enables the creation of multi-faceted aggregations capable of characterizing data across multiple dimensions, or facets, in a single stage. */
  $facet: Document;
  /** Populates null and missing field values within documents. */
  $fill: Document;
  /** Returns an ordered stream of documents based on the proximity to a geospatial point. Incorporates the functionality of $match, $sort, and $limit for geospatial data. The output documents include an additional distance field and can include a location identifier field. */
  $geoNear: Document;
  /** Performs a recursive search on a collection. To each output document, adds a new array field that contains the traversal results of the recursive search for that document. */
  $graphLookup: Document;
  /** Groups input documents by a specified identifier expression and applies the accumulator expression(s), if specified, to each group. Consumes all input documents and outputs one document per each distinct group. The output documents only contain the identifier field and, if specified, accumulated fields. */
  $group: Document;
  /** Returns statistics regarding the use of each index for the collection. */
  $indexStats: Document;
  /** Passes the first n documents unmodified to the pipeline where n is the specified limit. For each input document, outputs either one document (for the first n documents) or zero documents (after the first n documents). */
  $limit: number;
  /** Lists sampled queries for all collections or a specific collection. */
  $listSampledQueries: Document;
  /** Returns information about existing Atlas Search indexes on a specified collection. */
  $listSearchIndexes: Document;
  /** Lists all sessions that have been active long enough to propagate to the system.sessions collection. */
  $listSessions: Document;
  /** Performs a left outer join to another collection in the same database to filter in documents from the "joined" collection for processing. */
  $lookup: Document;
  /** Filters the document stream to allow only matching documents to pass unmodified into the next pipeline stage. $match uses standard MongoDB queries. For each input document, outputs either one document (a match) or zero documents (no match). */
  $match: Filter<TSchema>;
  /** Writes the resulting documents of the aggregation pipeline to a collection. The stage can incorporate (insert new documents, merge documents, replace documents, keep existing documents, fail the operation, process documents with a custom update pipeline) the results into an output collection. To use the $merge stage, it must be the last stage in the pipeline. */
  $merge: string;
  /** Writes the resulting documents of the aggregation pipeline to a collection. To use the $out stage, it must be the last stage in the pipeline. */
  $out: string;
  /** Returns plan cache information for a collection. */
  $planCacheStats: Document;

  /** Reshapes each document in the stream, such as by adding new fields or removing existing fields. For each input document, outputs one document.
   * See also $unset for removing existing fields. */
  $project: $Project<TSchema>;

  /** Reshapes each document in the stream by restricting the content for each document based on information stored in the documents themselves. Incorporates the functionality of $project and $match. Can be used to implement field level redaction. For each input document, outputs either one or zero documents. */
  $redact: Document;
  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  $replaceRoot: { newRoot: $Path<TSchema> };

  /** Replaces a document with the specified embedded document. The operation replaces all existing fields in the input document, including the _id field. Specify a document embedded in the input document to promote the embedded document to the top level.
   * $replaceWith is an alias for $replaceRoot stage. */
  $replaceWith: { newRoot: $Path<TSchema> };

  /** Randomly selects the specified number of documents from its input. */
  $sample: number;
  /** Performs a full-text search of the field or fields in an Atlas collection.
   * NOTE
   * $search is only available for MongoDB Atlas clusters, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  $search: Document;

  /** Returns different types of metadata result documents for the Atlas Search query against an Atlas collection.
   * NOTE
   * $searchMeta is only available for MongoDB Atlas clusters running MongoDB v4.4.9 or higher, and is not available for self-managed deployments. To learn more, see Atlas Search Aggregation Pipeline Stages. */
  $searchMeta: Document;

  /** Adds new fields to documents. Similar to $project, $set reshapes each document in the stream; specifically, by adding new fields to output documents that contain both the existing fields from the input documents and the newly added fields.
   * $set is an alias for $addFields stage. */
  $set: $Set<Document>;

  /** Groups documents into windows and applies one or more operators to the documents in each window.
  New in version 5.0. */
  $setWindowFields: Document;
  /** Skips the first n documents where n is the specified skip number and passes the remaining documents unmodified to the pipeline. For each input document, outputs either zero documents (for the first n documents) or one document (if after the first n documents). */
  $skip: number;
  /** Reorders the document stream by a specified sort key. Only the order changes; the documents remain unmodified. For each input document, outputs one document. */
  $sort: IndexSpecification;
  /** Groups incoming documents based on the value of a specified expression, then computes the count of documents in each distinct group. */
  $sortByCount: IndexSpecification;
  /** Performs a union of two collections; i.e. combines pipeline results from two collections into a single result set. */
  $unionWith: Document;
  /** Removes/excludes fields from documents.
   * $unset is an alias for $project stage that removes fields. */
  $unset: IndexSpecification;
  /** Deconstructs an array field from the input documents to output a document for each element. Each output document replaces the array with an element value. For each input document, outputs n documents where n is the number of array elements and can be zero for an empty array. */
  $unwind: $Path<TSchema>;
  /** Performs an ANN search on a vector in the specified field of an Atlas collection.
   * New in version 7.0.2. */
  $vectorSearch: Document;
};
export type CollectionPipelineStagesResult<
  TSchema extends Document,
  $ extends Partial<CollectionPipelineStages<TSchema>>,
  K extends keyof $ = keyof $,
> = {
  $addFields: $[K] extends NonNullable<$["$addFields"]> ? TSchema & $[K] : never;
  $bucket: $[K] extends NonNullable<$["$bucket"]> ? TSchema : never;
  $bucketAuto: $[K] extends NonNullable<$["$bucketAuto"]> ? TSchema : never;
  $changeStream: $[K] extends NonNullable<$["$changeStream"]> ? TSchema : never;
  $changeStreamSplitLargeEvent: $[K] extends NonNullable<$["$changeStreamSplitLargeEvent"]> ? TSchema : never;
  $collStats: $[K] extends NonNullable<$["$collStats"]> ? TSchema : never;
  $count: $[K] extends NonNullable<$["$count"]> ? Record<$[K], number> : never;
  $densify: $[K] extends NonNullable<$["$densify"]> ? TSchema : never;
  $documents: $[K] extends NonNullable<$["$documents"]> ? TSchema : never;
  $facet: $[K] extends NonNullable<$["$facet"]> ? TSchema : never;
  $fill: $[K] extends NonNullable<$["$fill"]> ? TSchema : never;
  $geoNear: $[K] extends NonNullable<$["$geoNear"]> ? TSchema : never;
  $graphLookup: $[K] extends NonNullable<$["$graphLookup"]> ? TSchema : never;
  $group: $[K] extends NonNullable<$["$group"]> ? any : never;
  $indexStats: $[K] extends NonNullable<$["$indexStats"]> ? TSchema : never;
  $limit: $[K] extends NonNullable<$["$limit"]> ? TSchema : never;
  $listSampledQueries: $[K] extends NonNullable<$["$listSampledQueries"]> ? TSchema : never;
  $listSearchIndexes: $[K] extends NonNullable<$["$listSearchIndexes"]> ? TSchema : never;
  $listSessions: $[K] extends NonNullable<$["$listSessions"]> ? TSchema : never;
  $lookup: $[K] extends NonNullable<$["$lookup"]> ? TSchema : never;
  $match: $[K] extends NonNullable<$["$match"]> ? TSchema : never;
  $merge: $[K] extends NonNullable<$["$merge"]> ? TSchema : never;
  $out: $[K] extends NonNullable<$["$out"]> ? TSchema : never;
  $planCacheStats: $[K] extends NonNullable<$["$planCacheStats"]> ? TSchema : never;
  $project: $[K] extends NonNullable<$["$project"]> ? $ProjectResult<TSchema, $[K]> : never;
  $redact: $[K] extends NonNullable<$["$redact"]> ? TSchema : never;
  $replaceRoot: $[K] extends NonNullable<$["$replaceRoot"]> ? TSchema : never;
  $replaceWith: $[K] extends NonNullable<$["$replaceWith"]> ? TSchema : never;
  $sample: $[K] extends NonNullable<$["$sample"]> ? TSchema : never;
  $search: $[K] extends NonNullable<$["$search"]> ? TSchema : never;
  $searchMeta: $[K] extends NonNullable<$["$searchMeta"]> ? TSchema : never;
  $set: $[K] extends NonNullable<$["$set"]> ? TSchema : never;
  $setWindowFields: $[K] extends NonNullable<$["$setWindowFields"]> ? TSchema : never;
  $skip: $[K] extends NonNullable<$["$skip"]> ? TSchema : never;
  $sort: $[K] extends NonNullable<$["$sort"]> ? TSchema : never;
  $sortByCount: $[K] extends NonNullable<$["$sortByCount"]> ? TSchema : never;
  $unionWith: $[K] extends NonNullable<$["$unionWith"]> ? TSchema : never;
  $unset: $[K] extends NonNullable<$["$unset"]> ? TSchema : never;
  $unwind: $[K] extends NonNullable<$["$unwind"]>
    ? $UnwindResult<TSchema, $[K] extends FieldArrayPath<TSchema> ? $[K] : never>
    : never;
  $vectorSearch: $[K] extends NonNullable<$["$vectorSearch"]> ? TSchema : never;
  [key: string]: TSchema | any;
};

export type $UnwindResult<TSchema extends Document, Path extends FieldArrayPath<TSchema>> = {
  [k in Path]: NonNullable<FieldArrayPathValue<TSchema, Path>>[number];
} & Omit<TSchema, Path extends `${infer Head}.${string}` ? Head : Path extends string ? Path : never>;
export type $Pipeline<TSchema extends Document> = ReturnType<typeof $pipeline<TSchema>>;
export function $pipeline<TSchema extends Document>(coll?: Collection<TSchema>, pipeline = [] as readonly Document[]) {
  const _coll = coll as any;
  return {
    aggregate() {
      if (!coll) throw new Error("Collection not provided");
      return coll.aggregate([...pipeline]) as unknown as FindCursor<TSchema>;
    },
    satisfies<RSchema extends TSchema = TSchema>() {
      return $pipeline<RSchema>(_coll, pipeline);
    },
    as<RSchema extends Document = TSchema>() {
      return $pipeline<RSchema>(_coll, pipeline);
    },
    stage<
      Stage extends Partial<CollectionPipelineStages<TSchema>>,
      RSchema extends CollectionPipelineStagesResult<TSchema, Stage>,
    >(stage: Stage) {
      if (!stage || !Object.keys(stage).length) return $pipeline<RSchema>(_coll, pipeline);
      return $pipeline<RSchema>(_coll, [...pipeline, stage]);
    },
    _peek(fn = <T>(e: Readonly<T>): T => e) {
      return $pipeline<TSchema>(_coll, fn(pipeline));
    },
    project<P extends $Project<TSchema>>($project: P) {
      return $pipeline<$ProjectResult<TSchema, P>>(_coll, [...pipeline, { $project }]);
    },
    set<T extends $Set<TSchema>>($set: T) {
      return $pipeline<$SetResult<TSchema, T>>(_coll, [...pipeline, { $set }]);
    },
    match(filter: Filter<TSchema>) {
      return $pipeline<TSchema>(_coll, [...pipeline, { $match: filter }]);
    },
    unwind<Path extends FieldArrayPath<TSchema>>($unwind: `$${Path}`) {
      return $pipeline<$UnwindResult<TSchema, Path>>(_coll, [...pipeline, { $unwind }]);
    },
    replaceRoot<Path extends FieldPath<TSchema>>(opt: { newRoot: `$${Path}` }) {
      type Replaced = NonNullable<FieldPathValue<TSchema, Path> | TSchema[Path]>;
      return $pipeline<Replaced>(_coll, [...pipeline, { $replaceRoot: opt }]);
    },
  };
}
