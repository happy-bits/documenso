import fs from 'node:fs';
import path from 'node:path';

const seedDatabase = async () => {
  // Sorted explicitly rather than relying on the platform's readdir order,
  // since the seed modules are order-dependent.
  const files = fs.readdirSync(path.join(__dirname, './seed')).sort();

  for (const file of files) {
    const stat = fs.statSync(path.join(__dirname, './seed', file));

    if (stat.isFile()) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(path.join(__dirname, './seed', file));

      if ('seedDatabase' in mod && typeof mod.seedDatabase === 'function') {
        console.log(`[SEEDING]: ${file}`);

        // Deliberately not caught. A partially seeded database is not a valid
        // starting state for anything downstream — especially e2e tests, where
        // the seed *is* the fixture — so fail loudly here rather than let the
        // run continue against unknown data.
        await mod.seedDatabase();
      }
    }
  }
};

seedDatabase()
  .then(() => {
    console.log('Database seeded');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[SEEDING]: Failed');
    console.error(error);
    process.exit(1);
  });
