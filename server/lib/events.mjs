function toSseChunk(event, payload) {
  const lines = [`event: ${event}`];
  const json = JSON.stringify(payload ?? null);
  json.split('\n').forEach((line) => lines.push(`data: ${line}`));
  lines.push('', '');
  return lines.join('\n');
}

export class EventHub {
  constructor() {
    this.clients = new Set();
  }

  addClient(res) {
    this.clients.add(res);
    res.write(': connected\n\n');
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  emit(event, payload) {
    const chunk = toSseChunk(event, payload);
    for (const res of this.clients) {
      try {
        res.write(chunk);
      } catch (error) {
        this.clients.delete(res);
      }
    }
  }

  log(entry) {
    this.emit('log', entry);
  }

  status(payload) {
    this.emit('status', payload);
  }

  runtime(payload) {
    this.emit('runtime', payload);
  }

  data(payload) {
    this.emit('data', payload);
  }

  update(payload) {
    this.emit('update', payload);
  }
}
