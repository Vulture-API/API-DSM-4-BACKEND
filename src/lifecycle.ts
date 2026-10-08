/** Uma única promessa impede fechamento duplicado ao receber SIGINT e SIGTERM. */
export function createShutdown(
  app: { close(): Promise<void> },
  database: { end(): Promise<void> },
) {
  let shuttingDown: Promise<void> | undefined;
  return () => {
    shuttingDown ??= (async () => {
      try {
        // onClose espera o motor depois de drenar as requisições HTTP.
        await app.close();
      } finally {
        await database.end();
      }
    })();
    return shuttingDown;
  };
}
