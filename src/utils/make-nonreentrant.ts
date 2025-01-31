export function makeNonReentrant<T>(func: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return function () {
    if (!promise) {
      promise = func().finally(() => {
        promise = null;
      });
    }
    return promise;
  };
}
