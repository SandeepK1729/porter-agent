
interface StorageActions<T> {
  size(): number;
  hasData(): boolean;

  has(key: string): boolean;
  get(key: string): T | undefined;
  getValues(): T[];

  set(key: string, value: T): void;

  delete(key: string): void;
  clear(): void;
}

class Storage <T> implements StorageActions<T> {
  private store: Map<string, T>;

  constructor() {
    this.store = new Map<string, T>();
  }

  size = (): number => {
    return this.store.size;
  };

  hasData = (): boolean => {
    return this.store.size > 0;
  };

  has = (key: string): boolean => {
    return this.store.has(key);
  };

  get = (key: string): T | undefined => {
    return this.store.get(key);
  };

  getValues = (): T[] => {
    return Array.from(this.store.values());
  }

  set = (key: string, value: T): void => {
    this.store.set(key, value);
  };

  delete = (key: string): void => {
    this.store.delete(key);
  };

  clear = (): void => {
    this.store.clear();
  };
}

export default Storage;
