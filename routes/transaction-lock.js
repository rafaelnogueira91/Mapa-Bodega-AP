"use strict";
// Cola compartida por conexión sqlite3. Evita BEGIN anidados entre módulos
// que utilizan la misma instancia de db.
const queues = new WeakMap();
module.exports = function withTransaction(db, work) {
  const run = sql => new Promise((resolve, reject) =>
    db.run(sql, err => err ? reject(err) : resolve()));
  const prior = queues.get(db) || Promise.resolve();
  const task = prior.catch(() => {}).then(async () => {
    await run('BEGIN IMMEDIATE');
    try {
      const value = await work();
      await run('COMMIT');
      return value;
    } catch (err) {
      try { await run('ROLLBACK'); } catch (_) {}
      throw err;
    }
  });
  queues.set(db, task.catch(() => {}));
  return task;
};
