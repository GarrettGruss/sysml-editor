package Rescue {
    private import DoDAF::*;
    private import ScalarValues::*;

    doc /* A small search and rescue coordination architecture. Dispatch hears of an incident and sends a rescue team. */

    @ArchitectureDescription {
        purpose = "Show how an incident is received, dispatched and resolved";
        scope = "One regional rescue service";
        viewpointName = "Search and rescue";
        dateCreated = "2026-01-10";
        dateModified = "2026-02-01";
    }

    // Capabilities (CV-1, CV-2)
    #Capability part RescueCapability {
        doc /* Recover people in distress quickly. */
        @Vision { text = "Every call is answered within one minute."; }
        #Capability part DispatchCapability { doc /* Assign the nearest team. */ @Vision { text = "No call is left waiting."; } }
        #Capability part LocateCapability { doc /* Find the position of the caller. */ @Vision { text = "Position known within 50 metres."; } }
    }

    // Organizations (OV-4)
    #Organization part RescueService {
        doc /* The regional rescue service. */
        #Organization part DispatchCenter { doc /* Takes calls and assigns teams. */ }
        #Organization part FieldDivision {
            doc /* Teams that go out. */
            #Organization part Team1 { doc /* First response team. */ }
        }
    }

    // Operational performers (OV-1, OV-2, OV-6c)
    #OperationalPerformer part dispatcher { doc /* Person who assigns the team. */ }
    #OperationalPerformer part responder { doc /* Person who reaches the incident. */ }
    #OperationalPerformer part caller { doc /* Person who reports the incident. */ }
    #OperationalExchange item incidentReport { doc /* The report that moves between performers. */ }

    connection callLink connect caller to dispatcher;
    connection dispatchLink connect dispatcher to responder;
    message reportIncident of IncidentReport from caller to dispatcher;
    message sendTeam from dispatcher to responder;

    // Operational activities (OV-5a, OV-5b)
    #OperationalActivity action HandleIncident {
        doc /* Receive, dispatch and resolve an incident. */
        action receive { doc /* Take the call. */ }
        action dispatch { doc /* Send a team. */ }
        action resolve { doc /* Resolve the incident. */ }
        first receive then dispatch;
        first dispatch then resolve;
    }

    // Systems (SV-1, SV-2, SV-10c)
    part def CallSystem { port intake; }
    part def MapSystem { port feed; }
    #System part callSystem : CallSystem { doc /* Records calls. */ }
    #System part mapSystem : MapSystem { doc /* Shows positions. */ }
    connection feedLink connect callSystem.intake to mapSystem.feed;

    // System functions (SV-4, SV-5a)
    #SystemFunction action RecordCall { doc /* Store the call details. */ }
    #SystemFunction action ShowPosition { doc /* Display the caller position. */ }
    allocate RecordCall to HandleIncident;
    allocate ShowPosition to HandleIncident;

    // Standards (StdV-1)
    #Standard part iso22320 {
        doc /* Emergency management standard. */
        attribute id = "ISO 22320";
        attribute title = "Emergency management";
    }
    part audit { ref basis ::> iso22320; }

    // Data (DIV-2)
    item def IncidentReport {
        attribute id : String;
        attribute location : String;
        attribute notes : String [0..1];
    }
}
