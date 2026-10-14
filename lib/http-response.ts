/** Read a JSON API response without exposing browser JSON parser errors. */
// Response.json() also returns any; callers can supply their payload type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonResponse<T = any>(response: Response): Promise<T> {
  const invalidResponse = () => {
    if (response.status === 401 || response.redirected)
      return new Error("Your session may have expired. Refresh the page and sign in again.");
    if (response.status === 403)
      return new Error("You do not have permission to perform this action.");
    if (!response.ok)
      return new Error(`The request failed (HTTP ${response.status}). Please try again.`);
    return new Error("The server returned an empty or invalid response. Refresh the page and check whether your changes were saved.");
  };

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("The server response was interrupted. Refresh the page and check whether your changes were saved.");
  }
  try {
    const data: unknown = JSON.parse(text);
    if (data === null) throw invalidResponse();
    // Keep valid error payloads available to callers for action-specific errors.
    return data as T;
  } catch {
    throw invalidResponse();
  }
}
