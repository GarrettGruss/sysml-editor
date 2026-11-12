package Requirements {
  requirement def <'R1'> VehicleMass {
    doc /* The total mass of the vehicle shall not exceed 2000 kg at the maximum load defined for its class. */
  }
  requirement def <'R1.1'> EngineMass {
    doc /* The engine mass shall not exceed 400 kg. */
  }
}

package Design {
  private import Requirements::*;

  part def Vehicle;
  part def Engine;

  part vehicle : Vehicle {
    part engine : Engine;
  }

  satisfy VehicleMass by vehicle;
  satisfy EngineMass by vehicle.engine;

  #derivation connection {
    end #original ::> VehicleMass;
    end #derive ::> EngineMass;
  }

  verification def MassTest {
    objective {
      verify VehicleMass;
    }
  }
}
