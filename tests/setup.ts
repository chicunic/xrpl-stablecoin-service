const originalConsoleError = console.error;

beforeAll(() => {
  console.error = jest.fn((message: any, ...args: any[]) => {
    const errorMessage = typeof message === "string" ? message : String(message);
    const errorObj = args.length > 0 ? String(args[0]) : "";
    const fullMessage = `${errorMessage} ${errorObj}`;

    const expectedErrors = ["Error expected in test:", "Error in"];

    const isExpectedError = expectedErrors.some((pattern) => fullMessage.includes(pattern));

    if (!isExpectedError) {
      originalConsoleError(message, ...args);
    }
  });
});

afterAll(() => {
  console.error = originalConsoleError;
});

export {};
