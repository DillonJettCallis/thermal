import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { List } from 'immutable';

export class File {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  get fileName(): string {
    return basename(this.#path);
  }

  get fileNameWithoutExtension(): string {
    return basename(this.#path, this.extension);
  }

  /**
   * May be an empty string if there is no extension
   */
  get extension(): string {
    return extname(this.#path);
  }

  child(name: string): File {
    return new File(join(this.#path, name));
  }

  listFiles(): List<File> {
    return List(readdirSync(this.#path))
      .map(it => this.child(it));
  }

  readText(): string {
    return readFileSync(this.#path, { encoding: 'utf-8' });
  }
}
