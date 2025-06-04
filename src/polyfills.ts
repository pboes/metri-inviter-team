import { Buffer } from "buffer";

// Don't manually set window.global or window.ethereum
// Only set Buffer which is needed
window.Buffer = Buffer;
