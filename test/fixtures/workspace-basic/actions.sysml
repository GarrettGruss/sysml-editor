package Delivery {
  item def Parcel;
  attribute def Weight;

  action def Pack { out parcel : Parcel; }
  action def Ship { in parcel : Parcel; }

  action deliverOrder {
    first start;
    then action pack : Pack {
      out item parcel : Parcel;
    }
    then decide;
      if pack.weight >= 100 then retry;
      else ship;
    action retry;
    then pack;
    action ship : Ship {
      in item parcel : Parcel;
    }
    then done;
    flow of Parcel from pack.parcel to ship.parcel;
  }
}
