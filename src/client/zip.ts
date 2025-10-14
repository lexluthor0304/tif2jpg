import { zipSync } from 'fflate';

export class ZipBuilder {
  private entries: Record<string, Uint8Array> = {};

  async addFile(name: string, blob: Blob): Promise<void> {
    const array = new Uint8Array(await blob.arrayBuffer());
    this.entries[name] = array;
  }

  isEmpty(): boolean {
    return Object.keys(this.entries).length === 0;
  }

  async toBlob(): Promise<Blob> {
    if (this.isEmpty()) {
      throw new Error('No files added to ZIP');
    }
    const zipped = zipSync(this.entries, { level: 6 });
    return new Blob([zipped], { type: 'application/zip' });
  }
}
