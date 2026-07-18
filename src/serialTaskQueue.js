export function createSerialTaskQueue() {
  let chain = Promise.resolve();
  return {
    run(task) {
      const operation = chain.catch(() => undefined).then(task);
      chain = operation;
      return operation;
    },
    wait() {
      return chain.catch(() => undefined);
    },
  };
}
