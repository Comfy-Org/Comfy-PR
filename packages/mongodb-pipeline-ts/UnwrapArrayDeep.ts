import { type Document } from "mongodb";

// export type UnwrapArrayValue<V> = NonNullable<V> extends any[] ? NonNullable<V>[number] : V;
export type UnwrapArrayDeep<TSchema extends Document> = {
  [P in keyof TSchema]: TSchema[P] extends ReadonlyArray<infer U>
    ? U extends Document
      ? UnwrapArrayDeep<U>
      : U
    : UnwrapArrayDeep<TSchema[P]>;
};
