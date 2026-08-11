/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} data
* @returns {boolean}
*/
export function is_valid_jpeg(data: Uint8Array): boolean;
/**
* @param {Uint8Array} data
* @returns {boolean}
*/
export function is_valid_webp(data: Uint8Array): boolean;
/**
* @param {Uint8Array} rgba_data
* @param {number} width
* @param {number} height
* @param {number} quality
* @returns {Uint8Array}
*/
export function encode_avif(rgba_data: Uint8Array, width: number, height: number, quality: number): Uint8Array;
/**
* Versión actualizada para el pipeline AVIF
* @returns {string}
*/
export function version(): string;
/**
* Verifica firma AVIF (ISO Base Media File Format)
* Busca la marca 'ftypavif' o 'ftypavis'
* @param {Uint8Array} data
* @returns {boolean}
*/
export function is_valid_avif(data: Uint8Array): boolean;
/**
* @param {Uint8Array} data
* @returns {number}
*/
export function byte_size(data: Uint8Array): number;
/**
*/
export function main(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly byte_size: (a: number, b: number) => number;
  readonly encode_avif: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly is_valid_avif: (a: number, b: number) => number;
  readonly is_valid_jpeg: (a: number, b: number) => number;
  readonly is_valid_webp: (a: number, b: number) => number;
  readonly main: () => void;
  readonly version: (a: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
