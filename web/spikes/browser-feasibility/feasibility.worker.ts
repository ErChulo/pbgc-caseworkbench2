/// <reference lib="webworker" />

self.addEventListener("message", (event: MessageEvent<string>) => {
  self.postMessage({
    echoed: event.data,
    workerLocation: self.location.protocol,
  });
});

export {};
