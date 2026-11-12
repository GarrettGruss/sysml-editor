import { parse, tryFastParse } from "../parser/parse.js";
import { documentFromParse, mapSyntaxErrors } from "./antlr-builder.js";
import { emptyModel, type DocumentParser, type ParsedDocument } from "./types.js";

export const DETAILS_PENDING_MESSAGE = "Syntax error (details pending)";

/**
 * The ANTLR document parser. With `fastOnly`, only the snapshot-backed fast path runs: a failure
 * returns an empty model, one provisional error at the bail position, and `detailsPending`, and
 * the caller gets the precise result elsewhere (the parse worker). Otherwise the full synchronous
 * parse runs on this thread.
 */
export const antlrDocumentParser: DocumentParser = (uri, text, opts): ParsedDocument => {
  if (opts?.fastOnly) {
    const f = tryFastParse(text);
    if (f.ok) return documentFromParse(uri, text, f.result);
    const errors = mapSyntaxErrors(text, [{ ...f.error, message: DETAILS_PENDING_MESSAGE }]);
    return { model: emptyModel(uri), errors, detailsPending: true };
  }
  return documentFromParse(uri, text, parse(text));
};
