package EdAdd {
  // keep me
  part def Engine;
  part def Vehicle {
    part engine : Engine;
    port drive;
    part spare;
  }
  part vehicle1 : Vehicle {
    part battery;
  }
  part vehicle2 : Vehicle;
}
