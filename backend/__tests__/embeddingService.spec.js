const mockEmbedContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      embedContent: mockEmbedContent,
    })),
  })),
}));

const {
  EMBEDDING_DIMENSION,
  EMBEDDING_TASK_TYPES,
  buildEmbedRequest,
  embedText,
} = require('../services/embeddingService');

describe('embeddingService', () => {
  beforeAll(() => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
  });

  beforeEach(() => {
    mockEmbedContent.mockReset();
  });

  it('builds embed requests with an explicit 768-dimensional output', () => {
    expect(
      buildEmbedRequest('Find similar products', {
        taskType: EMBEDDING_TASK_TYPES.RETRIEVAL_QUERY,
      })
    ).toEqual({
      content: {
        role: 'user',
        parts: [{ text: 'Find similar products' }],
      },
      outputDimensionality: EMBEDDING_DIMENSION,
      taskType: EMBEDDING_TASK_TYPES.RETRIEVAL_QUERY,
    });
  });

  it('normalizes returned 768-dimensional embeddings', async () => {
    const values = new Array(EMBEDDING_DIMENSION).fill(0);
    values[0] = 3;
    values[1] = 4;
    mockEmbedContent.mockResolvedValue({ embedding: { values } });

    const embedding = await embedText('Laptop sleeve', {
      taskType: EMBEDDING_TASK_TYPES.RETRIEVAL_DOCUMENT,
      title: 'Laptop sleeve',
    });

    expect(mockEmbedContent).toHaveBeenCalledWith({
      content: {
        role: 'user',
        parts: [{ text: 'Laptop sleeve' }],
      },
      outputDimensionality: EMBEDDING_DIMENSION,
      taskType: EMBEDDING_TASK_TYPES.RETRIEVAL_DOCUMENT,
      title: 'Laptop sleeve',
    });
    expect(embedding).toHaveLength(EMBEDDING_DIMENSION);
    expect(embedding[0]).toBeCloseTo(0.6, 6);
    expect(embedding[1]).toBeCloseTo(0.8, 6);
  });

  it('throws when Gemini returns the wrong embedding size', async () => {
    mockEmbedContent.mockResolvedValue({
      embedding: { values: new Array(32).fill(1) },
    });

    await expect(embedText('Phone case')).rejects.toThrow(
      `Gemini embedding length mismatch: expected ${EMBEDDING_DIMENSION}, received 32`
    );
  });
});
