export function withNoStore<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
) {
  return async (...args: TArgs) => {
    const response = await handler(...args);
    response.headers.set("cache-control", "no-store");
    return response;
  };
}
