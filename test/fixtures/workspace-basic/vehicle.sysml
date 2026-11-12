package Vehicle {
  part def Engine;
  part def Car {
    part engine : Engine;
    part wheels : Wheel [4];
  }
  part def Wheel;
}
