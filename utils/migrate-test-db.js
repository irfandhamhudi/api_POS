import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function migrate() {
  const activeUri = process.env.MONGO_URI;
  if (!activeUri) {
    console.error('MONGO_URI is not defined in .env');
    process.exit(1);
  }

  let sourceUri, targetUri;
  if (activeUri.includes('/POSDb_testing')) {
    targetUri = activeUri;
    sourceUri = activeUri.replace('/POSDb_testing', '/POSDb');
  } else if (activeUri.includes('/POSDb')) {
    sourceUri = activeUri;
    targetUri = activeUri.replace('/POSDb', '/POSDb_testing');
  } else {
    console.error('Active MONGO_URI does not contain /POSDb or /POSDb_testing. Cannot determine source and target.');
    process.exit(1);
  }

  console.log(`Source DB: ${sourceUri.replace(/:([^:@]+)@/, ':****@')}`);
  console.log(`Target DB: ${targetUri.replace(/:([^:@]+)@/, ':****@')}`);

  console.log('\nConnecting to Source Database...');
  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  console.log('Connected to Source Database.');

  console.log('Connecting to Target Database...');
  const targetConn = await mongoose.createConnection(targetUri).asPromise();
  console.log('Connected to Target Database.');

  const sourceDb = sourceConn.db;
  const targetDb = targetConn.db;

  const collections = await sourceDb.listCollections().toArray();
  console.log(`\nFound ${collections.length} collections in source database.`);

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith('system.')) continue; // skip system collections

    console.log(`Migrating collection: "${colName}"...`);
    const sourceCol = sourceDb.collection(colName);
    const targetCol = targetDb.collection(colName);

    // Clear existing data in target collection to start fresh
    console.log(`  Clearing target collection "${colName}"...`);
    await targetCol.deleteMany({});

    // Read all documents from source
    const documents = await sourceCol.find({}).toArray();
    if (documents.length > 0) {
      console.log(`  Copying ${documents.length} documents into "${colName}"...`);
      await targetCol.insertMany(documents);
    } else {
      console.log(`  Collection "${colName}" is empty, skipping copy.`);
    }
  }

  console.log('\nMigration completed successfully!');
  await sourceConn.close();
  await targetConn.close();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
