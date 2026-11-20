/*
 * DoDAF 2.02 annotation library (design D76, D85).
 *
 * Annotate model elements with these metadata definitions, for example
 *   #OperationalPerformer part soldier : Soldier;
 * The DoDAF generator selects elements only by these annotations; it never guesses roles from names.
 * The names follow UAF. Each definition below notes the DoDAF 2.02 term it stands for.
 */
package DoDAF {
    private import ScalarValues::*;

    /* AV-1 Overview and Summary Information. Put on the architecture root package. */
    metadata def ArchitectureDescription {
        doc /* DoDAF AV-1. */
        attribute purpose : String;
        attribute scope : String;
        attribute viewpointName : String;
        attribute dateCreated : String;
        attribute dateModified : String;
    }

    /* CV-2 Capability Taxonomy element; the capability text is its documentation. */
    metadata def Capability {
        doc /* DoDAF Capability (CV-1, CV-2). */
    }

    /* CV-1 Vision text attached to a capability. */
    metadata def Vision {
        doc /* DoDAF CV-1 Vision. */
        attribute text : String;
    }

    /* DoDAF Performer in OV-1 and OV-2. */
    metadata def OperationalPerformer {
        doc /* DoDAF Performer (operational). */
    }

    /* DoDAF Operational Activity in OV-5a and OV-5b. */
    metadata def OperationalActivity {
        doc /* DoDAF Operational Activity. */
    }

    /* DoDAF Resource Flow in OV-2 (an item flowing between performers). */
    metadata def OperationalExchange {
        doc /* DoDAF Operational Resource Flow. */
    }

    /* DoDAF Organization in OV-4. */
    metadata def Organization {
        doc /* DoDAF Organization. */
    }

    /* DoDAF System (resource performer) in SV-1 and SV-2. */
    metadata def System {
        doc /* DoDAF System. */
    }

    /* DoDAF System Function in SV-4 and SV-5a. */
    metadata def SystemFunction {
        doc /* DoDAF System Function (SV-4 function). */
    }

    /* DoDAF Standard in StdV-1. */
    metadata def Standard {
        doc /* DoDAF Standard. */
    }

    /* OV-1 graphic supplied by the author; copied into the output instead of drawing a diagram (D81). */
    metadata def OV1Graphic {
        doc /* DoDAF OV-1 graphic. */
        attribute path : String;
    }
}
