/**
 * `Response.json()` is typed `unknown`, which is right for production code and
 * noise in a test that is asserting on a known shape. Tests read the body
 * through this helper instead of casting at every call site.
 */
export async function json<T = Record<string, any>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
