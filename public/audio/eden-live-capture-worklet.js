// Captures only mono Float32 blocks. Permission/lifecycle/forwarding are owned by
// the explicit Call Eden controller; no network, storage or recording here.
class EdenLiveCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.block = new Float32Array(1024); this.offset = 0; this.enabled = false; this.epoch = 0;
    this.port.onmessage = event => {
      this.enabled = event.data?.enabled === true; this.epoch = event.data?.epoch; this.offset = 0;
    };
  }
  process(inputs) {
    if (!this.enabled) return true;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.block[this.offset++] = value;
      if (this.offset === this.block.length) { this.port.postMessage({frame: this.block, epoch: this.epoch}, [this.block.buffer]); this.block = new Float32Array(1024); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor('eden-live-capture', EdenLiveCapture);
