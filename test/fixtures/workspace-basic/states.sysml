package Lamp {
  attribute def TurnOn;
  attribute def TurnOff;
  attribute def Overheat;

  action logEvent;
  action coolDown;

  state def LampStates;

  state lamp : LampStates {
    attribute powerAvailable;

    first start then off;

    state off;
    transition off_to_on
      first off
      accept TurnOn
      if powerAvailable
      do action logEvent
      then operating;

    state operating {
      entry action coolDown;
      do action glow;
      exit action dim;

      state low;
      state high;
      transition low_to_high first low accept Overheat then high;
    }

    transition on_to_off first operating accept TurnOff then off;
  }
}
