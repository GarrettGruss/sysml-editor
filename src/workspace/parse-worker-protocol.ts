import type { ModelSyntaxError } from "../model/types.js";
import type { SerializedModel } from "../model/serialize.js";

export interface WorkerData {
  /** Directory of the standard library; its `.sysml` files are parsed to warm the worker. */
  libraryDir?: string;
  /** Set to false to skip warm-up (tests, benchmarks of a cold worker). */
  warm?: boolean;
}

export interface WorkerRequest {
  id: number;
  uri: string;
  version: number;
  text: string;
}

export type WorkerReply =
  | {
      type: "result";
      id: number;
      uri: string;
      version: number;
      errors: ModelSyntaxError[];
      /** Present when the text is valid. */
      model?: SerializedModel;
      /** Parse time in the worker. */
      ms: number;
    }
  | { type: "failed"; id: number; message: string }
  | { type: "warmed"; ms: number; files: number };
