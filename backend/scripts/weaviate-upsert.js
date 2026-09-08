#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');

const weaviateModule = require('weaviate-client');
const weaviate       = weaviateModule.default || weaviateModule;
const { generateUuid5, config } = weaviateModule;
const { ApiKey }      = weaviateModule;
const { getWeaviateClient } = require('../weaviateClient.js');
const { embedText, EMBEDDING_TASK_TYPES } = require('../services/embeddingService');
const {
  MONGO_URI,
  GOOGLE_AI_API_KEY,
  BATCH_SIZE = 50
} = process.env;

if (!MONGO_URI)          throw new Error('Missing MONGO_URI in .env');
if (!GOOGLE_AI_API_KEY)  throw new Error('Missing GOOGLE_AI_API_KEY in .env');

async function main() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ MongoDB connected');
  const Product = mongoose.model(
    'Product',
    new mongoose.Schema({
      name:        String,
      description: String,
      price:       Number,
      category:    String,
      image:       String,
      brand:       String,
      stock:       Number,
      rating:      Number,
      numReviews:  Number,
      createdAt:   Date,
    })
  );

  const client     = await getWeaviateClient();
  const collection = client.collections.get('Product');

  const existing = await client.collections.listAll();
  if (!existing.some(c => c.name === 'Product')) {
    console.log('⚙️  Creating `Product` class');
    await client.collections.create({
      name: 'Product',
      vectorizerConfig: config.vectorizer.none(),
      properties: [
        { name: 'name',        dataType: [config.dataType.TEXT]   },
        { name: 'description', dataType: [config.dataType.TEXT]   },
        { name: 'price',       dataType: [config.dataType.NUMBER] },
        { name: 'category',    dataType: [config.dataType.TEXT]   },
        { name: 'image',       dataType: [config.dataType.TEXT]   },
        { name: 'brand',       dataType: [config.dataType.TEXT]   },
        { name: 'stock',       dataType: [config.dataType.NUMBER] },
        { name: 'rating',      dataType: [config.dataType.NUMBER] },
        { name: 'numReviews',  dataType: [config.dataType.NUMBER] },
        { name: 'createdAt',   dataType: [config.dataType.DATE]   },
      ],
    });
    console.log('✅ `Product` class created');
  } else {
    console.log('✅ `Product` class already exists');
  }

  const products = await Product.find().lean();
  const total    = products.length;
  console.log(`🔎 Found ${total} products to upsert`);

  const dataObjects = [];
  let done = 0;
  for (const doc of products) {
    const text = `${doc.name}: ${doc.description}`;
    let embedding;
    try {
      embedding = await embedText(text, {
        taskType: EMBEDDING_TASK_TYPES.RETRIEVAL_DOCUMENT,
        title: doc.name,
      });
    } catch (e) {
      console.warn(`⚠️ Embedding failed for ${doc._id}`, e);
      continue;
    }

    dataObjects.push({
      uuid: generateUuid5('Product', doc._id.toString()),
      properties: {
        name:        doc.name,
        description: doc.description,
        price:       doc.price,
        category:    doc.category,
        image:       doc.image,
        brand:       doc.brand,
        stock:       doc.stock,
        rating:      doc.rating,
        numReviews:  doc.numReviews,
        createdAt:   doc.createdAt.toISOString(),
      },
      vector: embedding,
    });

    done++;
    console.log(`🔧 Embedded ${done}/${total}`);
  }

  for (let i = 0; i < dataObjects.length; i += Number(BATCH_SIZE)) {
    const chunk = dataObjects.slice(i, i + Number(BATCH_SIZE));
    await collection.data.insertMany(chunk);
    console.log(`✅ Upserted batch ${i / BATCH_SIZE + 1} (${chunk.length} items)`);
  }

  console.log('🎉 All products upserted');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
