interface DatabaseErrorLike {
  code?: unknown;
}

export function isDuplicateEntryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return (error as DatabaseErrorLike).code === 'ER_DUP_ENTRY';
}
