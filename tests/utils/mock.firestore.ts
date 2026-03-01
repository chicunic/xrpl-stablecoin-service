const mockFirebaseConfig = vi.hoisted(() => ({
  initializeFirebase: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock("../../src/common/config/firebase", () => ({
  initializeFirebase: mockFirebaseConfig.initializeFirebase,
  getFirestore: mockFirebaseConfig.getFirestore,
}));

export const mockFirestoreService = {
  doc: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  runTransaction: vi.fn(),
  setup: () => {
    mockFirebaseConfig.initializeFirebase.mockImplementation(() => {
      // no-op in tests
    });

    mockFirebaseConfig.getFirestore.mockReturnValue({
      collection: mockFirestoreService.collection,
      collectionGroup: mockFirestoreService.collectionGroup,
      runTransaction: mockFirestoreService.runTransaction,
    });

    mockFirestoreService.collection.mockReturnValue({
      doc: mockFirestoreService.doc,
      where: mockFirestoreService.where,
    });

    mockFirestoreService.collectionGroup.mockReturnValue({
      where: mockFirestoreService.where,
    });

    mockFirestoreService.doc.mockReturnValue({
      get: mockFirestoreService.get,
      set: mockFirestoreService.set,
      update: mockFirestoreService.update,
      collection: mockFirestoreService.collection,
    });

    // Chain for where().orderBy().limit().get()
    mockFirestoreService.where.mockReturnValue({
      where: mockFirestoreService.where,
      orderBy: mockFirestoreService.orderBy,
      limit: mockFirestoreService.limit,
      get: mockFirestoreService.get,
    });

    mockFirestoreService.orderBy.mockReturnValue({
      orderBy: mockFirestoreService.orderBy,
      limit: mockFirestoreService.limit,
      get: mockFirestoreService.get,
    });

    mockFirestoreService.limit.mockReturnValue({
      get: mockFirestoreService.get,
    });

    // Default behaviors
    mockFirestoreService.get.mockResolvedValue({
      exists: false,
      data: () => ({}),
      empty: true,
      docs: [],
    });

    mockFirestoreService.set.mockResolvedValue(undefined);
    mockFirestoreService.update.mockResolvedValue(undefined);
    mockFirestoreService.runTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        get: mockFirestoreService.get,
        set: vi.fn(),
        update: vi.fn(),
      };
      return fn(tx);
    });
  },
  reset: () => {
    mockFirebaseConfig.initializeFirebase.mockReset();
    mockFirebaseConfig.getFirestore.mockReset();
    mockFirestoreService.collection.mockReset();
    mockFirestoreService.collectionGroup.mockReset();
    mockFirestoreService.doc.mockReset();
    mockFirestoreService.get.mockReset();
    mockFirestoreService.set.mockReset();
    mockFirestoreService.update.mockReset();
    mockFirestoreService.where.mockReset();
    mockFirestoreService.orderBy.mockReset();
    mockFirestoreService.limit.mockReset();
    mockFirestoreService.runTransaction.mockReset();
  },
};
