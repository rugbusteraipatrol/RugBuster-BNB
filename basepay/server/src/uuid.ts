const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session ids are uuid columns; a malformed id must read as 404, not a 500. */
export const isUuid = (value: string): boolean => UUID.test(value);
