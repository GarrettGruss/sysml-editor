/*
 * Metadata used by the SysML Editor's requirements document view (a copy may be placed in a workspace for other tools).
 * DocumentRoot: title and version of the document that a package renders as.
 * Appendix: the package renders as an appendix, after all sections.
 */
library package DocumentAnnotations {
    private import ScalarValues::String;
    metadata def DocumentRoot {
        attribute title : String;
        attribute version : String;
    }
    metadata def Appendix;
}
