export function createJestMock() {
  return jest.fn();
}

export function createSimpleModuleMock(modulePath: string, mockImplementations: Record<string, any>) {
  return jest.mock(modulePath, () => mockImplementations);
}
