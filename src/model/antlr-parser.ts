import { parse, tryFastParse } from "../parser/parse.js";
import { documentFromParse, mapSyntaxErrors } from "./antlr-builder.js";
import { emptyModel, type DocumentParser, type ParsedDocument } from "./types.js";

export const DETAILS_PENDING_MESSAGE = "Syntax error (details pending)";

/**
 * Texts up to this length (UTF-16 units, about 800 lines) also get the full-LL retry on the fast
 * path; longer ones go straight to the details provider, to bound main-thread time.
 */
export const LL_RETRY_MAX_CHARS = 32_000;

/**
 * The ANTLR document parser. With `fastOnly`, only the snapshot-backed fast path runs (SLL, then
 * for short texts or with `fullContextRetry` also full LL, both bailing on the first error): a failure
 * returns an empty model, one provisional error at the bail position, and `detailsPending`, and
 * the caller gets the precise result elsewhere (the parse worker). Otherwise the full synchronous
 * parse runs on this thread.
 */
export const antlrDocumentParser: DocumentParser = (uri, text, opts): ParsedDocument => {
  if (opts?.fastOnly) {
    const f = tryFastParse(text, { ll: opts.fullContextRetry || text.length <= LL_RETRY_MAX_CHARS });
    if (f.ok) return documentFromParse(uri, text, f.result);
    const errors = mapSyntaxErrors(text, [{ ...f.error, message: DETAILS_PENDING_MESSAGE }]);
    return { model: emptyModel(uri), errors, detailsPending: true };
  }
  return documentFromParse(uri, text, parse(text));
};
