package Domain {
    item def ShipCommand;
    part def MiningFrigates { port controlPort; }
    action def ExecuteWarpDrive;
}

package Fleet {
    private import Domain::*;

    state def FleetStates {
        in item warpCommand : Domain::ShipCommand;
        part miningFrigates : MiningFrigates;
        entry; then docked;

        state docked;
        state underway {
            entry; then cruising;
            state cruising;
            state warping;
            transition first cruising then warping;
        }

        // Many self-transitions with long labels, on a leaf and on a container.
        transition t1 first docked accept warpCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeWarpDrive : ExecuteWarpDrive then docked;
        transition t2 first docked accept scanCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeScan : ExecuteWarpDrive then docked;
        transition t3 first docked accept defendCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeDefense : ExecuteWarpDrive then docked;
        transition t4 first docked accept mineCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeMining : ExecuteWarpDrive then docked;
        transition t5 first docked accept haulCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeHaul : ExecuteWarpDrive then docked;
        transition t6 first docked accept repairCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeRepair : ExecuteWarpDrive then docked;
        transition u1 first underway accept warpCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeWarpDrive : ExecuteWarpDrive then underway;
        transition u2 first underway accept scanCommand : Domain::ShipCommand via miningFrigates.controlPort do action executeScan : ExecuteWarpDrive then underway;
        transition d1 first docked then underway;
    }
}
