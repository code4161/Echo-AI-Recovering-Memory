const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every id in the schema is a uuid, so a value that is not one cannot match a
 * row. Checking the shape first turns "unknown id" into a clean 404 instead of
 * letting Postgres raise `invalid input syntax for type uuid`, which would
 * surface as a 500 and give the client nothing to recover from.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
