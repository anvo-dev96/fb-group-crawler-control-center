import fs from 'node:fs/promises';
import path from 'node:path';

import { defaultState } from './defaults.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = defaultState();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        ...defaultState(),
        ...parsed,
        configUi: {
          ...defaultState().configUi,
          ...(parsed?.configUi || {}),
        },
      };
    } catch (error) {
      await this.save();
    }
    return this.data;
  }

  snapshot() {
    return clone(this.data);
  }

  async save() {
    this.data.meta = {
      ...(this.data.meta || {}),
      updatedAt: new Date().toISOString(),
    };
    const raw = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.filePath, raw, 'utf8');
    return this.data;
  }

  async set(partial) {
    this.data = {
      ...this.data,
      ...partial,
      configUi: partial.configUi
        ? { ...this.data.configUi, ...partial.configUi }
        : this.data.configUi,
    };
    await this.save();
    return this.snapshot();
  }

  async mutate(mutator) {
    const next = await mutator(this.data);
    if (next && typeof next === 'object') this.data = next;
    await this.save();
    return this.snapshot();
  }
}
