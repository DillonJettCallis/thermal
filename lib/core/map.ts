import { equals, hashCode } from '../../runtime/reflect.js';

type Entry<Key, Value> = { hash: number, key: Key, value: Value };
type Bucket<Key, Value> = undefined | Entry<Key, Value> | Array<Entry<Key, Value>>;

export class HashMap<Key, Value> {
  readonly size: number;
  readonly buckets: Array<Bucket<Key, Value>>;

  constructor(buckets: Array<Bucket<Key, Value>>, size: number) {
    this.buckets = buckets;
    this.size = size;
  }
}

export function empty(): HashMap<never, never> {
  return new HashMap<never, never>(new Array(3), 0);
}

export function from<Key, Value>(pairs: Iterable<readonly [Key, Value]>): HashMap<Key, Value> {
  let bucketsCopy = new Array<Bucket<Key, Value>>(3);
  let size = 0;

  for (const [key, value] of pairs) {
    const hash = hashCode(key);
    const newEntry = {hash, key, value};
    const bucketIndex = hash % bucketsCopy.length;

    const bucket = bucketsCopy[bucketIndex];

    if (bucket === undefined) {
      // item not found, replace no bucket with bucket of one
      bucketsCopy[bucketIndex] = newEntry;
      size++;
    } else if (bucket instanceof Array) {
      const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

      if (entryIndex === -1) {
        // item not found, add new entry to this bucket
        if (size + 1 > bucketsCopy.length / 4) {
          // if there are an average of more than 4 items per bucket, increase the number of buckets
          const oldBuckets = bucketsCopy;
          bucketsCopy = new Array(bucketsCopy.length * 2);

          for (const bucket of oldBuckets) {
            if (bucket === undefined) {
              // do nothing
            } else if (bucket instanceof Array) {
              for (const entry of bucket) {
                const index = entry.hash % bucketsCopy.length;
                const existing = bucketsCopy[index];

                if (existing === undefined) {
                  bucketsCopy[index] = entry;
                } else if (existing instanceof Array) {
                  existing.push(entry);
                } else {
                  bucketsCopy[index] = [existing, entry];
                }
              }
            } else {
              const index = bucket.hash % bucketsCopy.length;
              const existing = bucketsCopy[index];

              if (existing === undefined) {
                bucketsCopy[index] = bucket;
              } else if (existing instanceof Array) {
                existing.push(bucket);
              } else {
                bucketsCopy[index] = [existing, bucket];
              }
            }
          }

          size++;
        } else {
          // fit within the same number of buckets
          const bucketCopy = bucket.slice();
          bucketCopy.push(newEntry);
          bucketsCopy[bucketIndex] = bucketCopy;

          size++;
        }
      } else {
        // item found, replace it in this bucket
        const bucketCopy = bucket.slice();
        bucketCopy[entryIndex] = newEntry;
        bucketsCopy[bucketIndex] = bucketCopy;
      }
    } else {
      if (bucket.hash === hash && equals(bucket.key, key)) {
        // item found, replace it in place
        bucketsCopy[bucketIndex] = newEntry;
      } else {
        // item not found, turn this single item into an array of two items
        bucketsCopy[bucketIndex] = [bucket, newEntry];

        size++;
      }
    }
  }

  return new HashMap(bucketsCopy, size);
}

export function has<Key, Value>(self: HashMap<Key, Value>, key: Key): boolean {
  const hash = hashCode(key);

  const bucket = self.buckets[hash % self.buckets.length];

  if (bucket === undefined) {
    return false;
  } else if (bucket instanceof Array) {
    const entry = bucket.find(entry => entry.hash === hash && equals(entry.key, key));

    return entry !== undefined;
  } else {
    return bucket.hash === hash && equals(bucket.key, key);
  }
}

export function get<Key, Value>(self: HashMap<Key, Value>, key: Key): Value | undefined {
  const hash = hashCode(key);

  const bucket = self.buckets[hash % self.buckets.length];

  if (bucket === undefined) {
    return undefined;
  } else if (bucket instanceof Array) {
    const entry = bucket.find(entry => entry.hash === hash && equals(entry.key, key));

    if (entry === undefined) {
      return undefined;
    } else {
      return entry.value;
    }
  } else {
    if (bucket.hash === hash && equals(bucket.key, key)) {
      return bucket.value;
    } else {
      return undefined;
    }
  }
}

export function set<Key, Value>(self: HashMap<Key, Value>, key: Key, value: Value): HashMap<Key, Value> {
  const hash = hashCode(key);
  const newEntry: Entry<Key, Value> = {hash, key, value};
  const bucketIndex = hash % self.buckets.length;

  const bucket = self.buckets[bucketIndex];

  if (bucket === undefined) {
    // item not found, replace no bucket with bucket of one
    const bucketsCopy = self.buckets.slice();
    bucketsCopy[bucketIndex] = newEntry;

    return new HashMap(bucketsCopy, self.size + 1);
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

    if (entryIndex === -1) {
      // item not found, add new entry to this bucket
      if (self.size + 1 > self.buckets.length / 4) {
        // if there are an average of more than 4 items per bucket, increase the number of buckets
        const newBuckets = new Array(self.buckets.length * 2);

        for (const bucket of self.buckets) {
          if (bucket === undefined) {
            // do nothing
          } else if (bucket instanceof Array) {
            for (const entry of bucket) {
              const index = entry.hash % newBuckets.length;
              const existing = newBuckets[index];

              if (existing === undefined) {
                newBuckets[index] = entry;
              } else if (existing instanceof Array) {
                existing.push(entry);
              } else {
                newBuckets[index] = [existing, entry];
              }
            }
          } else {
            const index = bucket.hash % newBuckets.length;
            const existing = newBuckets[index];

            if (existing === undefined) {
              newBuckets[index] = bucket;
            } else if (existing instanceof Array) {
              existing.push(bucket);
            } else {
              newBuckets[index] = [existing, bucket];
            }
          }
        }

        // add the new item too
        const index = hash % newBuckets.length;
        const existing = newBuckets[index];

        if (existing === undefined) {
          newBuckets[index] = newEntry;
        } else if (existing instanceof Array) {
          existing.push(newEntry);
        } else {
          newBuckets[index] = [existing, newEntry];
        }

        return new HashMap(newBuckets, self.size + 1);
      } else {
        // fit within the same number of buckets
        const bucketsCopy = self.buckets.slice();
        const bucketCopy = bucket.slice();
        bucketCopy.push(newEntry);
        bucketsCopy[bucketIndex] = bucketCopy;

        return new HashMap(bucketsCopy, self.size + 1);
      }
    } else {
      // item found, replace it in this bucket
      const bucketsCopy = self.buckets.slice();
      const bucketCopy = bucket.slice();
      bucketCopy[entryIndex] = newEntry;
      bucketsCopy[bucketIndex] = bucketCopy;

      return new HashMap(bucketsCopy, self.size);
    }
  } else {
    if (bucket.hash === hash && equals(bucket.key, key)) {
      // item found, replace it in place

      const bucketsCopy = self.buckets.slice();
      bucketsCopy[bucketIndex] = newEntry;

      return new HashMap(bucketsCopy, self.size);
    } else {
      // item not found, turn this single item into an array of two items
      const bucketsCopy = self.buckets.slice();
      bucketsCopy[bucketIndex] = [bucket, newEntry];

      return new HashMap(bucketsCopy, self.size + 1);
    }
  }
}

export function update<Key, Value>(self: HashMap<Key, Value>, key: Key, updater: (old: Value | undefined) => Value | undefined): HashMap<Key, Value> {
  const hash = hashCode(key);
  const bucketIndex = hash % self.buckets.length;

  const bucket = self.buckets[bucketIndex];

  if (bucket === undefined) {
    // item not found, replace no bucket with bucket of one
    const bucketsCopy = self.buckets.slice();
    const value = updater(undefined);

    if (value === undefined) {
      // make no changes
      return self;
    }

    // set this item into the bucket and leave
    bucketsCopy[bucketIndex] = {hash, key, value};

    return new HashMap(bucketsCopy, self.size + 1);
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

    if (entryIndex === -1) {
      // item not found, add new entry to this bucket
      const value = updater(undefined);

      if (value === undefined) {
        // make no changes
        return self;
      }

      const newEntry = {hash, key, value};

      if (self.size + 1 > self.buckets.length / 4) {
        // if there are an average of more than 4 items per bucket, increase the number of buckets
        const newBuckets = new Array(self.buckets.length * 2);

        for (const bucket of self.buckets) {
          if (bucket === undefined) {
            // do nothing
          } else if (bucket instanceof Array) {
            for (const entry of bucket) {
              const index = entry.hash % newBuckets.length;
              const existing = newBuckets[index];

              if (existing === undefined) {
                newBuckets[index] = entry;
              } else if (existing instanceof Array) {
                existing.push(entry);
              } else {
                newBuckets[index] = [existing, entry];
              }
            }
          } else {
            const index = bucket.hash % newBuckets.length;
            const existing = newBuckets[index];

            if (existing === undefined) {
              newBuckets[index] = bucket;
            } else if (existing instanceof Array) {
              existing.push(bucket);
            } else {
              newBuckets[index] = [existing, bucket];
            }
          }
        }

        // add the new item too
        const index = hash % newBuckets.length;
        const existing = newBuckets[index];

        if (existing === undefined) {
          newBuckets[index] = newEntry;
        } else if (existing instanceof Array) {
          existing.push(newEntry);
        } else {
          newBuckets[index] = [existing, newEntry];
        }

        return new HashMap(newBuckets, self.size + 1);
      } else {
        // fit within the same number of buckets
        const bucketsCopy = self.buckets.slice();
        const bucketCopy = bucket.slice();
        bucketCopy.push(newEntry);
        bucketsCopy[bucketIndex] = bucketCopy;

        return new HashMap(bucketsCopy, self.size + 1);
      }
    } else {
      // item found, check it

      // start by preparing the new buckets
      const bucketsCopy = self.buckets.slice();
      const bucketCopy = bucket.slice();
      bucketsCopy[bucketIndex] = bucketCopy;

      const value = updater(bucket[entryIndex]!.value);

      if (value === undefined) {
        // remove the item from the bucket
        if (bucketCopy.length === 2) {
          bucketsCopy[bucketIndex] = bucketCopy[entryIndex === 0 ? 1 : 0];
        } else {
          bucketCopy.splice(entryIndex, 1);
        }
      } else {
        // fit the new value into the bucket copy
        bucketCopy[entryIndex] = {hash, key, value};
      }

      return new HashMap(bucketsCopy, self.size);
    }
  } else {
    if (bucket.hash === hash && equals(bucket.key, key)) {
      // item found, replace it in place
      const bucketsCopy = self.buckets.slice();
      const value = updater(bucket.value);

      if (value === undefined) {
        // remove the item
        bucketsCopy[bucketIndex] = undefined;
      } else {
        bucketsCopy[bucketIndex] = {hash, key, value};
      }

      return new HashMap(bucketsCopy, self.size);
    } else {
      // item not found, turn this single item into an array of two items
      const value = updater(undefined);

      if (value === undefined) {
        // make no change
        return self;
      }

      const bucketsCopy = self.buckets.slice();
      bucketsCopy[bucketIndex] = [bucket, {hash, key, value}];

      return new HashMap(bucketsCopy, self.size + 1);
    }
  }
}

export function remove<Key, Value>(self: HashMap<Key, Value>, key: Key): HashMap<Key, Value> {
  const hash = hashCode(key);
  const bucketIndex = hash % self.buckets.length;

  const bucket = self.buckets[bucketIndex];

  if (bucket === undefined) {
    // not found, change nothing

    return self;
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

    if (entryIndex === -1) {
      // not found, change nothing
      return self;
    } else {
      // found at index, remove from array
      const newBuckets = self.buckets.slice();

      if (bucket.length === 2) {
        // turn array into a single item
        newBuckets[bucketIndex] = bucket[entryIndex === 1 ? 0 : 1]!;
      } else {
        const newBucket = bucket.slice();
        newBucket.splice(entryIndex, 1);
        newBuckets[bucketIndex] = newBucket;
      }

      return new HashMap<Key, Value>(newBuckets, self.size - 1);
    }
  } else {
    if (bucket.hash === hash && equals(bucket.key, key)) {
      // found at bucket, replace with empty

      if (self.size === 1) {
        // we are removing the only item, just return the EMPTY starter map
        return empty();
      } else {
        const newBuckets = self.buckets.slice();
        newBuckets[bucketIndex] = undefined;
        return new HashMap<Key, Value>(newBuckets, self.size - 1);
      }
    } else {
      // not found, do nothing
      return self;
    }
  }
}

export function keys<Key, Value>(self: HashMap<Key, Value>): Array<Key> {
  const result = new Array<Key>();

  for (const bucket of self.buckets) {
    if (bucket instanceof Array) {
      for (const {key} of bucket) {
        result.push(key);
      }
    } else if (bucket !== undefined) {
      result.push(bucket.key);
    }
  }

  return result;
}

export function values<Key, Value>(self: HashMap<Key, Value>): Array<Value> {
  const result = new Array<Value>();

  for (const bucket of self.buckets) {
    if (bucket instanceof Array) {
      for (const {value} of bucket) {
        result.push(value);
      }
    } else if (bucket !== undefined) {
      result.push(bucket.value);
    }
  }

  return result;
}

export function* entriesOf<Key, Value>(buckets: Array<Bucket<Key, Value>>): IterableIterator<Entry<Key, Value>> {
  for (const bucket of buckets) {
    if (bucket instanceof Array) {
      yield* bucket;
    } else if (bucket !== undefined) {
      yield bucket;
    }
  }
}

export function merge<Key, Value>(self: HashMap<Key, Value>, other: HashMap<Key, Value>): HashMap<Key, Value> {
  if (other.size === 0) {
    return self;
  } else if (self.size === 0) {
    return other;
  } else {
    // copy the outer array only once (unless we need to resize), copy children as needed
    let bucketsCopy = self.buckets.slice();
    let size = self.size;

    for (const newEntry of entriesOf(other.buckets)) {
      const {hash, key} = newEntry;
      const bucketIndex = hash % bucketsCopy.length;

      const bucket = bucketsCopy[bucketIndex];

      if (bucket === undefined) {
        // item not found, replace no bucket with bucket of one
        bucketsCopy[bucketIndex] = newEntry;
        size++;
      } else if (bucket instanceof Array) {
        const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

        if (entryIndex === -1) {
          // item not found, add new entry to this bucket
          if (size + 1 > bucketsCopy.length / 4) {
            // if there are an average of more than 4 items per bucket, increase the number of buckets
            const oldBuckets = bucketsCopy;
            bucketsCopy = new Array(bucketsCopy.length * 2);

            for (const bucket of oldBuckets) {
              if (bucket === undefined) {
                // do nothing
              } else if (bucket instanceof Array) {
                for (const entry of bucket) {
                  const index = entry.hash % bucketsCopy.length;
                  const existing = bucketsCopy[index];

                  if (existing === undefined) {
                    bucketsCopy[index] = entry;
                  } else if (existing instanceof Array) {
                    existing.push(entry);
                  } else {
                    bucketsCopy[index] = [existing, entry];
                  }
                }
              } else {
                const index = bucket.hash % bucketsCopy.length;
                const existing = bucketsCopy[index];

                if (existing === undefined) {
                  bucketsCopy[index] = bucket;
                } else if (existing instanceof Array) {
                  existing.push(bucket);
                } else {
                  bucketsCopy[index] = [existing, bucket];
                }
              }
            }

            size++;
          } else {
            // fit within the same number of buckets
            const bucketCopy = bucket.slice();
            bucketCopy.push(newEntry);
            bucketsCopy[bucketIndex] = bucketCopy;

            size++;
          }
        } else {
          // item found, replace it in this bucket
          const bucketCopy = bucket.slice();
          bucketCopy[entryIndex] = newEntry;
          bucketsCopy[bucketIndex] = bucketCopy;
        }
      } else {
        if (bucket.hash === hash && equals(bucket.key, key)) {
          // item found, replace it in place
          bucketsCopy[bucketIndex] = newEntry;
        } else {
          // item not found, turn this single item into an array of two items
          bucketsCopy[bucketIndex] = [bucket, newEntry];

          size++;
        }
      }
    }

    return new HashMap(bucketsCopy, size);
  }
}

export function forEach<Key, Value>(self: HashMap<Key, Value>, action: (value: Value, key: Key) => void): void {
  for (const {key, value} of entriesOf(self.buckets)) {
    action(value, key);
  }
}
