

// TODO: external type? This isn't fully correctly the right type.
interface HttpError {
  code: number,
  body: string,
}

export function request(path: string, method: string, successCallback: (item: string) => void, failureCallback: (err: HttpError) => void): () => void {
  const abort = new AbortController();

  void doAsyncRequest(abort, path, method, successCallback, failureCallback);

  return () => {
    abort.abort();
  }
}

async function doAsyncRequest(abort: AbortController, path: string, method: string, successCallback: (item: string) => void, failureCallback: (err: HttpError) => void): Promise<void> {
  try {
    const res = await fetch(path, {
      method,
      signal: abort.signal
    });

    if (res.ok) {
      const body = await res.text();

      successCallback(body);
    } else {
      failureCallback({
        code: res.status,
        body: await res.text(),
      });
    }
  } catch (e) {
    // TODO: better error handling
    failureCallback({
      code: 500,
      body: '',
    });
  }
}
