require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const EMBEDDING_MODEL = 'models/gemini-embedding-001';
const EMBEDDING_DIMENSION = 768;

const EMBEDDING_TASK_TYPES = Object.freeze({
  RETRIEVAL_DOCUMENT: 'RETRIEVAL_DOCUMENT',
  RETRIEVAL_QUERY: 'RETRIEVAL_QUERY',
});

let embedModel;

const getEmbeddingModel = () => {
  if (embedModel) return embedModel;

  const { GOOGLE_AI_API_KEY } = process.env;
  if (!GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY must be set to build Gemini embeddings');
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY);
  embedModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  return embedModel;
};

const normalizeVector = values => {
  const magnitude = Math.hypot(...values);
  if (!magnitude) return values;
  return values.map(value => value / magnitude);
};

const buildEmbedRequest = (text, { taskType, title } = {}) => {
  const request = {
    content: {
      role: 'user',
      parts: [{ text }],
    },
    outputDimensionality: EMBEDDING_DIMENSION,
  };

  if (taskType) {
    request.taskType = taskType;
  }

  if (title) {
    request.title = title;
  }

  return request;
};

const embedText = async (text, options = {}) => {
  const trimmedText = text?.trim();
  if (!trimmedText) return null;

  const response = await getEmbeddingModel().embedContent(
    buildEmbedRequest(trimmedText, options)
  );
  const values = response?.embedding?.values;

  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Gemini embedding length mismatch: expected ${EMBEDDING_DIMENSION}, received ${values?.length || 0}`
    );
  }

  return normalizeVector(values);
};

module.exports = {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
  EMBEDDING_TASK_TYPES,
  buildEmbedRequest,
  normalizeVector,
  embedText,
};
