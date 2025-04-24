import { equals, hashCode } from '../../runtime/reflect.js';

type Entry<Key, Value> = { hash_: number, key_: Key, value_: Value };
type Bucket<Key, Value> = undefined | Entry<Key, Value> | Array<Entry<Key, Value>>;

export class HashMap<Key, Value> {
  readonly size_: number;
  readonly buckets_: Array<Bucket<Key, Value>>;

  constructor(buckets: Array<Bucket<Key, Value>>, size: number) {
    this.buckets_ = buckets;
    this.size_ = size;
  }
}

export const emptyMap = new HashMap<never, never>(new Array(3), 0);

export function from<Key, Value>(pairs: Iterable<readonly [Key, Value]>): HashMap<Key, Value> {
  let bucketsCopy = new Array<Bucket<Key, Value>>(3);
  let size = 0;

  for (const [key, value] of pairs) {
    const hash = hashCode(key);
    const newEntry = {hash_: hash, key_: key, value_: value};
    const bucketIndex = hash % bucketsCopy.length;

    const bucket = bucketsCopy[bucketIndex];

    if (bucket === undefined) {
      // item not found, replace no bucket with bucket of one
      bucketsCopy[bucketIndex] = newEntry;
      size++;
    } else if (bucket instanceof Array) {
      const entryIndex = bucket.findIndex(entry => entry.hash_ === hash && equals(entry.key_, key));

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
                const index = entry.hash_ % bucketsCopy.length;
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
              const index = bucket.hash_ % bucketsCopy.length;
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
      if (bucket.hash_ === hash && equals(bucket.key_, key)) {
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

  const bucket = self.buckets_[hash % self.buckets_.length];

  if (bucket === undefined) {
    return false;
  } else if (bucket instanceof Array) {
    const entry = bucket.find(entry => entry.hash_ === hash && equals(entry.key_, key));

    return entry !== undefined;
  } else {
    return bucket.hash_ === hash && equals(bucket.key_, key);
  }
}

export function get<Key, Value>(self: HashMap<Key, Value>, key: Key): Value | undefined {
  const hash = hashCode(key);

  const bucket = self.buckets_[hash % self.buckets_.length];

  if (bucket === undefined) {
    return undefined;
  } else if (bucket instanceof Array) {
    const entry = bucket.find(entry => entry.hash_ === hash && equals(entry.key_, key));

    if (entry === undefined) {
      return undefined;
    } else {
      return entry.value_;
    }
  } else {
    if (bucket.hash_ === hash && equals(bucket.key_, key)) {
      return bucket.value_;
    } else {
      return undefined;
    }
  }
}

export function set<Key, Value>(self: HashMap<Key, Value>, key: Key, value: Value): HashMap<Key, Value> {
  const hash = hashCode(key);
  const newEntry: Entry<Key, Value> = {hash_: hash, key_: key, value_: value};
  const bucketIndex = hash % self.buckets_.length;

  const bucket = self.buckets_[bucketIndex];

  if (bucket === undefined) {
    // item not found, replace no bucket with bucket of one
    const bucketsCopy = self.buckets_.slice();
    bucketsCopy[bucketIndex] = newEntry;

    return new HashMap(bucketsCopy, self.size_ + 1);
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash_ === hash && equals(entry.key_, key));

    if (entryIndex === -1) {
      // item not found, add new entry to this bucket
      if (self.size_ + 1 > self.buckets_.length / 4) {
        // if there are an average of more than 4 items per bucket, increase the number of buckets
        const newBuckets = new Array(self.buckets_.length * 2);

        for (const bucket of self.buckets_) {
          if (bucket === undefined) {
            // do nothing
          } else if (bucket instanceof Array) {
            for (const entry of bucket) {
              const index = entry.hash_ % newBuckets.length;
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
            const index = bucket.hash_ % newBuckets.length;
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

        return new HashMap(newBuckets, self.size_ + 1);
      } else {
        // fit within the same number of buckets
        const bucketsCopy = self.buckets_.slice();
        const bucketCopy = bucket.slice();
        bucketCopy.push(newEntry);
        bucketsCopy[bucketIndex] = bucketCopy;

        return new HashMap(bucketsCopy, self.size_ + 1);
      }
    } else {
      // item found, replace it in this bucket
      const bucketsCopy = self.buckets_.slice();
      const bucketCopy = bucket.slice();
      bucketCopy[entryIndex] = newEntry;
      bucketsCopy[bucketIndex] = bucketCopy;

      return new HashMap(bucketsCopy, self.size_);
    }
  } else {
    if (bucket.hash_ === hash && equals(bucket.key_, key)) {
      // item found, replace it in place

      const bucketsCopy = self.buckets_.slice();
      bucketsCopy[bucketIndex] = newEntry;

      return new HashMap(bucketsCopy, self.size_);
    } else {
      // item not found, turn this single item into an array of two items
      const bucketsCopy = self.buckets_.slice();
      bucketsCopy[bucketIndex] = [bucket, newEntry];

      return new HashMap(bucketsCopy, self.size_ + 1);
    }
  }
}

export function update<Key, Value>(self: HashMap<Key, Value>, key: Key, updater: (old: Value | undefined) => Value | undefined): HashMap<Key, Value> {
  const hash = hashCode(key);
  const bucketIndex = hash % self.buckets_.length;

  const bucket = self.buckets_[bucketIndex];

  if (bucket === undefined) {
    // item not found, replace no bucket with bucket of one
    const bucketsCopy = self.buckets_.slice();
    const value = updater(undefined);

    if (value === undefined) {
      // make no changes
      return self;
    }

    // set this item into the bucket and leave
    bucketsCopy[bucketIndex] = {hash_: hash, key_: key, value_: value};

    return new HashMap(bucketsCopy, self.size_ + 1);
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash_ === hash && equals(entry.key_, key));

    if (entryIndex === -1) {
      // item not found, add new entry to this bucket
      const value = updater(undefined);

      if (value === undefined) {
        // make no changes
        return self;
      }

      const newEntry = {hash_: hash, key_: key, value_: value};

      if (self.size_ + 1 > self.buckets_.length / 4) {
        // if there are an average of more than 4 items per bucket, increase the number of buckets
        const newBuckets = new Array(self.buckets_.length * 2);

        for (const bucket of self.buckets_) {
          if (bucket === undefined) {
            // do nothing
          } else if (bucket instanceof Array) {
            for (const entry of bucket) {
              const index = entry.hash_ % newBuckets.length;
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
            const index = bucket.hash_ % newBuckets.length;
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

        return new HashMap(newBuckets, self.size_ + 1);
      } else {
        // fit within the same number of buckets
        const bucketsCopy = self.buckets_.slice();
        const bucketCopy = bucket.slice();
        bucketCopy.push(newEntry);
        bucketsCopy[bucketIndex] = bucketCopy;

        return new HashMap(bucketsCopy, self.size_ + 1);
      }
    } else {
      // item found, check it

      // start by preparing the new buckets
      const bucketsCopy = self.buckets_.slice();
      const bucketCopy = bucket.slice();
      bucketsCopy[bucketIndex] = bucketCopy;

      const value = updater(bucket[entryIndex]!.value_);

      if (value === undefined) {
        // remove the item from the bucket
        if (bucketCopy.length === 2) {
          bucketsCopy[bucketIndex] = bucketCopy[entryIndex === 0 ? 1 : 0];
        } else {
          bucketCopy.splice(entryIndex, 1);
        }
      } else {
        // fit the new value into the bucket copy
        bucketCopy[entryIndex] = {hash_: hash, key_: key, value_: value};
      }

      return new HashMap(bucketsCopy, self.size_);
    }
  } else {
    if (bucket.hash_ === hash && equals(bucket.key_, key)) {
      // item found, replace it in place
      const bucketsCopy = self.buckets_.slice();
      const value = updater(bucket.value_);

      if (value === undefined) {
        // remove the item
        bucketsCopy[bucketIndex] = undefined;
      } else {
        bucketsCopy[bucketIndex] = {hash_: hash, key_: key, value_: value};
      }

      return new HashMap(bucketsCopy, self.size_);
    } else {
      // item not found, turn this single item into an array of two items
      const value = updater(undefined);

      if (value === undefined) {
        // make no change
        return self;
      }

      const bucketsCopy = self.buckets_.slice();
      bucketsCopy[bucketIndex] = [bucket, {hash_: hash, key_: key, value_: value}];

      return new HashMap(bucketsCopy, self.size_ + 1);
    }
  }
}

export function remove<Key, Value>(self: HashMap<Key, Value>, key: Key): HashMap<Key, Value> {
  const hash = hashCode(key);
  const bucketIndex = hash % self.buckets_.length;

  const bucket = self.buckets_[bucketIndex];

  if (bucket === undefined) {
    // not found, change nothing

    return self;
  } else if (bucket instanceof Array) {
    const entryIndex = bucket.findIndex(entry => entry.hash_ === hash && equals(entry.key_, key));

    if (entryIndex === -1) {
      // not found, change nothing
      return self;
    } else {
      // found at index, remove from array
      const newBuckets = self.buckets_.slice();

      if (bucket.length === 2) {
        // turn array into a single item
        newBuckets[bucketIndex] = bucket[entryIndex === 1 ? 0 : 1]!;
      } else {
        const newBucket = bucket.slice();
        newBucket.splice(entryIndex, 1);
        newBuckets[bucketIndex] = newBucket;
      }

      return new HashMap<Key, Value>(newBuckets, self.size_ - 1);
    }
  } else {
    if (bucket.hash_ === hash && equals(bucket.key_, key)) {
      // found at bucket, replace with empty

      if (self.size_ === 1) {
        // we are removing the only item, just return the EMPTY starter map
        return emptyMap;
      } else {
        const newBuckets = self.buckets_.slice();
        newBuckets[bucketIndex] = undefined;
        return new HashMap<Key, Value>(newBuckets, self.size_ - 1);
      }
    } else {
      // not found, do nothing
      return self;
    }
  }
}

export function keys<Key, Value>(self: HashMap<Key, Value>): Array<Key> {
  const result = new Array<Key>();

  for (const bucket of self.buckets_) {
    if (bucket instanceof Array) {
      for (const {key_: key} of bucket) {
        result.push(key);
      }
    } else if (bucket !== undefined) {
      result.push(bucket.key_);
    }
  }

  return result;
}

export function values<Key, Value>(self: HashMap<Key, Value>): Array<Value> {
  const result = new Array<Value>();

  for (const bucket of self.buckets_) {
    if (bucket instanceof Array) {
      for (const {value_: value} of bucket) {
        result.push(value);
      }
    } else if (bucket !== undefined) {
      result.push(bucket.value_);
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
  if (other.size_ === 0) {
    return self;
  } else if (self.size_ === 0) {
    return other;
  } else {
    // copy the outer array only once (unless we need to resize), copy children as needed
    let bucketsCopy = self.buckets_.slice();
    let size = self.size_;

    for (const newEntry of entriesOf(other.buckets_)) {
      const {hash_, key_} = newEntry;
      const bucketIndex = hash_ % bucketsCopy.length;

      const bucket = bucketsCopy[bucketIndex];

      if (bucket === undefined) {
        // item not found, replace no bucket with bucket of one
        bucketsCopy[bucketIndex] = newEntry;
        size++;
      } else if (bucket instanceof Array) {
        const entryIndex = bucket.findIndex(entry => entry.hash_ === hash_ && equals(entry.key_, key_));

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
                  const index = entry.hash_ % bucketsCopy.length;
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
                const index = bucket.hash_ % bucketsCopy.length;
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
        if (bucket.hash_ === hash_ && equals(bucket.key_, key_)) {
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
  for (const {key_: key, value_: value} of entriesOf(self.buckets_)) {
    action(value, key);
  }
}
